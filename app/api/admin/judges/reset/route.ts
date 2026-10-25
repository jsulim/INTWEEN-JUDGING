import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import { BUCKET } from '@/lib/server/storage'

// POST /api/admin/judges/reset — 심사위원 평가 초기화 (관리자 전용)
//  점수·항목 심사평·종합 심사평·이해충돌 표시·최종 제출(서명본)·위원장 확인·동의서 서명을 지워 처음 상태로 되돌린다.
//  배정·계정·수당 지급 정보는 그대로. 확정/결과공개된 단계의 기록은 건드리지 않는다
const Body = z.object({ judge_id: z.guid() })

export const POST = handle(async (req: Request) => {
  const { supabase } = await requireApi('admin')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '요청 형식이 올바르지 않습니다.')
  const judgeId = parsed.data.judge_id
  const admin = supabaseAdmin()
  const must = <T,>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data }

  const judge = must(await admin.from('judges').select('id, program_id').eq('id', judgeId).maybeSingle())
  if (!judge) throw new ApiError(404, '심사위원을 찾을 수 없습니다.')

  const asg = must(await admin.from('assignments').select('id, stage_id, stages(status)').eq('judge_id', judgeId)) as unknown as
    { id: string; stage_id: string; stages: { status: string } | null }[]
  const frozen = (s: { status: string } | null) => s?.status === 'locked' || s?.status === 'published'
  const open = asg.filter(a => !frozen(a.stages))
  const ids = open.map(a => a.id)
  const stageIds = [...new Set(open.map(a => a.stage_id))]
  const skippedStages = new Set(asg.filter(a => frozen(a.stages)).map(a => a.stage_id)).size

  let scores = 0
  if (ids.length) {
    scores = (must(await admin.from('scores').delete().in('assignment_id', ids).select('id')) ?? []).length
    must(await admin.from('reviews').delete().in('assignment_id', ids))
    must(await admin.from('assignments').update({ conflict: false, conflict_reason: null, conflict_reported_at: null }).in('id', ids).eq('conflict', true))
  }
  const paths: string[] = []
  let submissions = 0
  if (stageIds.length) {
    const subs = must(await admin.from('evaluation_submissions').delete().eq('judge_id', judgeId).in('stage_id', stageIds).select('signature_path, signed_pdf_path')) ?? []
    submissions = subs.length
    const chairs = must(await admin.from('chair_reviews').delete().eq('judge_id', judgeId).in('stage_id', stageIds).select('signature_path')) ?? []
    for (const s of subs) paths.push(s.signature_path, s.signed_pdf_path)
    for (const c of chairs) paths.push(c.signature_path)
  }
  // 확정된 단계가 남아 있으면 그 평가의 근거가 되는 동의서는 남긴다
  let consents = 0
  if (!skippedStages) {
    const cons = must(await admin.from('consents').delete().eq('judge_id', judgeId).select('signature_path, signed_pdf_path')) ?? []
    consents = cons.length
    for (const c of cons) paths.push(c.signature_path, c.signed_pdf_path)
  }
  const files = paths.filter(Boolean) as string[]
  if (files.length) await admin.storage.from(BUCKET).remove(files).then(() => null, () => null)

  const result = { scores, assignments: ids.length, submissions, consents, skipped_stages: skippedStages }
  await supabase.rpc('log_event', { p_action: 'judge.reset', p_table: 'judges', p_row: judgeId, p_meta: result })
  return NextResponse.json({ ok: true, ...result })
})
