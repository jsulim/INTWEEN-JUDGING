import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/server/auth'
import { loadJudgeStage } from '@/app/j/_lib/data'
import StageBoard from '@/app/j/_lib/StageBoard'

export const dynamic = 'force-dynamic'

// J-03 배정 기업 목록: 기업별 평가 상태(미평가/임시저장/완료), 정렬·검색. 블라인드 단계는 코드로만 표시(Q12)
export default async function StageCompanies({ params }: { params: { stageId: string } }) {
  const { supabase, user } = await requireRole('judge')
  const d = await loadJudgeStage(supabase, user.id, params.stageId)
  if (!d) notFound()
  return <StageBoard d={d} variant="page" />
}
