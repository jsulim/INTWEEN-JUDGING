import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/server/auth'
import type { PresentationSlot } from '@/lib/types'
import { loadJudgeStage, rowLock } from '@/app/j/_lib/data'
import LiveBoard, { type LiveCompany } from './LiveBoard'

export const dynamic = 'force-dynamic'

// J-06 발표심사 현장 모드 (태블릿 최적화): 발표 순서·타이머, 현재 발표 기업 자동 전환(Q15), 빠른 채점 + 질의응답 메모
export default async function LivePage({ params }: { params: { stageId: string } }) {
  const { supabase, user } = await requireRole('judge')
  const d = await loadJudgeStage(supabase, user.id, params.stageId)
  if (!d) notFound()
  const { data: slots } = await supabase.from('presentation_slots').select('*').eq('stage_id', d.stage.id).order('order_no')

  const companies: LiveCompany[] = d.rows.map(r => {
    const review = d.reviews.get(r.assignment_id)
    return {
      company_id: r.company_id,
      assignment_id: r.assignment_id,
      name: r.display_name,
      field: r.field,
      conflict: r.conflict,
      lock: rowLock(d, r),
      scores: d.scores.get(r.assignment_id) ?? [],
      review: review ? { overall_comment: review.overall_comment, qna_memo: review.qna_memo } : null,
    }
  })

  return (
    <LiveBoard
      stage={{ id: d.stage.id, name: d.stage.name, status: d.stage.status }}
      programTitle={d.program.title}
      criteria={d.criteria}
      companies={companies}
      initialSlots={(slots ?? []) as PresentationSlot[]}
      canReportConflict={d.stage.status === 'evaluating' && !d.evalSubmitted}
    />
  )
}
