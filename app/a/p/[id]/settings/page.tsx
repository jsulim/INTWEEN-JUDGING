import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/server/auth'
import type { ApplicationField, Program } from '@/lib/types'
import ProgramSettingsForm from './ProgramSettingsForm'
import FieldBuilder from './FieldBuilder'

export const dynamic = 'force-dynamic'

// 프로그램 설정 + 신청서 커스텀 필드 빌더 (A-02, 4-1 '신청서 커스텀 필드')
export default async function SettingsPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireRole('admin')
  const [{ data: program }, { data: fields }, { count: answerCount }] = await Promise.all([
    supabase.from('programs').select('*').eq('id', params.id).maybeSingle(),
    supabase.from('application_fields').select('*').eq('program_id', params.id).order('order_no').order('created_at'),
    supabase.from('companies').select('id', { count: 'exact', head: true }).eq('program_id', params.id).not('application_submitted_at', 'is', null),
  ])
  if (!program) notFound()
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">설정·신청서</h1>
      <ProgramSettingsForm program={program as Program} />
      <FieldBuilder programId={params.id} fields={(fields ?? []) as ApplicationField[]} submittedCount={answerCount ?? 0} />
    </div>
  )
}
