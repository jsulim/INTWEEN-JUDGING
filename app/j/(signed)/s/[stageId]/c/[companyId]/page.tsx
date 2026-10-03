import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, Badge, buttonClass, cn } from '@/components/ui'
import { StageStatusBadge, DDayBadge } from '@/components/StatusBadges'
import { EvalStateBadge } from '@/components/judge/EvalStateBadge'
import PdfViewer, { type ViewerFile } from '@/components/judge/PdfViewer'
import ScoringPanel from '@/components/judge/ScoringPanel'
import { requireRole } from '@/lib/server/auth'
import type { JudgeSubmissionRow } from '@/lib/types'
import { loadJudgeStage, rowLock } from '@/app/j/_lib/data'

export const dynamic = 'force-dynamic'

const FILE_ORDER: Record<string, number> = { plan: 0, deck: 1 }

// J-04 자료 열람 + 평가: 데스크톱 좌 65% 뷰어 / 우 35% 평가표, 태블릿 이하 상하 배치 (11장)
export default async function EvaluatePage({ params }: { params: { stageId: string; companyId: string } }) {
  const { supabase, user, profile } = await requireRole('judge')
  const d = await loadJudgeStage(supabase, user.id, params.stageId)
  if (!d) notFound()
  const idx = d.rows.findIndex(r => r.company_id === params.companyId)
  if (idx < 0) notFound()
  const row = d.rows[idx]
  const lock = rowLock(d, row)
  const base = `/j/s/${d.stage.id}`

  // 이해충돌 배정은 뷰가 파일을 내주지 않는다 (v_judge_submissions)
  const { data: subs } = row.conflict
    ? { data: [] }
    : await supabase.from('v_judge_submissions').select('*').eq('stage_id', d.stage.id).eq('company_id', row.company_id)
  const files: ViewerFile[] = ((subs ?? []) as JudgeSubmissionRow[])
    .sort((a, b) => (FILE_ORDER[a.file_type] ?? 9) - (FILE_ORDER[b.file_type] ?? 9) || a.file_type.localeCompare(b.file_type))
    .map(s => ({ submission_id: s.submission_id, file_type: s.file_type, file_name: s.file_name, version: s.version, viewable: s.viewable }))

  // 이전/다음 (이해충돌 제외 기업은 건너뜀)
  const navigable = d.rows.filter(r => !r.conflict || r.company_id === row.company_id)
  const pos = navigable.findIndex(r => r.company_id === row.company_id)
  const prev = navigable[pos - 1]
  const next = navigable[pos + 1]
  const review = d.reviews.get(row.assignment_id)

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href={base} className="text-sm text-muted hover:text-fg">← {d.stage.name} 기업 목록</Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">{row.display_name}</h1>
            {row.field && <span className="text-sm text-muted">{row.field}</span>}
            {!d.stage.blind_mode && row.ceo && <span className="text-sm text-muted">대표 {row.ceo}</span>}
            <EvalStateBadge state={row.state} />
            <StageStatusBadge status={d.stage.status} />
            {d.stage.status === 'evaluating' && <DDayBadge deadline={d.stage.eval_end} />}
            {d.stage.blind_mode && <Badge tone="primary">블라인드</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="tabular text-sm text-muted">{pos + 1} / {navigable.length}</span>
          <NavLink href={prev && `${base}/c/${prev.company_id}`} label="← 이전" />
          <NavLink href={next && `${base}/c/${next.company_id}`} label="다음 →" />
        </div>
      </div>

      {row.conflict ? (
        <Alert>이해충돌로 이 기업의 평가에서 제외되었습니다. 자료 열람과 점수 입력이 차단됩니다.</Alert>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]">
          <PdfViewer key={row.company_id} files={files} watermarkName={profile.name || user.email || ''}
            className="h-[70vh] lg:h-[calc(100vh-11.5rem)]" />
          <div className="overflow-hidden rounded-lg border border-line bg-bg lg:h-[calc(100vh-11.5rem)] lg:overflow-y-auto">
            <ScoringPanel
              key={row.assignment_id}
              assignmentId={row.assignment_id}
              companyName={row.display_name}
              criteria={d.criteria}
              initialScores={d.scores.get(row.assignment_id) ?? []}
              initialReview={review ? { overall_comment: review.overall_comment, qna_memo: review.qna_memo } : null}
              lock={lock}
              canReportConflict={d.stage.status === 'evaluating' && !d.evalSubmitted}
              showQnaMemo={d.stage.is_presentation}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function NavLink({ href, label }: { href?: string | false; label: string }) {
  if (!href) return <span className={cn(buttonClass('outline', 'sm'), 'pointer-events-none opacity-40')}>{label}</span>
  return <Link href={href} className={buttonClass('outline', 'sm')}>{label}</Link>
}
