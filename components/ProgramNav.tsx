'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/components/ui'

// 관리자 프로그램 하위 화면 (/a/p/[id]/…) 탭
export const PROGRAM_TABS = [
  { seg: '', label: '대시보드' },
  { seg: 'settings', label: '설정·신청서' },
  { seg: 'stages', label: '단계' },
  { seg: 'criteria', label: '평가항목' },
  { seg: 'companies', label: '기업' },
  { seg: 'eligibility', label: '적격 검토' },
  { seg: 'judges', label: '심사위원' },
  { seg: 'consents', label: '동의서 양식' },
  { seg: 'assignments', label: '배정' },
  { seg: 'presentations', label: '발표 진행' },
  { seg: 'results', label: '평가 결과' },
  { seg: 'export', label: '내보내기' },
  { seg: 'appeals', label: '이의신청' },
  { seg: 'payments', label: '정산' },
  { seg: 'notices', label: '공지' },
]

export default function ProgramNav({ programId, title }: { programId: string; title: string }) {
  const pathname = usePathname()
  const base = `/a/p/${programId}`
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center gap-2 text-sm text-muted">
        <Link href="/a/programs" className="hover:text-fg">프로그램</Link><span>/</span>
        <span className="font-semibold text-fg">{title}</span>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-line">
        {PROGRAM_TABS.map(t => {
          const href = t.seg ? `${base}/${t.seg}` : base
          const active = t.seg ? pathname.startsWith(href) : pathname === base
          return (
            <Link key={t.seg} href={href}
              className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold',
                active ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-fg')}>
              {t.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
