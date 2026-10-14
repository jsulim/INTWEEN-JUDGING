'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { cn } from '@/components/ui'
import PdfViewer, { type ViewerFile } from '@/components/judge/PdfViewer'
import type { PoolProfile } from '@/lib/types'

export interface PoolCard {
  id: string
  name: string
  affiliation: string | null
  position: string | null
  category: string | null
  expertise: string[]
  hasResume: boolean
  docs: string[] // 증빙 이름
  source: string | null // 추천 경로 (예: 인트윈+경상대)
  profile: PoolProfile | null
}

function Star({ on, onClick, className }: { on: boolean; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} title={on ? '선정 해제' : '선정 목록에 담기'}
      className={cn('flex shrink-0 items-center justify-center rounded-md text-xl leading-none transition-colors',
        on ? 'text-amber-400 hover:text-amber-500' : 'text-line hover:text-amber-300', className)}>
      {on ? '★' : '☆'}
    </button>
  )
}

const sourceLabel = (s: string | null) => (s ? `${s.split('+').map(x => x.trim()).filter(Boolean).join(' · ')} 추천` : null)

function ProfilePanel({ c, category, picked, onPick }: { c: PoolCard; category: string; picked: boolean; onPick: () => void }) {
  const p = c.profile ?? {}
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="border-t border-line pt-4">
      <h3 className="mb-2 text-xs font-bold tracking-wide text-primary">{title}</h3>
      {children}
    </section>
  )
  const list = (xs?: string[]) => !!xs?.length && (
    <ul className="grid gap-1.5 text-sm leading-relaxed">{xs.map(x => <li key={x} className="flex gap-2"><span className="text-muted">·</span><span>{x}</span></li>)}</ul>
  )
  const meta = [category, sourceLabel(c.source), p.region].filter(Boolean) as string[]
  return (
    <div className="grid gap-4 rounded-lg border border-line bg-card p-5">
      <div>
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-2xl font-black leading-tight">{c.name}</h2>
          <button type="button" onClick={onPick}
            className={cn('inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-sm font-semibold transition-colors',
              picked ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-line text-muted hover:border-amber-300 hover:text-fg')}>
            <span className={picked ? 'text-amber-400' : ''}>{picked ? '★' : '☆'}</span>{picked ? '선정됨' : '선정하기'}
          </button>
        </div>
        <div className="mt-0.5 text-muted">{c.affiliation}{c.position && ` · ${c.position}`}</div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {meta.map((m, i) => (
            <span key={m} className={cn('rounded-full px-2.5 py-1 text-xs font-semibold',
              i === 0 ? 'bg-primary text-primary-fg' : 'bg-bg text-muted')}>{m}</span>
          ))}
        </div>
        {p.summary && <p className="mt-4 text-[15px] leading-relaxed">{p.summary}</p>}
      </div>
      {!!(p.fields?.length || c.expertise.length) && (
        <Section title="분야">
          <div className="flex flex-wrap gap-1.5">
            {(p.fields?.length ? p.fields : c.expertise).map(x => (
              <span key={x} className="rounded-md bg-[var(--ev-soft)] px-2.5 py-1 text-sm font-semibold text-[var(--ev-deep)]">{x}</span>
            ))}
          </div>
        </Section>
      )}
      {!!p.career?.length && <Section title="주요 경력">{list(p.career)}</Section>}
      {!!p.education?.length && <Section title="학력">{list(p.education)}</Section>}
      {!!p.certs?.length && <Section title="자격"><p className="text-sm leading-relaxed">{p.certs.join(' · ')}</p></Section>}
      {!c.profile && <p className="text-sm text-muted">소개가 아직 등록되지 않았습니다. 이력서를 확인해 주세요.</p>}
    </div>
  )
}

// 분야 탭 → 후보 목록 → 선택한 후보의 이력서·증빙 뷰어 (다운로드 버튼 없음)
export default function PoolViewer({ token, cards, categories, initialPicks }: {
  token: string
  cards: PoolCard[]
  initialPicks: string[]
  categories: { code: string; label: string }[]
}) {
  const [cat, setCat] = useState<string>('all')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string | null>(cards[0]?.id ?? null)
  const viewerRef = useRef<HTMLDivElement>(null)
  // 별표 = 기관 선정 목록 (링크마다 DB에 저장, 열람자 모두 공유)
  const [picks, setPicks] = useState<Set<string>>(() => new Set(initialPicks))
  const [pickError, setPickError] = useState<string | null>(null)
  async function togglePick(id: string) {
    const on = !picks.has(id)
    const apply = (v: boolean) => setPicks(s => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n })
    apply(on)
    setPickError(null)
    try {
      await api(`/api/pool/${token}/pick`, { body: { entry_id: id, picked: on } })
    } catch {
      apply(!on)
      setPickError('선정 목록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    }
  }
  const labelOf = (code: string | null) => categories.find(c => c.code === code)?.label ?? '기타'

  const list = useMemo(() => {
    const k = q.trim().toLowerCase()
    return cards.filter(c => (cat === 'all' || (cat === 'picked' ? picks.has(c.id) : c.category === cat))
      && (!k || [c.name, c.affiliation, c.position, ...c.expertise].some(v => v?.toLowerCase().includes(k))))
  }, [cards, cat, q, picks])
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

  // 이전·다음 후보 (현재 탭·검색 결과 순서). 키보드 ←/→ 도 지원
  const idx = list.findIndex(c => c.id === selected)
  const prev = idx > 0 ? list[idx - 1] : null
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'ArrowLeft' && prev) setSelected(prev.id)
      if (e.key === 'ArrowRight' && next) setSelected(next.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next])

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
        <button type="button" onClick={() => setCat('picked')}
          className={cn('shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
            cat === 'picked' ? 'border-amber-400 bg-amber-400 text-white' : 'border-amber-300 bg-card text-amber-700 hover:bg-amber-50')}>
          ★ 선정 목록<span className="tabular ml-1.5 opacity-80">{picks.size}</span>
        </button>
      </div>
      {pickError && <p className="mt-2 text-sm font-semibold text-danger">{pickError}</p>}

      <div className="mt-4 grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        {/* 목록 */}
        <aside className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:overflow-hidden">
          <div className="flex h-full flex-col rounded-lg border border-line bg-card">
            <div className="border-b border-line p-3">
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름·소속 검색"
                className="h-10 w-full rounded-md border border-line bg-bg px-3 text-sm outline-none focus:border-primary" />
              <div className="mt-2 text-xs text-muted">{list.length}명</div>
            </div>
            <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
              {list.length === 0 && (
                <li className="p-6 text-center text-sm text-muted">
                  {cat === 'picked' ? '아직 선정한 심사위원이 없습니다. 후보 옆 ☆를 눌러 담아 주세요.' : '해당하는 후보가 없습니다.'}
                </li>
              )}
              {list.map((c, i) => (
                <li key={c.id}>
                  {/* 선정 목록은 분야별로 묶어 보여준다 */}
                  {cat === 'picked' && c.category !== list[i - 1]?.category && (
                    <div className="bg-bg px-4 py-1.5 text-xs font-bold text-primary">
                      {labelOf(c.category)} <span className="tabular font-normal text-muted">{list.filter(x => x.category === c.category).length}명</span>
                    </div>
                  )}
                  <div className={cn('flex items-start transition-colors', c.id === selected ? 'bg-primary/10' : 'hover:bg-bg')}>
                  <button type="button" onClick={() => pick(c.id)}
                    className="flex min-w-0 flex-1 items-start gap-3 py-3 pl-4 text-left">
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
                  <Star on={picks.has(c.id)} onClick={() => togglePick(c.id)} className="mx-1 mt-2.5 h-9 w-9" />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* 뷰어 */}
        <section ref={viewerRef} className="min-w-0 scroll-mt-4">
          {current ? (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <button type="button" onClick={() => prev && setSelected(prev.id)} disabled={!prev}
                  className="inline-flex h-10 min-w-0 items-center gap-1.5 rounded-md border border-line bg-card px-3 text-sm font-semibold hover:bg-bg disabled:opacity-40">
                  <span aria-hidden>←</span><span className="truncate">{prev ? `이전 · ${prev.name}` : '이전'}</span>
                </button>
                <span className="tabular shrink-0 text-sm text-muted">{idx >= 0 ? `${idx + 1} / ${list.length}` : ''}</span>
                <button type="button" onClick={() => next && setSelected(next.id)} disabled={!next}
                  className="inline-flex h-10 min-w-0 items-center gap-1.5 rounded-md border border-line bg-card px-3 text-sm font-semibold hover:bg-bg disabled:opacity-40">
                  <span className="truncate">{next ? `다음 · ${next.name}` : '다음'}</span><span aria-hidden>→</span>
                </button>
              </div>
              <div className="mb-3 2xl:hidden"><ProfilePanel c={current} category={labelOf(current.category)} picked={picks.has(current.id)} onPick={() => togglePick(current.id)} /></div>
              <PdfViewer key={current.id} files={files} watermarkName="" resolveUrl={resolveUrl}
                emptyText="등록된 이력서가 없습니다." className="h-[78vh] lg:h-[calc(100vh-9rem)]" />
            </>
          ) : (
            <div className="flex h-[60vh] items-center justify-center rounded-lg border border-line bg-card text-muted">왼쪽 목록에서 후보를 선택하세요.</div>
          )}
        </section>

        {/* 소개 (넓은 화면) */}
        {current && (
          <aside className="hidden 2xl:block 2xl:sticky 2xl:top-4 2xl:h-[calc(100vh-2rem)] 2xl:overflow-y-auto">
            <ProfilePanel c={current} category={labelOf(current.category)} picked={picks.has(current.id)} onPick={() => togglePick(current.id)} />
          </aside>
        )}
      </div>
    </div>
  )
}
