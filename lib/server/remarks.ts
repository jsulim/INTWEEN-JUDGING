import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/server/auth'

/**
 * 심사위원별 채점표 '비고' 저장. allJudges 면 같은 단계·같은 팀의 모든 심사위원 배정에 같은 비고 (일괄 적용).
 * 빈 값이면 지운다. programId 를 주면 그 대회의 배정인지 확인한다 (결과 열람 링크).
 */
export async function saveRemark(db: SupabaseClient, p: {
  assignmentId: string; remark: string; allJudges: boolean; userId: string | null; programId?: string
}) {
  const { data: asg } = await db.from('assignments')
    .select('id, stage_id, company_id, stages!inner(program_id)').eq('id', p.assignmentId).maybeSingle()
  const a = asg as unknown as { id: string; stage_id: string; company_id: string; stages: { program_id: string } } | null
  if (!a || (p.programId && a.stages.program_id !== p.programId)) throw new ApiError(404, '배정을 찾을 수 없습니다.')

  let ids = [a.id]
  if (p.allJudges) {
    const { data: rows } = await db.from('assignments').select('id').eq('stage_id', a.stage_id).eq('company_id', a.company_id)
    ids = (rows ?? []).map(x => x.id as string)
  }
  const remark = p.remark.trim()
  const now = new Date().toISOString()
  const { error } = remark
    ? await db.from('assignment_remarks').upsert(ids.map(id => ({ assignment_id: id, remark, updated_by: p.userId, updated_at: now })))
    : await db.from('assignment_remarks').delete().in('assignment_id', ids)
  if (error) {
    if (/assignment_remarks/.test(error.message)) throw new ApiError(503, '비고 기능의 DB 설정(SQL)이 아직 적용되지 않았습니다.')
    throw new Error(error.message)
  }
  return { count: ids.length }
}
