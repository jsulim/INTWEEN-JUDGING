import { Badge, Card, Empty, PageHeader } from '@/components/ui'
import { ResultBadge } from '@/components/StatusBadges'
import AppealForm from '@/components/company/AppealForm'
import { requireRole } from '@/lib/server/auth'
import { APPEAL_STATUS, fmtDate } from '@/lib/format'
import { appealWindow, myFileHref } from '@/components/company/rules'
import { loadMyEntries } from '../_lib/server'
import type { Appeal, AppealStatus } from '@/lib/types'

const TONE: Record<AppealStatus, 'neutral' | 'primary' | 'accent' | 'danger'> = {
  received: 'neutral', reviewing: 'primary', accepted: 'accent', rejected: 'danger',
}

// C-07 이의신청: 결과 공개 후 정해진 기간 내 단계별 1회, 처리 상태·회신 확인
export default async function AppealsPage() {
  const { supabase } = await requireRole('company')
  const entries = (await loadMyEntries(supabase)).filter(e => e.stage_status === 'published')
  const entryIds = entries.map(e => e.entry_id)
  const { data } = entryIds.length
    ? await supabase.from('appeals').select('*').in('entry_id', entryIds)
    : { data: [] as Appeal[] }
  const appeals = (data ?? []) as Appeal[]

  return (
    <>
      <PageHeader title="이의신청" description="결과 공개 후 정해진 기간 안에 단계별로 1회 신청할 수 있습니다." />
      {!entries.length ? (
        <Empty>결과가 공개된 단계가 없습니다.</Empty>
      ) : (
        <div className="grid max-w-3xl gap-4">
          {entries.map(e => {
            const appeal = appeals.find(a => a.entry_id === e.entry_id)
            const win = appealWindow(e)
            return (
              <Card key={e.entry_id}
                title={<span className="flex flex-wrap items-center gap-2"><span className="tabular text-sm font-normal text-muted">{e.order_no}단계</span>{e.stage_name}{e.result && <ResultBadge value={e.result} />}</span>}
                actions={appeal ? <Badge tone={TONE[appeal.status]}>{APPEAL_STATUS[appeal.status]}</Badge> : null}>
                {appeal ? (
                  <div className="grid gap-4 text-sm">
                    <div>
                      <div className="mb-1 text-xs font-semibold text-muted">신청 사유 <span className="tabular font-normal">· {fmtDate(appeal.created_at)}</span></div>
                      <p className="whitespace-pre-wrap break-words">{appeal.reason}</p>
                      {appeal.attachment_path && (
                        <a href={myFileHref({ path: appeal.attachment_path })} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-primary hover:underline">첨부 파일</a>
                      )}
                    </div>
                    <div className="rounded-md bg-bg px-3 py-3">
                      <div className="mb-1 text-xs font-semibold text-muted">
                        회신{appeal.decided_at && <span className="tabular font-normal"> · {fmtDate(appeal.decided_at)}</span>}
                      </div>
                      {appeal.response ? (
                        <p className="whitespace-pre-wrap break-words">{appeal.response}</p>
                      ) : (
                        <p className="text-muted">{appeal.status === 'received' ? '접수되었습니다. 검토 후 회신드립니다.' : '검토 중입니다.'}</p>
                      )}
                    </div>
                  </div>
                ) : win.open ? (
                  <AppealForm entryId={e.entry_id} until={win.until!.toISOString()} />
                ) : (
                  <p className="text-sm text-muted">{win.reason}</p>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
