import { requireRole } from '@/lib/server/auth'
import type { Notice } from '@/lib/types'
import NoticesManager from './NoticesManager'

export const dynamic = 'force-dynamic'

// 공지 관리 (C-05 기업 공지사항 / 심사위원 대상 공지)
export default async function NoticesPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireRole('admin')
  const { data } = await supabase.from('notices').select('*').eq('program_id', params.id).order('created_at', { ascending: false })
  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">공지</h1>
      <NoticesManager programId={params.id} notices={(data ?? []) as Notice[]} />
    </>
  )
}
