import { Alert, Badge, Empty, PageHeader } from '@/components/ui'
import { DDayBadge } from '@/components/StatusBadges'
import ApplicationForm from '@/components/company/ApplicationForm'
import SupplementList from '@/components/company/SupplementList'
import BonusClaims, { type BonusGroup } from '@/components/company/BonusClaims'
import { requireRole } from '@/lib/server/auth'
import { fmtDate } from '@/lib/format'
import { loadMyCompanies, loadMyEntries, type CompanyWithProgram } from '../_lib/server'
import type { ApplicationField, BonusRule, EligibilityCheck, EntryBonus } from '@/lib/types'

// C-06 신청서: 커스텀 항목 입력, 자격요건 자가 체크, 가점 증빙, 보완 요청 재제출
export default async function ApplyPage() {
  const { supabase, user } = await requireRole('company')
  const companies = await loadMyCompanies(supabase, user.id)
  if (!companies.length) {
    return (
      <>
        <PageHeader title="신청서" />
        <Empty>참여 중인 프로그램이 없습니다.</Empty>
      </>
    )
  }

  const entries = await loadMyEntries(supabase)
  const programIds = Array.from(new Set(companies.map(c => c.program_id)))
  const companyIds = companies.map(c => c.id)
  const entryIds = entries.map(e => e.entry_id)
  const stageIds = Array.from(new Set(entries.map(e => e.stage_id)))
  const none = Promise.resolve({ data: [] })

  const [{ data: fieldRows }, { data: answerRows }, { data: checkRows }, { data: ruleRows }, { data: bonusRows }, { data: stageRows }, canEditList] =
    await Promise.all([
      supabase.from('application_fields').select('*').in('program_id', programIds).order('order_no'),
      supabase.from('application_answers').select('company_id, field_id, value').in('company_id', companyIds),
      entryIds.length ? supabase.from('eligibility_checks').select('*').in('entry_id', entryIds).eq('result', 'supplement').order('created_at') : none,
      stageIds.length ? supabase.from('bonus_rules').select('*').in('stage_id', stageIds).order('created_at') : none,
      entryIds.length ? supabase.from('entry_bonuses').select('*').in('entry_id', entryIds) : none,
      stageIds.length ? supabase.from('stages').select('id, bonus_cap').in('id', stageIds) : none,
      Promise.all(companies.map(c => supabase.rpc('company_can_edit_application', { p_company_id: c.id }).then(r => !!r.data))),
    ])

  const fields = ((fieldRows ?? []) as ApplicationField[]).map(f => ({ ...f, options: Array.isArray(f.options) ? f.options.map(String) : [] }))
  const answers = (answerRows ?? []) as { company_id: string; field_id: string; value: unknown }[]
  const checks = (checkRows ?? []) as EligibilityCheck[]
  const rules = (ruleRows ?? []) as BonusRule[]
  const bonuses = (bonusRows ?? []) as EntryBonus[]
  const caps = new Map(((stageRows ?? []) as { id: string; bonus_cap: number }[]).map(s => [s.id, Number(s.bonus_cap)]))

  return (
    <>
      <PageHeader title="신청서" description="관리자가 정한 신청 항목을 입력하고 제출합니다." />
      <div className="grid max-w-3xl gap-10">
        {companies.map((company, idx) => {
          const canEdit = canEditList[idx]
          const myEntries = entries.filter(e => e.company_id === company.id)
          const myChecks = checks.filter(c => myEntries.some(e => e.entry_id === c.entry_id))
          const myFields = fields.filter(f => f.program_id === company.program_id)
          const initial = Object.fromEntries(answers.filter(a => a.company_id === company.id).map(a => [a.field_id, a.value]))
          const groups: BonusGroup[] = myEntries
            .map(e => ({
              entry_id: e.entry_id,
              stage_name: e.stage_name,
              stage_status: e.stage_status,
              bonus_cap: caps.get(e.stage_id) ?? null,
              rules: rules.filter(r => r.stage_id === e.stage_id && Number(r.points) > 0),
              claims: bonuses.filter(b => b.entry_id === e.entry_id),
            }))
            .filter(g => g.rules.length > 0)
          return (
            <section key={company.id} className="grid gap-5">
              {companies.length > 1 && <h2 className="text-lg font-bold">{company.programs?.title}</h2>}
              <StatusBar company={company} canEdit={canEdit} hasOpenSupplement={myChecks.some(c => !c.resolved_at)} />
              {myChecks.length > 0 && <SupplementList checks={myChecks} />}
              <ApplicationForm
                companyId={company.id}
                fields={myFields}
                initial={initial}
                canEdit={canEdit}
                submittedAt={company.application_submitted_at}
              />
              {groups.length > 0 && <BonusClaims groups={groups} />}
            </section>
          )
        })}
      </div>
    </>
  )
}

function StatusBar({ company, canEdit, hasOpenSupplement }: { company: CompanyWithProgram; canEdit: boolean; hasOpenSupplement: boolean }) {
  const p = company.programs
  const due = p?.application_due ?? null
  const closedByDue = !!due && new Date(due) < new Date()
  let reason: string | null = null
  if (!canEdit) {
    if (!p?.application_open) reason = '신청서 접수 기간이 아닙니다. 입력 내용은 읽기 전용으로 표시됩니다.'
    else if (closedByDue) reason = `신청서 접수가 마감되었습니다. (마감: ${fmtDate(due)})`
    else reason = '현재 신청서를 수정할 수 없습니다.'
  }
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card px-4 py-3 text-sm">
        <span className="font-semibold">상태</span>
        {company.application_submitted_at ? <Badge tone="accent">제출 완료</Badge> : <Badge tone="highlight">미제출</Badge>}
        {company.application_submitted_at && <span className="tabular text-muted">{fmtDate(company.application_submitted_at)}</span>}
        <span className="ml-auto flex items-center gap-2">
          {due && <span className="tabular text-muted">마감 {fmtDate(due)}</span>}
          {p?.application_open && <DDayBadge deadline={due} />}
        </span>
      </div>
      {reason && <Alert tone="neutral">{reason}</Alert>}
      {canEdit && hasOpenSupplement && (!p?.application_open || closedByDue) && (
        <Alert tone="highlight">보완 요청 기한 내에는 신청서를 수정할 수 있습니다. 보완을 마치면 요청 항목의 &lsquo;보완 제출&rsquo;을 눌러 주세요.</Alert>
      )}
    </div>
  )
}
