'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { fmtDate } from '@/lib/format'
import { EVENTS } from '@/lib/events'
import { categoryLabel } from '@/lib/pool'
import { Badge, Button, Card, Input } from '@/components/ui'
import { Feedback, useRun } from '@/components/admin/setup/client'
import type { PoolShare } from '@/lib/types'

// 기관 검토용 심사위원 풀 공유 링크 (회의: 기관이 이력을 보고 고르는 페이지, 링크 하나로 전달, 외부 비공개)
export default function PoolShares({ programId, programTitle, shares, poolCount, picks }: {
  programId: string; programTitle: string; shares: PoolShare[]; poolCount: number
  picks: Record<string, { name: string; affiliation: string | null; category: string | null }[]>
}) {
  const { busy, error, notice, run, setNotice } = useRun()
  const [origin, setOrigin] = useState('')
  const [title, setTitle] = useState(`${programTitle} 심사위원 후보`)
  useEffect(() => {
    const ev = Object.values(EVENTS).find(e => e.programId === programId && e.host)
    setOrigin(ev ? `https://${ev.host}` : window.location.origin)
  }, [programId])
  const now = Date.now()
  const live = (s: PoolShare) => !s.revoked_at && (!s.expires_at || new Date(s.expires_at).getTime() > now)
  const linkOf = (s: PoolShare) => `${origin}/pool/${s.token}`

  const create = () => run(async () => {
    await api('/api/admin/pool-shares', { body: { action: 'create', title: title.trim(), program_id: programId, expires_days: 30 } })
  }, { success: '공유 링크를 만들었습니다. 30일 동안 열람할 수 있습니다.' })
  const revoke = (s: PoolShare) => run(async () => {
    if (!confirm('이 링크를 끄면 기관에서 더 이상 열람할 수 없습니다. 끌까요?')) return
    await api('/api/admin/pool-shares', { body: { action: 'revoke', id: s.id } })
  }, { success: '링크를 껐습니다.' })

  return (
    <Card title="심사위원 풀 공유 (기관 검토용)">
      <Feedback error={error} notice={notice} />
      <div className="grid gap-4 text-sm">
        <p className="text-muted">
          심사위원 후보 이력서를 분야별로 볼 수 있는 링크를 만들어 기관에 전달합니다. 링크를 아는 사람만 열람할 수 있고(다운로드 불가),
          언제든 끌 수 있습니다. 이 대회 후보 <b className="text-fg">{poolCount}명</b> ·
          후보 등록은 <Link href="/a/pool" className="font-semibold text-primary hover:underline">심사위원 풀</Link>에서 이 대회를 선택해 합니다.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={title} onChange={e => setTitle(e.target.value)} className="max-w-sm" placeholder="링크 제목 (기관 화면에 표시)" />
          <Button onClick={create} disabled={busy || !title.trim() || poolCount === 0}>링크 만들기</Button>
        </div>
        {shares.length > 0 && (
          <ul className="grid gap-2">
            {shares.map(s => (
              <li key={s.id} className="rounded-md border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{s.title}</span>
                  {live(s) ? <Badge tone="accent">열람 가능</Badge> : <Badge>{s.revoked_at ? '꺼짐' : '만료'}</Badge>}
                  <span className="text-xs text-muted">열람 {s.view_count}회{s.last_viewed_at ? ` · 최근 ${fmtDate(s.last_viewed_at)}` : ''} · 기한 {fmtDate(s.expires_at)}</span>
                </div>
                {live(s) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Input readOnly value={linkOf(s)} className="max-w-xl font-mono text-xs" onFocus={e => e.target.select()} />
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(linkOf(s)); setNotice('링크를 복사했습니다.') }}>복사</Button>
                    <a href={linkOf(s)} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary hover:underline">미리 보기</a>
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => revoke(s)} disabled={busy}>끄기</Button>
                  </div>
                )}
                {!!picks[s.id]?.length && (
                  <div className="mt-2 rounded-md bg-bg p-2.5">
                    <div className="text-xs font-bold text-primary">★ 기관 선정 {picks[s.id].length}명</div>
                    <div className="mt-1 grid gap-0.5 text-xs">
                      {Object.entries(picks[s.id].reduce<Record<string, string[]>>((g, p) => {
                        (g[categoryLabel(p.category)] ??= []).push(p.affiliation ? `${p.name}(${p.affiliation})` : p.name); return g
                      }, {})).map(([cat, names]) => <div key={cat}><span className="text-muted">{cat}</span> · {names.join(', ')}</div>)}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
