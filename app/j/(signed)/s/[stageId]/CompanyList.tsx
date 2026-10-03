'use client'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Empty, Input, Select, Table, cn } from '@/components/ui'
import { EvalStateBadge } from '@/components/judge/EvalStateBadge'
import { naturalCompare, type EvalState } from '@/components/judge/progress'
import { fmtScore } from '@/lib/format'

export interface ListRow {
  company_id: string
  name: string
  code: string | null
  field: string | null
  state: EvalState
  total: number | null
}

type SortKey = 'code' | 'name' | 'state' | 'score_desc' | 'score_asc'
const STATE_ORDER: Record<EvalState, number> = { none: 0, draft: 1, done: 2, conflict: 3 }

export default function CompanyList({ base, rows, maxTotal, blind }: { base: string; rows: ListRow[]; maxTotal: number; blind: boolean }) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortKey>('code')
  const [filter, setFilter] = useState<EvalState | 'all'>('all')

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const out = rows.filter(r => (filter === 'all' || r.state === filter)
      && (!kw || [r.name, r.code, r.field].some(v => v?.toLowerCase().includes(kw))))
    const byCode = (a: ListRow, b: ListRow) => naturalCompare(a.code ?? a.name, b.code ?? b.name)
    const cmp: Record<SortKey, (a: ListRow, b: ListRow) => number> = {
      code: byCode,
      name: (a, b) => naturalCompare(a.name, b.name),
      state: (a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || byCode(a, b),
      score_desc: (a, b) => (b.total ?? -1) - (a.total ?? -1) || byCode(a, b),
      score_asc: (a, b) => (a.total ?? Infinity) - (b.total ?? Infinity) || byCode(a, b),
    }
    return out.sort(cmp[sort])
  }, [rows, q, sort, filter])

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder={blind ? '코드·분야 검색' : '기업명·코드·분야 검색'} className="max-w-xs" />
        <Select value={filter} onChange={e => setFilter(e.target.value as EvalState | 'all')} className="w-36">
          <option value="all">전체 상태</option>
          <option value="none">미평가</option>
          <option value="draft">임시저장</option>
          <option value="done">완료</option>
          <option value="conflict">제외(이해충돌)</option>
        </Select>
        <Select value={sort} onChange={e => setSort(e.target.value as SortKey)} className="w-36">
          <option value="code">코드순</option>
          {!blind && <option value="name">이름순</option>}
          <option value="state">상태순</option>
          <option value="score_desc">내 점수 높은순</option>
          <option value="score_asc">내 점수 낮은순</option>
        </Select>
      </div>
      {list.length === 0 ? <Empty>조건에 맞는 기업이 없습니다.</Empty> : (
        <Table>
          <thead>
            <tr>
              <th className="w-24">코드</th>
              <th>{blind ? '표시명' : '기업명'}</th>
              <th className="hidden sm:table-cell">분야</th>
              <th>상태</th>
              <th className="text-right">내 점수</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map(r => {
              const excluded = r.state === 'conflict'
              return (
                <tr key={r.company_id} className={cn(excluded ? 'text-muted' : 'hover:bg-bg')}>
                  <td className="tabular">{r.code ?? '-'}</td>
                  <td className="font-semibold">
                    {excluded ? r.name : <Link href={`${base}/c/${r.company_id}`} className="hover:text-primary">{r.name}</Link>}
                  </td>
                  <td className="hidden text-muted sm:table-cell">{r.field ?? '-'}</td>
                  <td><EvalStateBadge state={r.state} /></td>
                  <td className="tabular text-right">{excluded ? '-' : <>{fmtScore(r.total)}<span className="text-muted"> / {fmtScore(maxTotal)}</span></>}</td>
                  <td className="text-right">
                    {!excluded && (
                      <Link href={`${base}/c/${r.company_id}`} className="text-sm font-semibold text-primary hover:underline">
                        {r.state === 'done' ? '보기' : '평가'}
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}
    </div>
  )
}
