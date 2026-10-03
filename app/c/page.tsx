import Link from 'next/link'
import { Alert, Badge, Card, Empty, LinkButton, PageHeader } from '@/components/ui'
import { DDayBadge, ResultBadge, StageStatusBadge } from '@/components/StatusBadges'
import { requireRole } from '@/lib/server/auth'
import { SLOT_STATUS, fmtDate } from '@/lib/format'
import { submitWindow } from '@/components/company/rules'
import { loadMyCompanies, loadMyEntries } from './_lib/server'
import type { EligibilityCheck, MyEntryRow, Notice, PresentationSlot, Submission } from '@/lib/types'

// C-01 대시보드: 참여 프로그램, 현재 단계, 마감 D-day, 제출 상태, 보완 요청, 발표 일정
export default async function CompanyDashboard() {
  const { supabase, user } = await requireRole('company')
  const companies = await loadMyCompanies(supabase, user.id)

  if (!companies.length) {
    return (
      <>
        <PageHeader title="대시보드" />
        <Empty>참여 중인 프로그램이 없습니다. 초대 메일을 받은 계정으로 로그인했는지 확인해 주세요.</Empty>
      </>
    )
  }

  const entries = await loadMyEntries(supabase)
  const entryIds = entries.map(e => e.entry_id)
  const [{ data: subs }, { data: checks }, { data: slots }, { data: notices }] = await Promise.all([
    entryIds.length
      ? supabase.from('submissions').select('id, entry_id, file_type, file_name, version, created_at').in('entry_id', entryIds).eq('is_current', true)
      : Promise.resolve({ data: [] }),
    entryIds.length
      ? supabase.from('eligibility_checks').select('*').in('entry_id', entryIds).eq('result', 'supplement').is('resolved_at', null).order('due_at')
      : Promise.resolve({ data: [] }),
    supabase.from('presentation_slots').select('*').order('start_at'),
    supabase.from('notices').select('id, program_id, title, created_at').order('created_at', { ascending: false }).limit(5),
  ])
  const submissions = (subs ?? []) as Pick<Submission, 'id' | 'entry_id' | 'file_type' | 'file_name' | 'version' | 'created_at'>[]
  const supplements = (checks ?? []) as EligibilityCheck[]
  const presentationSlots = (slots ?? []) as PresentationSlot[]
  const recentNotices = (notices ?? []) as Pick<Notice, 'id' | 'program_id' | 'title' | 'created_at'>[]
  const now = new Date()
  const openSupplements = supplements.filter(c => !c.due_at || new Date(c.due_at) >= now)

  return (
    <>
      <PageHeader title="대시보드" description={companies.length === 1 ? companies[0].name : `${companies.length}개 프로그램 참여 중`} />

      {openSupplements.length > 0 && (
        <div className="mb-6">
          <Alert tone="highlight">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span><b>보완 요청 {openSupplements.length}건</b> · 기한 내에 신청서·증빙을 보완해 주세요.</span>
              <Link href="/c/apply" className="font-semibold underline">보완하기</Link>
            </div>
          </Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6 lg:col-span-2">
          {companies.map(company => {
            const program = company.programs
            const myEntries = entries.filter(e => e.company_id === company.id)
            const current = [...myEntries].sort((a, b) => b.order_no - a.order_no)[0]
            const mySupplements = supplements.filter(c => myEntries.some(e => e.entry_id === c.entry_id))
            const mySlots = presentationSlots.filter(s => s.company_id === company.id)
            return (
              <Card key={company.id}
                title={<span className="flex flex-wrap items-center gap-2">{program?.title ?? '프로그램'}{program?.status === 'closed' && <Badge>종료</Badge>}</span>}
                actions={<span className="text-sm text-muted">{company.name}</span>}>
                <div className="grid gap-5">
                  {program?.application_open && (
                    <ApplicationLine submittedAt={company.application_submitted_at} due={program.application_due} />
                  )}

                  {current ? (
                    <CurrentStage entry={current} submissions={submissions.filter(s => s.entry_id === current.entry_id)} now={now} />
                  ) : (
                    <p className="text-sm text-muted">아직 참가 단계가 배정되지 않았습니다.</p>
                  )}

                  {mySupplements.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-muted">보완 요청</h3>
                      <ul className="grid gap-2">
                        {mySupplements.map(c => (
                          <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-highlight/50 bg-highlight/10 px-3 py-2 text-sm">
                            <div className="min-w-0">
                              <div className="font-semibold">{c.item}</div>
                              {c.note && <div className="mt-0.5 whitespace-pre-wrap text-muted">{c.note}</div>}
                            </div>
                            <div className="flex items-center gap-2">
                              {c.due_at && <span className="tabular text-xs text-muted">{fmtDate(c.due_at)}</span>}
                              <DDayBadge deadline={c.due_at} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {mySlots.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-muted">발표 일정</h3>
                      <ul className="grid gap-2">
                        {mySlots.map(s => {
                          const st = myEntries.find(e => e.stage_id === s.stage_id)
                          return (
                            <li key={s.id} className="rounded-md border border-line px-3 py-2 text-sm">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold">{st?.stage_name ?? '발표 심사'}</span>
                                <Badge tone="primary"><span className="tabular">{s.order_no}번째 발표</span></Badge>
                                <Badge tone={s.status === 'done' ? 'accent' : s.status === 'waiting' ? 'neutral' : 'highlight'}>{SLOT_STATUS[s.status]}</Badge>
                              </div>
                              <div className="tabular mt-1 text-muted">
                                {s.start_at ? fmtDate(s.start_at) : '시각 미정'} · 발표 {s.present_min}분 · 질의응답 {s.qna_min}분
                              </div>
                              {s.meeting_url && (
                                <a href={s.meeting_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block break-all font-semibold text-primary underline">화상 발표 링크</a>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}

                  {myEntries.length > 1 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-muted">전체 단계</h3>
                      <ol className="grid gap-1.5 text-sm">
                        {myEntries.map(e => (
                          <li key={e.entry_id} className="flex flex-wrap items-center gap-2">
                            <span className="tabular w-6 text-muted">{e.order_no}</span>
                            <span className="font-medium">{e.stage_name}</span>
                            <StageStatusBadge status={e.stage_status} />
                            {e.result && e.result !== 'pending' && <ResultBadge value={e.result} />}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>

        <Card title="공지사항" actions={<Link href="/c/notices" className="text-sm text-muted hover:text-fg">전체 보기</Link>} className="content-start self-start">
          {recentNotices.length ? (
            <ul className="grid gap-3">
              {recentNotices.map(n => (
                <li key={n.id}>
                  <Link href={`/c/notices?id=${n.id}#n-${n.id}`} className="block hover:text-primary">
                    <div className="line-clamp-2 font-medium">{n.title}</div>
                    <div className="tabular text-xs text-muted">{fmtDate(n.created_at, false)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">등록된 공지가 없습니다.</p>
          )}
        </Card>
      </div>
    </>
  )
}

function ApplicationLine({ submittedAt, due }: { submittedAt: string | null; due: string | null }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-bg px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">신청서</span>
        {submittedAt ? <Badge tone="accent">제출 완료</Badge> : <Badge tone="highlight">미제출</Badge>}
        {due && !submittedAt && <DDayBadge deadline={due} />}
        {submittedAt && <span className="tabular text-xs text-muted">{fmtDate(submittedAt)}</span>}
      </div>
      <Link href="/c/apply" className="font-semibold text-primary hover:underline">{submittedAt ? '신청서 보기' : '작성하기'}</Link>
    </div>
  )
}

function CurrentStage({ entry, submissions, now }: {
  entry: MyEntryRow
  submissions: Pick<Submission, 'id' | 'file_type' | 'file_name' | 'version' | 'created_at'>[]
  now: Date
}) {
  const win = submitWindow(entry, now)
  const slots = entry.required_files
  const done = slots.filter(s => submissions.some(x => x.file_type === s.type)).length
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">현재 단계</span>
        <span className="text-lg font-bold">{entry.stage_name}</span>
        <StageStatusBadge status={entry.stage_status} />
        {entry.stage_status === 'submitting' && <DDayBadge deadline={entry.submit_end} />}
        {entry.result && entry.result !== 'pending' && <ResultBadge value={entry.result} />}
      </div>
      {(entry.submit_start || entry.submit_end) && (
        <p className="tabular mb-3 text-sm text-muted">접수 기간 {fmtDate(entry.submit_start)} ~ {fmtDate(entry.submit_end)}</p>
      )}
      {slots.length > 0 ? (
        <>
          <ul className="divide-y divide-line rounded-md border border-line">
            {slots.map(s => {
              const sub = submissions.find(x => x.file_type === s.type)
              return (
                <li key={s.type} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                  <span className="font-medium">
                    {s.label}{s.required && <span className="ml-0.5 text-danger">*</span>}
                    <span className="ml-1.5 text-xs text-muted">{(s.accept ?? []).map(a => a.toUpperCase()).join('·')}</span>
                  </span>
                  {sub ? (
                    <span className="flex items-center gap-2">
                      <span className="tabular text-xs text-muted">v{sub.version} · {fmtDate(sub.created_at)}</span>
                      <Badge tone="accent">제출 완료</Badge>
                    </span>
                  ) : (
                    <Badge tone={s.required ? 'highlight' : 'neutral'}>미제출</Badge>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="tabular text-sm text-muted">{done}/{slots.length} 제출</span>
            {win.open ? (
              <LinkButton href={`/c/submit/${entry.stage_id}`} size="sm">{done === slots.length ? '제출 내역·재업로드' : '제출하기'}</LinkButton>
            ) : (
              <LinkButton href={`/c/submit/${entry.stage_id}`} size="sm" variant="outline">제출 내역</LinkButton>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">이 단계는 제출 자료가 없습니다.</p>
      )}
    </div>
  )
}
