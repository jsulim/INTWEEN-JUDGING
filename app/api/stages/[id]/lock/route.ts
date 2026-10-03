import { NextResponse } from 'next/server'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { loadStageResults } from '@/lib/server/stage-data'
import { emitEvent } from '@/lib/server/n8n'
import { loadJudgeDirectory, loadJudgeProgress, siteOrigin, snapshotDetail } from '@/lib/server/export'
import type { Program } from '@/lib/types'

export const runtime = 'nodejs'

// POST /api/stages/:id/lock — 순위 확정(잠금) (A-08)
// body: { force?: boolean }
// 경고(미승인 가점·최종 미제출 심사위원·집계 중 기업·위원장 미확인)가 있고 force 가 아니면 409 { warnings }
// 확정 시 loadStageResults() 결과를 stage_results 에 스냅샷으로 저장하고 단계 상태를 'locked' 로 바꾼다.
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  const { supabase, user } = await requireApi('admin')
  const body = (await req.json().catch(() => ({}))) as { force?: boolean }

  const data = await loadStageResults(supabase, params.id)
  const { stage, results } = data
  if (stage.status === 'locked' || stage.status === 'published') throw new ApiError(409, '이미 확정된 단계입니다.')
  if (stage.status !== 'evaluating') throw new ApiError(400, '평가중 단계만 확정할 수 있습니다.')
  if (!results.length) throw new ApiError(400, '심사 대상 기업이 없습니다.')

  // ── 경고 수집
  const warnings: string[] = []
  if (data.unapprovedBonusCount > 0) {
    warnings.push(`미승인 가점·감점 ${data.unapprovedBonusCount}건이 있습니다. 확정 시 미승인 항목은 0점 처리됩니다.`)
  }
  const judges = await loadJudgeDirectory(supabase, stage.program_id)
  const stageJudgeIds = new Set(data.assignments.map(a => a.judge_id))
  const progress = await loadJudgeProgress(supabase, { ...data, stageJudges: judges.filter(j => stageJudgeIds.has(j.id)) })
  const notSubmitted = progress.filter(p => p.assigned > 0 && p.submission?.status !== 'submitted')
  if (notSubmitted.length) {
    warnings.push(`평가표 최종 제출 전 심사위원 ${notSubmitted.length}명: ${notSubmitted.map(p => p.judge.name).join(', ')}`)
  }
  const inProgress = results.filter(r => r.in_progress)
  if (inProgress.length) {
    warnings.push(`미평가 심사위원이 있는 기업 ${inProgress.length}개 (집계 중). 완료된 평가만으로 확정됩니다.`)
  }
  const chair = judges.find(j => j.is_chair)
  if (chair) {
    const { data: cr } = await supabase.from('chair_reviews').select('confirmed_at').eq('stage_id', stage.id).maybeSingle()
    if (!cr?.confirmed_at) warnings.push(`심사위원장(${chair.name}) 확인 서명이 아직 없습니다.`)
  }
  if (warnings.length && !body.force) return NextResponse.json({ warnings }, { status: 409 })

  // ── 스냅샷 저장
  const now = new Date().toISOString()
  const options = { normalize: stage.normalize, trim_extremes: stage.trim_extremes, bonus_cap: Number(stage.bonus_cap) }
  const rows = results.map(r => ({
    stage_id: stage.id,
    company_id: r.company_id,
    raw_score: r.raw,
    normalized_score: r.normalized,
    bonus: r.bonus,
    avg_score: r.final,
    rank: r.rank,
    cutoff: r.cutoff,
    judge_count: r.judge_count,
    detail: snapshotDetail(r, options),
    locked_at: now,
    locked_by: user.id,
  }))
  const { error: upErr } = await supabase.from('stage_results').upsert(rows, { onConflict: 'stage_id,company_id', defaultToNull: false })
  if (upErr) throw upErr
  // 심사 대상에서 빠진 기업(부적격 처리 등)의 이전 스냅샷 정리
  const keep = results.map(r => r.company_id)
  await supabase.from('stage_results').delete().eq('stage_id', stage.id).not('company_id', 'in', `(${keep.join(',')})`)

  const { error: stErr } = await supabase.from('stages').update({ status: 'locked' }).eq('id', stage.id)
  if (stErr) throw stErr

  await supabase.rpc('log_event', {
    p_action: 'stage.lock', p_table: 'stages', p_row: stage.id,
    p_meta: { stage_id: stage.id, forced: !!body.force, warnings, companies: rows.length, options },
  })

  const { data: program } = await supabase.from('programs').select('id, title').eq('id', stage.program_id).single()
  const p = program as Pick<Program, 'id' | 'title'>
  const site = siteOrigin(req)
  await emitEvent('stage.locked', {
    program: { id: p.id, title: p.title },
    stage: { id: stage.id, name: stage.name, order_no: stage.order_no },
    locked_at: now,
    company_count: results.length,
    ranked_count: results.filter(r => r.rank != null).length,
    cutoff_count: results.filter(r => r.cutoff).length,
    top: results.filter(r => r.rank != null).slice(0, 5).map(r => ({
      rank: r.rank, company: data.companies.get(r.company_id)?.name ?? '', final: r.final,
    })),
    warnings,
    results_url: `${site}/a/p/${p.id}/results?stage=${stage.id}`,
    excel_url: `${site}/api/export/${stage.id}?type=excel`,
  })

  return NextResponse.json({ ok: true, locked_at: now, count: rows.length })
})
