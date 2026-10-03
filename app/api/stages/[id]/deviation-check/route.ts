import { NextResponse } from 'next/server'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { emitEvent } from '@/lib/server/n8n'
import { loadStageResults } from '@/lib/server/stage-data'
import { profilesByUser, siteUrl } from '@/components/admin/setup/server'

// POST /api/stages/:id/deviation-check — 점수 편차 경고(n8n 'score.deviation') 발송
// body: { company_ids?: string[] }  (대시보드가 새로 나타난 경고 기업만 전달; 없으면 전체 경고)
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  const { supabase } = await requireApi('admin')
  const body = (await req.json().catch(() => ({}))) as { company_ids?: string[] }
  const data = await loadStageResults(supabase, params.id).catch(() => null)
  if (!data) throw new ApiError(404, '단계를 찾을 수 없습니다.')

  const only = Array.isArray(body.company_ids) && body.company_ids.length ? new Set(body.company_ids) : null
  const alerts = data.results.filter(r => r.deviation_alert && (!only || only.has(r.company_id)))
  if (!alerts.length) return NextResponse.json({ ok: true, count: 0 })

  const { data: program } = await supabase.from('programs').select('id, title').eq('id', data.stage.program_id).maybeSingle()
  const { data: judges } = await supabase.from('judges').select('id, user_id').eq('program_id', data.stage.program_id)
  const profs = await profilesByUser(supabase, (judges ?? []).map(j => j.user_id))
  const judgeName = new Map((judges ?? []).map(j => [j.id, profs.get(j.user_id)?.name ?? '']))

  await emitEvent('score.deviation', {
    program,
    stage: { id: data.stage.id, name: data.stage.name },
    threshold: Number(data.stage.deviation_alert),
    url: `${siteUrl(req)}/a/p/${data.stage.program_id}?stage=${data.stage.id}`,
    items: alerts.map(r => {
      const c = data.companies.get(r.company_id)
      return {
        company_id: r.company_id,
        company: c?.name ?? '',
        blind_code: c?.blind_code ?? null,
        deviation: r.deviation,
        judges: r.judge_totals.filter(j => j.total != null).map(j => ({ name: judgeName.get(j.judge_id) ?? '', total: j.total })),
      }
    }),
  })
  return NextResponse.json({ ok: true, count: alerts.length })
})
