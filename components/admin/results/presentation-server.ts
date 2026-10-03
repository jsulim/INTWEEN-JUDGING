import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { emitEvent } from '@/lib/server/n8n'
import type { Company, PresentationSlot, Program, Stage } from '@/lib/types'

/** 발표 일정 이벤트 (presentation.scheduled): 기업별 순서·시각·화상 링크 */
export async function emitPresentationSchedule(supabase: SupabaseClient, stageId: string, site: string, reason: 'draw' | 'distribute') {
  const { data: st } = await supabase.from('stages').select('*, programs(id, title)').eq('id', stageId).single()
  const stage = st as Stage & { programs: Pick<Program, 'id' | 'title'> }
  const { data: slots } = await supabase.from('presentation_slots').select('*, companies(*)').eq('stage_id', stageId).order('order_no')
  const rows = (slots ?? []) as (PresentationSlot & { companies: Company })[]
  const ownerIds = rows.map(r => r.companies.owner_user_id).filter(Boolean) as string[]
  const { data: owners } = ownerIds.length
    ? await supabase.from('profiles').select('user_id, name, email, phone').in('user_id', ownerIds)
    : { data: [] as { user_id: string; name: string; email: string | null; phone: string | null }[] }
  const om = new Map((owners ?? []).map(o => [o.user_id, o]))
  return emitEvent('presentation.scheduled', {
    reason,
    program: { id: stage.programs.id, title: stage.programs.title },
    stage: { id: stage.id, name: stage.name },
    live_url: `${site}/j/s/${stage.id}/live`,
    slots: rows.map(r => {
      const o = r.companies.owner_user_id ? om.get(r.companies.owner_user_id) : undefined
      return {
        order_no: r.order_no, start_at: r.start_at, present_min: r.present_min, qna_min: r.qna_min, meeting_url: r.meeting_url,
        company: { id: r.company_id, name: r.companies.name, email: r.companies.contact_email ?? o?.email ?? null, phone: o?.phone ?? null },
      }
    }),
  })
}
