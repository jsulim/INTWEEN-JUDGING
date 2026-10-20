import type { ReactNode } from 'react'
import { fmtScore } from '@/lib/format'
import { groupSpans } from '@/lib/criteria-groups'

type C = { id: string; name: string; max_score: number | string; group_name?: string | null }

// 평가항목 표 머리글: 대항목이 있으면 두 줄(대항목 병합 / 세부 항목), 없으면 한 줄.
// lead·tail 은 앞뒤 고정 열 (대항목이 있을 때 두 줄을 세로로 병합하도록 rowSpan 을 받는다)
export default function CriteriaHead<T extends C>({ criteria, lead, tail, cell, align = 'text-center', top }: {
  criteria: T[]
  lead: (rowSpan: number) => ReactNode
  tail: (rowSpan: number) => ReactNode
  cell: (c: T) => ReactNode
  align?: string
  /** 머리글 맨 위 행 (인쇄 때 쪽마다 반복된다) */
  top?: ReactNode
}) {
  const groups = groupSpans(criteria)
  if (!groups) return <thead>{top}<tr>{lead(1)}{criteria.map(cell)}{tail(1)}</tr></thead>
  return (
    <thead>
      {top}
      <tr>
        {lead(2)}
        {groups.map((g, i) => (
          <th key={i} colSpan={g.span} className={`${align} border-b border-line`}>
            {g.name || '기타'}<span className="tabular ml-1 text-xs font-normal">{fmtScore(g.max)}점</span>
          </th>
        ))}
        {tail(2)}
      </tr>
      <tr>{criteria.map(cell)}</tr>
    </thead>
  )
}
