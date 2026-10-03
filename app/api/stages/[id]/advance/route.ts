import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { emitEvent } from '@/lib/server/n8n'
import { siteOrigin } from '@/lib/server/export'
import type { Company, Program, Stage, StageEntry } from '@/lib/types'

// POST /api/stages/:id/advance — 통과자 선정 → 다음 단계로 이관 (A-08, 8-5)
// body: { company_ids: string[] }  선택 기업 = 통과, 나머지 = 탈락
// 다음 단계(order_no 가 바로 다음)가 있으면 통과 기업의 stage_entries 생성 + 제출 안내 이벤트
const Body = z.object({ company_ids: z.array(z.string().uuid()) })

export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  const { supabase } = await requireApi('admin')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '통과 기업 목록이 올바르지 않습니다.')
  const passIds = new Set(parsed.data.company_ids)

  const { data: st } = await supabase.from('stages').select('*').eq('id', params.id).maybeSingle()
  if (!st) throw new ApiError(404, '단계를 찾을 수 없습니다.')
  const stage = st as Stage
  if (stage.status !== 'locked' && stage.status !== 'published') throw new ApiError(400, '순위 확정 후 통과자를 선정할 수 있습니다.')

  const { data: ents } = await supabase.from('stage_entries').select('*, companies(*)').eq('stage_id', stage.id)
  const entries = (ents ?? []) as (StageEntry & { companies: Company })[]
  const unknown = [...passIds].filter(id => !entries.some(e => e.company_id === id))
  if (unknown.length) throw new ApiError(400, '이 단계에 참가하지 않은 기업이 포함되어 있습니다.')
  const ineligible = entries.filter(e => passIds.has(e.company_id) && e.eligibility === 'ineligible')
  if (ineligible.length) throw new ApiError(400, `부적격 기업은 통과시킬 수 없습니다: ${ineligible.map(e => e.companies.name).join(', ')}`)

  const passEntryIds = entries.filter(e => passIds.has(e.company_id)).map(e => e.id)
  const failEntryIds = entries.filter(e => !passIds.has(e.company_id)).map(e => e.id)
  if (passEntryIds.length) {
    const { error } = await supabase.from('stage_entries').update({ result: 'pass' }).in('id', passEntryIds)
    if (error) throw error
  }
  if (failEntryIds.length) {
    const { error } = await supabase.from('stage_entries').update({ result: 'fail' }).in('id', failEntryIds)
    if (error) throw error
  }

  // 다음 단계
  const { data: nextRows } = await supabase.from('stages').select('*').eq('program_id', stage.program_id)
    .gt('order_no', stage.order_no).order('order_no').limit(1)
  const next = ((nextRows ?? [])[0] ?? null) as Stage | null
  let created = 0
  let removed = 0
  if (next) {
    const { data: existing } = await supabase.from('stage_entries').select('id, company_id').eq('stage_id', next.id)
    const have = new Map((existing ?? []).map(e => [e.company_id, e.id]))
    const toCreate = [...passIds].filter(id => !have.has(id)).map(company_id => ({ stage_id: next.id, company_id }))
    if (toCreate.length) {
      const { error } = await supabase.from('stage_entries').insert(toCreate, { defaultToNull: false })
      if (error) throw error
      created = toCreate.length
    }
    // 재선정으로 탈락하게 된 기업: 다음 단계에 아직 제출물이 없을 때만 이관 취소
    const dropIds = [...have.entries()].filter(([cid]) => !passIds.has(cid) && entries.some(e => e.company_id === cid)).map(([, eid]) => eid)
    if (dropIds.length) {
      const { data: subs } = await supabase.from('submissions').select('entry_id').in('entry_id', dropIds)
      const withFiles = new Set((subs ?? []).map(s => s.entry_id))
      const del = dropIds.filter(id => !withFiles.has(id))
      if (del.length) {
        await supabase.from('stage_entries').delete().in('id', del)
        removed = del.length
      }
    }
  }

  await supabase.rpc('log_event', {
    p_action: 'stage.advance', p_table: 'stages', p_row: stage.id,
    p_meta: { stage_id: stage.id, next_stage_id: next?.id ?? null, pass: [...passIds], fail_count: failEntryIds.length, created, removed },
  })

  const { data: program } = await supabase.from('programs').select('id, title').eq('id', stage.program_id).single()
  const p = program as Pick<Program, 'id' | 'title'>
  const site = siteOrigin(req)
  const passers = entries.filter(e => passIds.has(e.company_id))
  const ownerIds = passers.map(e => e.companies.owner_user_id).filter(Boolean) as string[]
  const { data: owners } = ownerIds.length
    ? await supabase.from('profiles').select('user_id, name, email, phone').in('user_id', ownerIds)
    : { data: [] as { user_id: string; name: string; email: string | null; phone: string | null }[] }
  const om = new Map((owners ?? []).map(o => [o.user_id, o]))

  await emitEvent('stage.advanced', {
    program: { id: p.id, title: p.title },
    from_stage: { id: stage.id, name: stage.name, order_no: stage.order_no },
    to_stage: next ? {
      id: next.id, name: next.name, order_no: next.order_no, submit_start: next.submit_start, submit_end: next.submit_end,
      required_files: next.required_files, is_presentation: next.is_presentation,
    } : null,
    pass_count: passers.length,
    fail_count: failEntryIds.length,
    // 기업별 제출 안내 메일 대상
    companies: passers.map(e => {
      const o = e.companies.owner_user_id ? om.get(e.companies.owner_user_id) : undefined
      return {
        company_id: e.company_id, name: e.companies.name,
        email: e.companies.contact_email ?? o?.email ?? null, phone: o?.phone ?? null, contact_name: o?.name ?? e.companies.ceo ?? null,
      }
    }),
    submit_url: next ? `${site}/c/submit/${next.id}` : null,
  })

  return NextResponse.json({ ok: true, pass: passEntryIds.length, fail: failEntryIds.length, next_stage: next ? { id: next.id, name: next.name } : null, created, removed })
})
