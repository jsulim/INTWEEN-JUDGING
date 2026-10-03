import { Badge, Empty, PageHeader } from '@/components/ui'
import { requireRole } from '@/lib/server/auth'
import { fmtDate } from '@/lib/format'
import { loadMyCompanies } from '../_lib/server'
import type { Notice } from '@/lib/types'

// C-05 공지사항: 참여 프로그램 공지 (RLS 가 대상 역할로 필터)
export default async function NoticesPage({ searchParams }: { searchParams: { id?: string } }) {
  const { supabase, user } = await requireRole('company')
  const [companies, { data }] = await Promise.all([
    loadMyCompanies(supabase, user.id),
    supabase.from('notices').select('*').order('created_at', { ascending: false }).limit(200),
  ])
  const notices = (data ?? []) as Notice[]
  const programTitle = new Map(companies.map(c => [c.program_id, c.programs?.title ?? '']))
  const multi = programTitle.size > 1
  const recentMs = 3 * 86_400_000

  return (
    <>
      <PageHeader title="공지사항" />
      {notices.length ? (
        <ul className="grid max-w-3xl gap-2">
          {notices.map((n, i) => (
            <li key={n.id} id={`n-${n.id}`} className="scroll-mt-20">
              <details open={searchParams.id ? searchParams.id === n.id : i === 0} className="group rounded-lg border border-line bg-card">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {multi && <Badge>{programTitle.get(n.program_id)}</Badge>}
                      {Date.now() - new Date(n.created_at).getTime() < recentMs && <Badge tone="primary">새 공지</Badge>}
                    </div>
                    <div className="mt-0.5 font-semibold">{n.title}</div>
                    <div className="tabular text-xs text-muted">{fmtDate(n.created_at)}</div>
                  </div>
                  <span className="mt-1 text-muted transition-transform group-open:rotate-90" aria-hidden>›</span>
                </summary>
                <div className="whitespace-pre-wrap break-words border-t border-line px-4 py-4 text-[15px] leading-relaxed">{n.body || '내용 없음'}</div>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>등록된 공지가 없습니다.</Empty>
      )}
    </>
  )
}
