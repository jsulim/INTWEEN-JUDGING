import { notFound } from 'next/navigation'
import ProgramNav from '@/components/ProgramNav'
import { requireRole } from '@/lib/server/auth'

export default async function ProgramLayout({ children, params }: { children: React.ReactNode; params: { id: string } }) {
  const { supabase } = await requireRole('admin')
  const { data: program } = await supabase.from('programs').select('id, title').eq('id', params.id).maybeSingle()
  if (!program) notFound()
  return (
    <>
      <ProgramNav programId={program.id} title={program.title} />
      {children}
    </>
  )
}
