'use client'
import { useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { cn } from '@/components/ui'
import PdfViewer, { type ViewerFile } from '@/components/judge/PdfViewer'

export interface PoolCard {
  id: string
  name: string
  affiliation: string | null
  position: string | null
  category: string | null
  expertise: string[]
  hasResume: boolean
  docs: string[] // 증빙 이름
}

// 분야 탭 → 후보 목록 → 선택한 후보의 이력서·증빙 뷰어 (다운로드 버튼 없음)
export default function PoolViewer({ token, cards, categories }: {
  token: string
  cards: PoolCard[]
  categories: { code: string; label: string }[]
}) {
  const [cat, setCat] = useState<string>('all')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string | null>(cards[0]?.id ?? null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const labelOf = (code: string | null) => categories.find(c => c.code === code)?.label ?? '기타'

  const list = useMemo(() => {
    const k = q.trim().toLowerCase()
    return cards.filter(c => (cat === 'all' || c.category === cat)
      && (!k || [c.name, c.affiliation, c.position, ...c.expertise].some(v => v?.toLowerCase().includes(k))))
  }, [cards, cat, q])
  const current = cards.find(c => c.id === selected) ?? null

  const files: ViewerFile[] = current
    ? [
        ...(current.hasResume ? [{ submission_id: `${current.id}:-1`, file_type: '이력서', file_name: `${current.name} 이력서`, version: 0, viewable: true }] : []),
        ...current.docs.map((d, i) => ({ submission_id: `${current.id}:${i}`, file_type: `증빙 · ${d}`, file_name: `${current.name} ${d}`, version: 0, viewable: true })),
      ]
    : []
  const resolveUrl = async (f: ViewerFile) => {
    const [entry_id, doc] = f.submission_id.split(':')
    return (await api<{ url: string }>(`/api/pool/${token}/file`, { body: { entry_id, doc: Number(doc) } })).url
  }

  function pick(id: string) {
    setSelected(id)
    // 좁은 화면에서는 목록 아래 뷰어로 이동
    if (window.innerWidth < 1024) setTimeout(() => viewerRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const count = (code: string) => cards.filter(c => c.category === code).length

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
      {/* 분야 탭 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[{ code: 'all', label: '전체' }, ...categories].map(c => {
          const n = c.code === 'all' ? cards.length : count(c.code)
          return (
            <button key={c.code} type="button" onClick={() => setCat(c.code)}
              className={cn('shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                cat === c.code ? 'border-primary bg-primary text-primary-fg' : 'border-line bg-card text-muted hover:text-fg')}>
              {c.code !== 'all' && <span className="mr-1 opacity-70">{c.code}</span>}{c.label}
              <span className="tabular ml-1.5 opacity-80">{n}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* 목록 */}
        <aside className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:overflow-hidden">
          <div className="flex h-full flex-col rounded-lg border border-line bg-card">
            <div className="border-b border-line p-3">
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름·소속 검색"
                className="h-10 w-full rounded-md border border-line bg-bg px-3 text-sm outline-none focus:border-primary" />
              <div className="mt-2 text-xs text-muted">{list.length}명</div>
            </div>
            <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
              {list.length === 0 && <li className="p-6 text-center text-sm text-muted">해당하는 후보가 없습니다.</li>}
              {list.map(c => (
                <li key={c.id}>
                  <button type="button" onClick={() => pick(c.id)}
                    className={cn('flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                      c.id === selected ? 'bg-primary/10' : 'hover:bg-bg')}>
                    <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                      c.id === selected ? 'bg-primary text-primary-fg' : 'bg-[var(--ev-soft)] text-[var(--ev-deep)]')}>
                      {c.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{c.name}{c.position && <span className="ml-1 text-sm font-normal text-muted">{c.position}</span>}</span>
                      <span className="block truncate text-sm text-muted">{c.affiliation}</span>
                      {cat === 'all' && <span className="mt-1 inline-block rounded bg-bg px-1.5 py-0.5 text-[11px] text-muted">{labelOf(c.category)}</span>}
                    </span>
                    {c.docs.length > 0 && <span className="shrink-0 rounded-full bg-bg px-2 py-0.5 text-[11px] text-muted">증빙 {c.docs.length}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* 뷰어 */}
        <section ref={viewerRef} className="min-w-0 scroll-mt-4">
          {current ? (
            <>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-primary">{labelOf(current.category)}</div>
                  <h2 className="text-2xl font-black">{current.name}{current.position && <span className="ml-2 text-base font-semibold text-muted">{current.position}</span>}</h2>
                  <div className="text-muted">{current.affiliation}</div>
                </div>
                {current.expertise.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {current.expertise.map(x => <span key={x} className="rounded-full bg-card px-2.5 py-1 text-xs font-semibold text-muted">{x}</span>)}
                  </div>
                )}
              </div>
              <PdfViewer key={current.id} files={files} watermarkName="" resolveUrl={resolveUrl}
                emptyText="등록된 이력서가 없습니다." className="h-[78vh] lg:h-[calc(100vh-9rem)]" />
            </>
          ) : (
            <div className="flex h-[60vh] items-center justify-center rounded-lg border border-line bg-card text-muted">왼쪽 목록에서 후보를 선택하세요.</div>
          )}
        </section>
      </div>
    </div>
  )
}
