import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, Badge } from '@/components/ui'
import { StageStatusBadge, DDayBadge } from '@/components/StatusBadges'
import { EvalStateBadge } from '@/components/judge/EvalStateBadge'
import PdfViewer, { type ViewerFile } from '@/components/judge/PdfViewer'
import ScoringPanel from '@/components/judge/ScoringPanel'
import EvalNav from '@/components/judge/EvalNav'
import { missingItems } from '@/components/judge/progress'
import { requireRole } from '@/lib/server/auth'
import type { JudgeSubmissionRow } from '@/lib/types'
import { loadJudgeStage, rowLock } from '@/app/j/_lib/data'

export const dynamic = 'force-dynamic'


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

  // 이전/다음 (이해충돌 제외 기업은 건너뜀)
  const navigable = d.rows.filter(r => !r.conflict || r.company_id === row.company_id)
  const pos = navigable.findIndex(r => r.company_id === row.company_id)
  const prev = navigable[pos - 1]
  const next = navigable[pos + 1]

  // 이해충돌 배정은 뷰가 파일을 내주지 않는다 (v_judge_submissions). 다음 기업 자료도 함께 받아 미리 내려받기에 쓴다
  const ids = [row.conflict ? null : row.company_id, next?.company_id].filter(Boolean) as string[]
  const { data: subs } = ids.length
    ? await supabase.from('v_judge_submissions').select('*').eq('stage_id', d.stage.id).in('company_id', ids)
    : { data: [] }
  // 탭 순서·이름은 단계 제출 항목 설정을 따른다 (예: 발표자료 → 사업계획서(전) → 사업계획서(후)).
  // 설정에 없는 파일은 발표자료 → 사업계획서 순으로 뒤에 붙인다
  const slots = d.stage.required_files ?? []
  const order = (t: string) => { const i = slots.findIndex(f => f.type === t); return i >= 0 ? i : 100 + (t === 'deck' ? 0 : t === 'plan' ? 1 : 2) }
  // 사업계획서는 한 가지만 보여 준다: 사업계획서(후)가 있으면 그것만, 없으면 (전)을. 이름은 '사업계획서'로 통일
  const filesOf = (companyId: string): ViewerFile[] => ((subs ?? []) as JudgeSubmissionRow[])
    .filter(s => s.company_id === companyId)
    .filter((s, _, all) => s.file_type !== 'plan_before' || !all.some(x => x.company_id === companyId && x.file_type === 'plan_after'))
    .sort((a, b) => order(a.file_type) - order(b.file_type) || a.file_type.localeCompare(b.file_type))
    .map(s => ({ submission_id: s.submission_id, file_type: s.file_type, file_name: s.file_name, version: s.version, viewable: s.viewable,
      label: s.file_type === 'plan_before' || s.file_type === 'plan_after' ? '사업계획서' : slots.find(f => f.type === s.file_type)?.label }))
  const files = row.conflict ? [] : filesOf(row.company_id)
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
        <span className="tabular text-sm text-muted">{pos + 1} / {navigable.length}</span>
      </div>

      {row.conflict ? (
        <Alert>이해충돌로 이 기업의 평가에서 제외되었습니다. 자료 열람과 점수 입력이 차단됩니다.</Alert>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]">
          <PdfViewer key={row.company_id} files={files} prefetch={next ? filesOf(next.company_id) : undefined} watermarkName={profile.name || user.email || ''}
            watermarkTitle={`${d.program.title} · ${row.display_name}`}
            className="h-[70vh] lg:h-[calc(100vh-15rem)]" />
          <div className="overflow-hidden rounded-lg border border-line bg-bg lg:h-[calc(100vh-15rem)] lg:overflow-y-auto">
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
              overallRequired={d.stage.overall_comment_required}
            />
          </div>
        </div>
      )}

      {/* 하단 이동: 이전 기업 / 다음 기업. 마지막 기업 다음은 최종 확인(제출 전 점수 검토) */}
      <EvalNav
        assignmentId={row.assignment_id}
        initialMissing={missingItems(d.criteria, d.scores.get(row.assignment_id) ?? [],
          { required: d.stage.overall_comment_required, comment: review?.overall_comment })}
        enforce={!row.conflict && !lock}
        prev={prev ? { href: `${base}/c/${prev.company_id}`, label: `← 이전 기업 · ${prev.display_name}` } : null}
        next={next ? { href: `${base}/c/${next.company_id}`, label: `다음 기업 · ${next.display_name} →` }
          : { href: d.evalSubmitted ? base : `${base}/submit`, label: d.evalSubmitted ? '기업 목록으로' : '최종 확인 →' }} />
    </div>
  )
}
