import { Alert, Badge, LinkButton, PageHeader, Progress } from '@/components/ui'
import { DDayBadge, StageStatusBadge } from '@/components/StatusBadges'
import { fmtDate } from '@/lib/format'
import { lockReason } from '@/components/judge/progress'
import type { JudgeStageData } from '@/app/j/_lib/data'
import CompanyList from '@/app/j/(signed)/s/[stageId]/CompanyList'

// 단계 화면 본문: 제목·바로가기, 평가 완료 진행률, 배정 기업 목록.
// 단계 페이지(page)와 대시보드(section) 양쪽에서 같은 화면을 보여준다.
export default function StageBoard({ d, variant }: { d: JudgeStageData; variant: 'page' | 'section' }) {
  const base = `/j/s/${d.stage.id}`
  const lock = lockReason({ stageStatus: d.stage.status, evalSubmitted: d.evalSubmitted, conflict: false })
  const title = (
    <span className="flex flex-wrap items-center gap-2">{d.stage.name}<StageStatusBadge status={d.stage.status} />
      {d.stage.status === 'evaluating' && <DDayBadge deadline={d.stage.eval_end} />}
      {variant === 'section' && d.judge.is_chair && <Badge tone="primary">심사위원장</Badge>}</span>
  )
  const description = `${d.program.title} · 평가 마감 ${fmtDate(d.stage.eval_end)}`
  const actions = <>
    {d.stage.is_presentation && <LinkButton href={`${base}/live`} variant="secondary">현장 모드</LinkButton>}
    <LinkButton href={`${base}/summary`} variant="outline">내 평가 요약</LinkButton>
    <LinkButton href={`${base}/submit`} variant={d.counts.done === d.counts.total && !d.evalSubmitted ? 'primary' : 'outline'}>최종 확인 · 제출</LinkButton>
  </>

  return (
    <>
      {variant === 'page' ? (
        <PageHeader back={{ href: '/j', label: '대시보드' }} title={title} description={description} actions={actions} />
      ) : (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="mt-1 text-sm text-muted">{description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      )}
      <div className="mb-4 grid gap-3 rounded-lg border border-line bg-card p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <div className="mb-1 text-sm font-semibold">평가 완료</div>
          <Progress value={d.counts.done} max={d.counts.total} />
        </div>
        <div className="flex flex-wrap gap-2">
          {d.stage.blind_mode && <Badge tone="primary">블라인드 심사</Badge>}
          {lock && <Badge tone={lock === '확정됨' || lock === '최종 제출됨' ? 'accent' : 'neutral'}>{lock}</Badge>}
        </div>
      </div>
      {d.evalSub?.status === 'reopened' && (
        <div className="mb-4"><Alert tone="highlight">관리자가 평가를 재오픈했습니다{d.evalSub.reopen_reason ? ` (사유: ${d.evalSub.reopen_reason})` : ''}. 수정 후 다시 최종 제출하세요.</Alert></div>
      )}
      <CompanyList
        base={base}
        maxTotal={d.maxTotal}
        blind={d.stage.blind_mode}
        rows={d.rows.map(r => ({
          company_id: r.company_id,
          name: r.display_name,
          code: r.blind_code,
          field: r.field,
          state: r.state,
          total: r.total,
          order: r.order_no,
        }))}
      />
    </>
  )
}
