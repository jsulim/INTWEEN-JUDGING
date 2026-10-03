import Link from 'next/link'
import { Badge, Card, Empty, PageHeader } from '@/components/ui'
import { ResultBadge, StageStatusBadge } from '@/components/StatusBadges'
import { requireRole } from '@/lib/server/auth'
import { fmtDate, fmtScore } from '@/lib/format'
import { appealWindow } from '@/components/company/rules'
import { loadMyEntries } from '../_lib/server'
import type { StageResult } from '@/lib/types'

// C-04 결과 확인: '결과공개' 단계만 통과/탈락 표시. 점수는 단계의 점수 공개 옵션에 따름
export default async function ResultsPage() {
  const { supabase } = await requireRole('company')
  const entries = await loadMyEntries(supabase)
  const published = entries.filter(e => e.stage_status === 'published')
  const pending = entries.filter(e => e.stage_status !== 'published')
  const scoreStageIds = published.filter(e => e.score_visible).map(e => e.stage_id)
  const { data: rows } = scoreStageIds.length
    ? await supabase.from('stage_results').select('*').in('stage_id', scoreStageIds)
    : { data: [] as StageResult[] }
  const results = (rows ?? []) as StageResult[]

  return (
    <>
      <PageHeader title="결과 확인" description="관리자가 결과를 공개한 단계만 표시됩니다." />
      {!entries.length ? (
        <Empty>참가 중인 단계가 없습니다.</Empty>
      ) : (
        <div className="grid max-w-3xl gap-4">
          {published.length === 0 && <Empty>아직 공개된 결과가 없습니다.</Empty>}
          {published.map(e => {
            const r = results.find(x => x.stage_id === e.stage_id && x.company_id === e.company_id)
            const appeal = appealWindow(e)
            return (
              <Card key={e.entry_id}
                title={<span className="flex flex-wrap items-center gap-2"><span className="tabular text-sm font-normal text-muted">{e.order_no}단계</span>{e.stage_name}</span>}
                actions={e.result ? <ResultBadge value={e.result} /> : null}>
                <div className="grid gap-4">
                  <ResultMessage result={e.result} />
                  {e.score_visible && (
                    r ? (
                      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <ScoreItem label="최종 점수" value={fmtScore(r.avg_score)} strong />
                        <ScoreItem label="순위" value={r.cutoff ? '과락' : r.rank != null ? `${r.rank}위` : '-'} />
                        <ScoreItem label="원점수" value={fmtScore(r.raw_score)} />
                        <ScoreItem label="가점·감점" value={Number(r.bonus) ? `${Number(r.bonus) > 0 ? '+' : ''}${fmtScore(r.bonus)}` : '0'} />
                      </dl>
                    ) : (
                      <p className="text-sm text-muted">공개된 점수가 없습니다.</p>
                    )
                  )}
                  {r?.cutoff && <p className="text-sm text-danger">항목별 최저 기준에 미달해 과락 처리되었습니다.</p>}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm text-muted">
                    <span className="tabular">공개 {fmtDate(e.published_at)}</span>
                    {appeal.open ? (
                      <Link href="/c/appeals" className="font-semibold text-primary hover:underline">
                        이의신청 <span className="tabular font-normal text-muted">(~{fmtDate(appeal.until)})</span>
                      </Link>
                    ) : null}
                  </div>
                </div>
              </Card>
            )
          })}

          {pending.length > 0 && (
            <section className="mt-2">
              <h2 className="mb-2 text-sm font-semibold text-muted">결과 공개 전</h2>
              <ul className="divide-y divide-line rounded-lg border border-line bg-card">
                {pending.map(e => (
                  <li key={e.entry_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span><span className="tabular mr-2 text-muted">{e.order_no}단계</span><span className="font-medium">{e.stage_name}</span></span>
                    <span className="flex items-center gap-2"><StageStatusBadge status={e.stage_status} /><Badge>심사 중</Badge></span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  )
}

function ResultMessage({ result }: { result: 'pending' | 'pass' | 'fail' | null }) {
  if (result === 'pass') return <p className="text-lg font-bold text-accent">통과</p>
  if (result === 'fail') return <p className="text-lg font-bold">탈락</p>
  return <p className="text-muted">결과 집계 중입니다.</p>
}

function ScoreItem({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md bg-bg px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={strong ? 'tabular text-xl font-bold' : 'tabular text-lg font-semibold'}>{value}</dd>
    </div>
  )
}
