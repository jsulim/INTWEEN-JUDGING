import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { emitEvent } from '@/lib/server/n8n'
import { siteUrl } from '@/components/admin/setup/server'

// PATCH /api/eligibility/:entryId — 0차 적격 판정 (A-12)
// body: { checks: [{item, result, due_at?, note?}], eligibility?: 'eligible'|'supplement'|'ineligible'|'pending' }
// eligibility 미지정 시 checks 로 판정: fail 하나라도 → 부적격, supplement → 보완 요청, 모두 pass → 적격
const Body = z.object({
  checks: z.array(z.object({
    item: z.string().trim().min(1),
    result: z.enum(['pass', 'fail', 'supplement']),
    due_at: z.string().nullish(),
    note: z.string().nullish(),
  })).default([]),
  eligibility: z.enum(['pending', 'eligible', 'supplement', 'ineligible']).optional(),
})

export const PATCH = handle(async (req: Request, { params }: { params: { entryId: string } }) => {
  const { supabase, user } = await requireApi('admin')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '검토 항목을 확인해 주세요.')
  const { checks } = parsed.data

  const { data: entry } = await supabase.from('stage_entries')
    .select('*, companies(id, name, contact_email, owner_user_id, blind_code), stages(id, name, program_id, programs(id, title))')
    .eq('id', params.entryId).maybeSingle()
  if (!entry) throw new ApiError(404, '참가 정보를 찾을 수 없습니다.')

  const eligibility = parsed.data.eligibility
    ?? (checks.some(c => c.result === 'fail') ? 'ineligible'
      : checks.some(c => c.result === 'supplement') ? 'supplement'
      : checks.length ? 'eligible' : undefined)
  if (!eligibility && !checks.length) throw new ApiError(400, '검토 항목 또는 판정을 입력해 주세요.')

  const supplements = checks.filter(c => c.result === 'supplement')
  if (eligibility === 'supplement' && supplements.some(c => !c.due_at)) throw new ApiError(400, '보완 요청 항목에는 기한을 지정해 주세요.')

  if (checks.length) {
    const { error } = await supabase.from('eligibility_checks').insert(checks.map(c => ({
      entry_id: entry.id, item: c.item, result: c.result, due_at: c.due_at || null, note: c.note?.trim() || null, checked_by: user.id,
    })), { defaultToNull: false })
    if (error) throw error
  }
  if (eligibility && eligibility !== entry.eligibility) {
    const { error } = await supabase.from('stage_entries').update({ eligibility }).eq('id', entry.id)
    if (error) throw error
  }

  if (eligibility === 'supplement' && supplements.length) {
    const due = supplements.map(c => c.due_at!).sort()[0]
    let email: string | null = entry.companies?.contact_email ?? null
    if (entry.companies?.owner_user_id) {
      const { data: p } = await supabase.from('profiles').select('email, phone, name').eq('user_id', entry.companies.owner_user_id).maybeSingle()
      email = p?.email ?? email
    }
    await emitEvent('eligibility.supplement', {
      program: entry.stages?.programs ?? null,
      stage: { id: entry.stages?.id, name: entry.stages?.name },
      company: { id: entry.companies?.id, name: entry.companies?.name, email },
      items: supplements.map(c => ({ item: c.item, note: c.note ?? null, due_at: c.due_at })),
      due_at: due,
      url: `${siteUrl(req)}/c/apply`,
    })
  }

  return NextResponse.json({ ok: true, eligibility: eligibility ?? entry.eligibility })
})
