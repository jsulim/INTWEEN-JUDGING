import type { NavItem } from '@/components/AppShell'
import type { Role } from '@/lib/types'

export const AREA: Record<Role, string> = { company: '참가 기업', judge: '심사위원', admin: '관리자' }

export const NAV: Record<Role, NavItem[]> = {
  company: [
    { href: '/c', label: '대시보드', exact: true },
    { href: '/c/company', label: '기업 정보' },
    { href: '/c/apply', label: '신청서' },
    { href: '/c/submit', label: '자료 제출' },
    { href: '/c/results', label: '결과 확인' },
    { href: '/c/notices', label: '공지사항' },
    { href: '/c/appeals', label: '이의신청' },
  ],
  judge: [
    { href: '/j', label: '대시보드', exact: true },
    { href: '/j/consent', label: '동의서' },
    { href: '/j/payment', label: '수당 지급 정보' },
  ],
  admin: [
    { href: '/a', label: '통합 대시보드', exact: true },
    { href: '/a/programs', label: '프로그램' },
    { href: '/a/pool', label: '심사위원 풀' },
    { href: '/a/audit', label: '감사로그' },
  ],
}
