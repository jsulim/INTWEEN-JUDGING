import Link from 'next/link'
import { Badge, Empty, PageHeader } from '@/components/ui'
import { DDayBadge, StageStatusBadge } from '@/components/StatusBadges'
import { requireRole } from '@/lib/server/auth'
import { fmtDate } from '@/lib/format'
import { submitWindow } from '@/components/company/rules'
import { loadMyCompanies, loadMyEntries } from '../_lib/server'

// C-03 단계별 제출 — 단계 목록
export default async function SubmitListPage() {
  const { supabase, user } = await requireRole('company')
  const [companies, entries] = await Promise.all([loadMyCompanies(supabase, user.id), loadMyEntries(supabase)])
  const entryIds = entries.map(e => e.entry_id)
  const { data: subs } = entryIds.length
    ? await supabase.from('submissions').select('entry_id, file_type').in('entry_id', entryIds).eq('is_current', true)
    : { data: [] as { entry_id: string; file_type: string }[] }
  const now = new Date()

  return (
    <>
      <PageHeader title="자료 제출" description="단계가 '접수중'이고 접수 기간 안일 때만 업로드할 수 있습니다." />
      {!entries.length ? (
        <Empty>참가 중인 단계가 없습니다.</Empty>
      ) : (
        <div className="grid gap-8">
          {companies.map(c => {
            const list = entries.filter(e => e.company_id === c.id)
            if (!list.length) return null
            return (
              <section key={c.id}>
                {companies.length > 1 && <h2 className="mb-3 font-bold">{c.programs?.title}</h2>}
                <ul className="grid gap-3">
                  {list.map(e => {
                    const win = submitWindow(e, now)
                    const slots = e.required_files
                    const done = slots.filter(s => (subs ?? []).some(x => x.entry_id === e.entry_id && x.file_type === s.type)).length
                    const requiredLeft = slots.filter(s => s.required && !(subs ?? []).some(x => x.entry_id === e.entry_id && x.file_type === s.type)).length
                    return (
                      <li key={e.entry_id}>
                        <Link href={`/c/submit/${e.stage_id}`}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-card p-4 transition-colors hover:border-primary/50">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="tabular text-sm text-muted">{e.order_no}단계</span>
                              <span className="font-bold">{e.stage_name}</span>
                              <StageStatusBadge status={e.stage_status} />
                              {win.open && <DDayBadge deadline={e.submit_end} />}
                            </div>
                            <div className="tabular mt-1 text-sm text-muted">
                              {e.submit_start || e.submit_end ? `${fmtDate(e.submit_start)} ~ ${fmtDate(e.submit_end)}` : '접수 기간 미정'}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {slots.length === 0 ? (
                              <Badge>제출 자료 없음</Badge>
                            ) : requiredLeft === 0 ? (
                              <Badge tone="accent">제출 완료</Badge>
                            ) : (
                              <Badge tone={win.open ? 'highlight' : 'neutral'}>미제출 {requiredLeft}건</Badge>
                            )}
                            {slots.length > 0 && <span className="tabular text-sm text-muted">{done}/{slots.length}</span>}
                            <span className="text-muted" aria-hidden>›</span>
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
