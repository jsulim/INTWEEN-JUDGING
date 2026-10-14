// 심사위원 풀 분야 (기관 검토용 공유 화면의 탭 순서)
export const POOL_CATEGORIES = [
  { code: '01', label: 'VC · 펀드운용사' },
  { code: '02', label: 'AC · 액셀러레이터' },
  { code: '03', label: '기술지주 · 엔젤 · 기보' },
  { code: '04', label: '대학 · 기술전문가' },
  { code: '05', label: '경영 · 마케팅 컨설팅' },
  { code: '06', label: '관광' },
] as const

/** 주 분야 + 추가 분야 */
export const allCategories = (e: { category: string | null; extra_categories?: string[] | null }) =>
  [e.category, ...(e.extra_categories ?? [])].filter((c, i, a): c is string => !!c && a.indexOf(c) === i)

export const categoryLabel = (code: string | null) => POOL_CATEGORIES.find(c => c.code === code)?.label ?? '기타'

export interface PoolFileInfo {
  category: string | null // 폴더명 앞 두 자리 (01_VC_펀드운용사 → 01)
  name: string
  affiliation: string
  source: string | null   // 추천 경로 (파일명 세 번째 칸)
  docLabel: string | null // 증빙서류면 문서 이름
}

/** 업로드 파일 경로 해석: <분야폴더>/[증빙서류/]이름_소속_추천경로[_증빙명].pdf */
export function parsePoolPath(relPath: string): PoolFileInfo | null {
  const parts = relPath.replace(/\\/g, '/').split('/').filter(Boolean)
  const file = parts[parts.length - 1]
  if (!/\.pdf$/i.test(file)) return null
  const category = parts.map(p => p.match(/^(0[1-9])_/)?.[1]).find(Boolean) ?? null
  const seg = file.replace(/\.pdf$/i, '').split('_')
  if (seg.length < 2) return null
  const isDoc = parts.some(p => p === '증빙서류') && seg.length >= 4
  return {
    category,
    name: seg[0].trim(),
    affiliation: seg[1].trim(),
    source: seg[2]?.trim() || null,
    docLabel: isDoc ? seg.slice(3).join(' ').replace(new RegExp(`^${seg[0]}`), '').trim() || '증빙' : null,
  }
}
