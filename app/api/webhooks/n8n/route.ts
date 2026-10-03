import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { ApiError, handle } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Company, PresentationSlot, Program, Stage } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function assertSecret(req: Request) {
  const secret = process.env.N8N_WEBHOOK_SECRET
  if (!secret) throw new ApiError(503, 'N8N_WEBHOOK_SECRET 이 설정되지 않았습니다.')
  const got = Buffer.from(req.headers.get('x-intween-secret') ?? '')
  const want = Buffer.from(secret)
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new ApiError(401, 'unauthorized')
}

// POST /api/webhooks/n8n — n8n → 플랫폼 콜백 (헤더 x-intween-secret)
//  { event: 'health' | 'ping' }                         → 상태 확인
//  { event: 'presentation.upcoming.check', minutes? }   → 앞으로 N분(기본 15) 안에 시작하는 대기 중 발표 (발표 10분 전 알림용)
//  그 외                                                → 수신 확인(echo)
export const POST = handle(async (req: Request) => {
  assertSecret(req)
  const body = (await req.json().catch(() => ({}))) as { event?: string; minutes?: number }
  const event = body.event ?? 'ping'

  if (event === 'health' || event === 'ping') return NextResponse.json({ ok: true, event, at: new Date().toISOString() })

  if (event === 'presentation.upcoming.check') {
    const minutes = Math.min(Math.max(Number(body.minutes) || 15, 1), 180)
    const db = supabaseAdmin()
    const now = new Date()
    const until = new Date(now.getTime() + minutes * 60_000)
    const { data } = await db.from('presentation_slots')
      .select('*, companies(*), stages(id, name, program_id, programs(id, title))')
      .eq('status', 'waiting').gte('start_at', now.toISOString()).lte('start_at', until.toISOString()).order('start_at')
    const rows = (data ?? []) as (PresentationSlot & { companies: Company; stages: Pick<Stage, 'id' | 'name' | 'program_id'> & { programs: Pick<Program, 'id' | 'title'> } })[]
    const ownerIds = rows.map(r => r.companies.owner_user_id).filter(Boolean) as string[]
    const { data: owners } = ownerIds.length
      ? await db.from('profiles').select('user_id, name, email, phone').in('user_id', ownerIds)
      : { data: [] as { user_id: string; name: string; email: string | null; phone: string | null }[] }
    const om = new Map((owners ?? []).map(o => [o.user_id, o]))
    return NextResponse.json({
      ok: true, event, window_min: minutes, at: now.toISOString(),
      slots: rows.map(r => {
        const o = r.companies.owner_user_id ? om.get(r.companies.owner_user_id) : undefined
        return {
          slot_id: r.id, order_no: r.order_no, start_at: r.start_at,
          minutes_until: Math.round((new Date(r.start_at!).getTime() - now.getTime()) / 60_000),
          present_min: r.present_min, qna_min: r.qna_min, meeting_url: r.meeting_url,
          program: { id: r.stages.programs.id, title: r.stages.programs.title },
          stage: { id: r.stages.id, name: r.stages.name },
          company: { id: r.company_id, name: r.companies.name, email: r.companies.contact_email ?? o?.email ?? null, phone: o?.phone ?? null },
        }
      }),
    })
  }

  return NextResponse.json({ ok: true, event, received: true })
})
