import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, clientIp, handle, requireApi } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import { sha256 } from '@/lib/server/crypto'
import { emitEvent } from '@/lib/server/n8n'
import { BUCKET, uploadBytes } from '@/lib/server/storage'
import { buildEvaluationPdf, parsePngDataUrl } from '@/lib/server/pdf-eval'
import { missingItems, naturalCompare } from '@/components/judge/progress'
import type { Assignment, Company, Criterion, Judge, Stage } from '@/lib/types'

// J-07 평가표 최종 제출 (4-1): 배정 기업 전원 평가 완료 검증(Q13) → 평가표 PDF·서명·해시 → evaluation_submissions
// 제출 후에는 judge_can_write() 가 점수·심사평 쓰기를 거부한다 (관리자 /api/eval/reopen 으로만 해제)
const Body = z.object({ stage_id: z.string().min(1), signature: z.string().min(1) })

type ScoreRow = { assignment_id: string; criterion_id: string; score: number | string | null; comment: string | null }
type ReviewRow = { assignment_id: string; overall_comment: string | null }

async function all<T>(make: (f: number, t: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) {
  const out: T[] = []
  for (let f = 0; ; f += 1000) {
    const { data, error } = await make(f, f + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return out
  }
}

export const POST = handle(async (req: Request) => {
  const { supabase, user, profile } = await requireApi('judge')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '요청 형식이 올바르지 않습니다.')
  const { stage_id } = parsed.data
  const png = parsePngDataUrl(parsed.data.signature)
  if (!png) throw new ApiError(400, '서명 이미지가 올바르지 않습니다.')
  const admin = supabaseAdmin()

  const { data: stageRow } = await admin.from('stages').select('*').eq('id', stage_id).maybeSingle()
  const stage = stageRow as Stage | null
  if (!stage) throw new ApiError(404, '단계를 찾을 수 없습니다.')
  const { data: judgeRow } = await admin.from('judges').select('*').eq('program_id', stage.program_id).eq('user_id', user.id).maybeSingle()
  const judge = judgeRow as Judge | null
  if (!judge) throw new ApiError(403, '이 단계의 심사위원이 아닙니다.')
  if (stage.status !== 'evaluating') throw new ApiError(409, '평가중 단계에서만 최종 제출할 수 있습니다.')

  const { data: signed } = await supabase.rpc('has_signed_all', { p_judge_id: judge.id })
  if (!signed) throw new ApiError(403, '동의서 서명이 필요합니다.')

  const { data: prev } = await admin.from('evaluation_submissions').select('id, status')
    .eq('judge_id', judge.id).eq('stage_id', stage.id).maybeSingle()
  if (prev?.status === 'submitted') throw new ApiError(409, '이미 최종 제출했습니다. 수정하려면 관리자 재오픈이 필요합니다.')

  const [{ data: asg }, { data: crit }, { data: program }] = await Promise.all([
    admin.from('assignments').select('*, companies(id, name, blind_code)').eq('stage_id', stage.id).eq('judge_id', judge.id),
    admin.from('criteria').select('*').eq('stage_id', stage.id).order('order_no'),
    admin.from('programs').select('id, title').eq('id', stage.program_id).single(),
  ])
  type Asg = Assignment & { companies: Pick<Company, 'id' | 'name' | 'blind_code'> | null }
  const assignments = ((asg ?? []) as Asg[]).filter(a => !a.conflict)
  const criteria = ((crit ?? []) as Criterion[]).map(c => ({ ...c, max_score: Number(c.max_score) }))
  if (assignments.length === 0) throw new ApiError(409, '평가할 배정 기업이 없습니다.')
  if (criteria.length === 0) throw new ApiError(409, '평가항목이 설정되지 않았습니다.')

  const ids = assignments.map(a => a.id)
  const [scores, reviews] = await Promise.all([
    // 배정 id 목록 대신 조인 필터 (URL 길이 제한 회피)
    all<ScoreRow>((f, t) => admin.from('scores').select('assignment_id, criterion_id, score, comment, assignments!inner(stage_id, judge_id)')
      .eq('assignments.stage_id', stage.id).eq('assignments.judge_id', judge.id).order('id').range(f, t)),
    all<ReviewRow>((f, t) => admin.from('reviews').select('assignment_id, overall_comment, assignments!inner(stage_id, judge_id)')
      .eq('assignments.stage_id', stage.id).eq('assignments.judge_id', judge.id).order('id').range(f, t)),
  ])
  const companyMap = new Map(assignments.map(a => [a.company_id, a.companies]))
  const nameOf = (companyId: string) => {
    const c = companyMap.get(companyId)
    return (stage.blind_mode ? c?.blind_code : c?.name) ?? c?.blind_code ?? '-'
  }

  // Q13: 미평가 기업이 남아 있으면 제출 거부 + 목록 안내
  const valid = new Set(ids)
  const byAssignment = new Map<string, ScoreRow[]>()
  for (const s of scores.filter(x => valid.has(x.assignment_id))) byAssignment.set(s.assignment_id, [...(byAssignment.get(s.assignment_id) ?? []), s])
  const incomplete = assignments
    .map(a => ({ company_id: a.company_id, name: nameOf(a.company_id), missing: missingItems(criteria, byAssignment.get(a.id) ?? []) }))
    .filter(x => x.missing.length > 0)
  if (incomplete.length) {
    return NextResponse.json({ error: `평가가 끝나지 않은 기업이 ${incomplete.length}개 있습니다.`, incomplete }, { status: 422 })
  }

  const reviewMap = new Map(reviews.map(r => [r.assignment_id, r]))
  const rows = assignments
    .map(a => {
      const sc = byAssignment.get(a.id) ?? []
      return {
        name: nameOf(a.company_id),
        scores: Object.fromEntries(sc.map(s => [s.criterion_id, s.score == null ? null : Number(s.score)])),
        comments: Object.fromEntries(sc.map(s => [s.criterion_id, s.comment])),
        overall: reviewMap.get(a.id)?.overall_comment ?? null,
      }
    })
    .sort((x, y) => naturalCompare(x.name, y.name))

  const submittedAt = new Date().toISOString()
  const ip = clientIp(req)
  const pdf = await buildEvaluationPdf({
    programTitle: program?.title ?? '',
    stageName: stage.name,
    blind: stage.blind_mode,
    judgeName: profile.name || user.email || '',
    affiliation: judge.affiliation,
    criteria,
    rows,
    submittedAt,
    ip,
    signaturePng: png,
  })
  const docHash = sha256(pdf)
  const ts = submittedAt.replace(/[-:.TZ]/g, '').slice(0, 14)
  const base = `evaluations/${stage.id}/${judge.id}_${ts}`
  await uploadBytes(`${base}.png`, png, 'image/png')
  await uploadBytes(`${base}.pdf`, pdf, 'application/pdf')

  // 재오픈 이력(reopened_*)은 그대로 둔다 — 변경 전후는 audit_logs 트리거에 남는다
  const { error } = await admin.from('evaluation_submissions').upsert({
    judge_id: judge.id,
    stage_id: stage.id,
    status: 'submitted',
    submitted_at: submittedAt,
    signature_path: `${base}.png`,
    signed_pdf_path: `${base}.pdf`,
    doc_hash: docHash,
  }, { onConflict: 'judge_id,stage_id' })
  if (error) {
    await admin.storage.from(BUCKET).remove([`${base}.png`, `${base}.pdf`])
    throw new Error(error.message)
  }

  const { error: rErr } = await admin.from('reviews')
    .upsert(ids.map(id => ({ assignment_id: id, status: 'submitted' })), { onConflict: 'assignment_id', defaultToNull: false })
  if (rErr) console.error('[eval/submit] reviews status', rErr)

  await emitEvent('evaluation.completed', {
    program_id: stage.program_id,
    program_title: program?.title,
    stage_id: stage.id,
    stage_name: stage.name,
    judge_id: judge.id,
    judge_name: profile.name,
    judge_email: user.email,
    company_count: assignments.length,
    submitted_at: submittedAt,
  })

  return NextResponse.json({ ok: true, submitted_at: submittedAt, signed_pdf_path: `${base}.pdf`, doc_hash: docHash })
})
