import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, Badge, Card, PageHeader, Table } from '@/components/ui'
import { StageStatusBadge } from '@/components/StatusBadges'
import { SignedPdfLink } from '@/components/judge/SignedPdfLink'
import { missingItems } from '@/components/judge/progress'
import { requireRole } from '@/lib/server/auth'
import { fmtDate, fmtScore } from '@/lib/format'
import { loadJudgeStage } from '@/app/j/_lib/data'
import SubmitForm from './SubmitForm'

export const dynamic = 'force-dynamic'

// J-07 평가표 최종 제출: 배정 기업 전원 평가 완료 시에만 일괄 제출(Q13), 평가표 PDF 서명.
// 제출 후 수정은 관리자 재오픈 필요 (DB judge_can_write 가 차단)
export default async function SubmitPage({ params }: { params: { stageId: string } }) {
  const { supabase, user } = await requireRole('judge')
  const d = await loadJudgeStage(supabase, user.id, params.stageId)
  if (!d) notFound()
  const base = `/j/s/${d.stage.id}`
  const targets = d.rows.filter(r => !r.conflict)
  const incomplete = targets
    .map(r => ({ ...r, missing: missingItems(d.criteria, d.scores.get(r.assignment_id) ?? [],
      { required: d.stage.overall_comment_required, comment: d.reviews.get(r.assignment_id)?.overall_comment }) }))
    .filter(r => r.missing.length > 0)
  const sub = d.evalSub

  return (
    <>
      <PageHeader back={{ href: base, label: '기업 목록' }}
        title={<span className="flex items-center gap-2">최종 확인 · 제출<StageStatusBadge status={d.stage.status} /></span>}
        description={`${d.program.title} · ${d.stage.name} · 평가 ${targets.length}개 기업`} />

      {sub?.status === 'submitted' ? (
        <Card title={<span className="flex items-center gap-2">제출 상태<Badge tone="accent">최종 제출 완료</Badge></span>}>
          <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
            <dt className="text-muted">제출 일시</dt><dd className="tabular">{fmtDate(sub.submitted_at)}</dd>
            <dt className="text-muted">문서 해시</dt><dd className="tabular break-all text-xs">{sub.doc_hash ?? '-'}</dd>
            <dt className="text-muted">서명본</dt>
            <dd>{sub.signed_pdf_path ? <SignedPdfLink path={sub.signed_pdf_path} kind="evaluation">평가표 PDF 보기</SignedPdfLink> : '-'}</dd>
          </dl>
          <p className="mt-4 text-sm text-muted">제출 후에는 점수·심사평을 수정할 수 없습니다. 수정이 필요하면 관리자에게 재오픈을 요청하세요.</p>
        </Card>
      ) : d.stage.status !== 'evaluating' ? (
        <Alert>평가중 단계에서만 최종 제출할 수 있습니다.</Alert>
      ) : (
        <div className="grid gap-6">
          {sub?.status === 'reopened' && (
            <Alert tone="highlight">
              관리자가 평가를 재오픈했습니다{sub.reopened_at ? ` (${fmtDate(sub.reopened_at)})` : ''}{sub.reopen_reason ? ` · 사유: ${sub.reopen_reason}` : ''}. 수정 후 다시 제출하세요.
            </Alert>
          )}
          {incomplete.length > 0 ? (
            <Card title={<span className="flex items-center gap-2">미평가 기업<Badge tone="highlight">{incomplete.length}개</Badge></span>}>
              <p className="mb-3 text-sm text-muted">배정 기업 전원의 평가를 마쳐야 제출할 수 있습니다.</p>
              <ul className="grid gap-2">
                {incomplete.map(r => (
                  <li key={r.company_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="font-semibold">{r.display_name}</div>
                      <div className="text-xs text-muted">{r.missing.slice(0, 4).join(', ')}{r.missing.length > 4 ? ` 외 ${r.missing.length - 4}건` : ''} 미입력</div>
                    </div>
                    <Link href={`${base}/c/${r.company_id}`} className="text-sm font-semibold text-primary hover:underline">평가하기</Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <>
              <Card title="평가 결과 최종 확인">
                <p className="mb-3 text-sm text-muted">기업별 점수와 종합 심사평을 확인하세요. 고칠 곳이 있으면 기업명을 눌러 수정한 뒤 다시 오면 됩니다.</p>
                <Table>
                  <thead>
                    <tr>
                      <th>기업</th>
                      {d.criteria.map(c => (
                        <th key={c.id} className="w-20 text-center">{c.name}<div className="tabular text-xs font-normal">{fmtScore(c.max_score)}점</div></th>
                      ))}
                      <th className="w-20 text-center">합계<div className="tabular text-xs font-normal">{fmtScore(d.criteria.reduce((a, c) => a + Number(c.max_score), 0))}점</div></th>
                      <th className="min-w-[220px]">종합 심사평</th>
                    </tr>
                  </thead>
                  <tbody>
                    {targets.map(r => {
                      const sc = new Map((d.scores.get(r.assignment_id) ?? []).map(s => [s.criterion_id, s.score]))
                      return (
                        <tr key={r.company_id}>
                          <td className="whitespace-nowrap font-semibold"><Link href={`${base}/c/${r.company_id}`} className="hover:text-primary hover:underline">{r.display_name}</Link></td>
                          {d.criteria.map(c => <td key={c.id} className="tabular text-center">{fmtScore(sc.get(c.id))}</td>)}
                          <td className="tabular text-center text-base font-bold text-primary">{fmtScore(r.total)}</td>
                          <td className="whitespace-pre-wrap break-words text-sm text-muted">{d.reviews.get(r.assignment_id)?.overall_comment || '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </Table>
                {d.counts.conflict > 0 && <p className="mt-2 text-xs text-muted">이해충돌 제외 {d.counts.conflict}개 기업은 제출 대상이 아닙니다.</p>}
              </Card>
              <Card title="제출">
                <SubmitForm stageId={d.stage.id} base={base} />
              </Card>
            </>
          )}
        </div>
      )}
    </>
  )
}
