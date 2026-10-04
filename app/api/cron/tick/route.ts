import { NextResponse } from 'next/server'
import { handle } from '@/lib/server/auth'
import { assertCron } from '@/components/admin/results/cron'
import { supabaseAdmin } from '@/lib/supabase/server'
import { siteUrl } from '@/components/admin/setup/server'
import { notifyDeviations, notifyEvaluationStarted } from '@/lib/server/notify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/cron/tick — 5분 주기 (Supabase pg_cron + pg_net, Authorization: Bearer CRON_SECRET)
//  · 자동 전환으로 평가중이 된 단계의 평가 시작 알림 (수동 전환 시 이미 보냈으면 건너뜀)
//  · 평가중 단계의 새 점수 편차 경고 (대시보드를 열어 두지 않아도 발송)
export const GET = handle(async (req: Request) => {
  assertCron(req)
  const site = siteUrl(req)
  const { data: stages } = await supabaseAdmin().from('stages').select('id').eq('status', 'evaluating')
  let started = 0
  let deviations = 0
  for (const s of stages ?? []) {
    if (await notifyEvaluationStarted(s.id, site)) started++
    deviations += await notifyDeviations(s.id, site).catch(() => 0)
  }
  return NextResponse.json({ ok: true, stages: stages?.length ?? 0, started, deviations })
})
