'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { fmtDate } from '@/lib/format'
import { EVENTS } from '@/lib/events'
import { Badge, Button, Card, Input } from '@/components/ui'
import { Check, Feedback, useRun } from '@/components/admin/setup/client'
import type { ResultShare } from '@/lib/types'

// 기관 담당자용 결과 열람 링크: 로그인 없이 종합 평가표·심사위원별 채점 결과·제출 자료를 보기만 한다
export default function ResultShares({ programId, programTitle, shares }: { programId: string; programTitle: string; shares: ResultShare[] }) {
  const { busy, error, notice, run, setNotice } = useRun()
  const [origin, setOrigin] = useState('')
  const [title, setTitle] = useState(`${programTitle} 심사 결과`)
  const [names, setNames] = useState(true)
  useEffect(() => {
    const ev = Object.values(EVENTS).find(e => e.programId === programId && e.host)
    setOrigin(ev ? `https://${ev.host}` : window.location.origin)
  }, [programId])
  const now = Date.now()
  const live = (s: ResultShare) => !s.revoked_at && (!s.expires_at || new Date(s.expires_at).getTime() > now)
  const linkOf = (s: ResultShare) => `${origin}/r/${s.token}`

  const create = () => run(async () => {
    await api('/api/admin/result-shares', { body: { action: 'create', title: title.trim(), program_id: programId, show_judge_names: names, expires_days: 60 } })
  }, { success: '열람 링크를 만들었습니다. 60일 동안 열람할 수 있습니다.' })
  const revoke = (s: ResultShare) => run(async () => {
    if (!confirm('이 링크를 끄면 기관에서 더 이상 열람할 수 없습니다. 끌까요?')) return
    await api('/api/admin/result-shares', { body: { action: 'revoke', id: s.id } })
  }, { success: '링크를 껐습니다.' })

  return (
    <Card title="기관 담당자 열람 링크">
      <Feedback error={error} notice={notice} />
      <div className="grid gap-4 text-sm">
        <p className="text-muted">
          로그인 없이 링크로 <b className="text-fg">종합 평가표 · 심사위원별 채점 결과(종합 심사평 포함) · 발표자료·사업계획서</b>를 볼 수 있습니다.
          보기만 가능하고 수정·다운로드는 할 수 없으며, 점수는 실시간으로 반영됩니다. 언제든 끌 수 있습니다.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Input value={title} onChange={e => setTitle(e.target.value)} className="max-w-sm" placeholder="링크 제목 (기관 화면에 표시)" />
          <Check label="심사위원 이름 표시" hint="끄면 심사위원 A·B·C로 표시" checked={names} onChange={setNames} />
          <Button onClick={create} disabled={busy || !title.trim()}>링크 만들기</Button>
        </div>
        {shares.length > 0 && (
          <ul className="grid gap-2">
            {shares.map(s => (
              <li key={s.id} className="rounded-md border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{s.title}</span>
                  {live(s) ? <Badge tone="accent">열람 가능</Badge> : <Badge>{s.revoked_at ? '꺼짐' : '만료'}</Badge>}
                  <Badge>{s.show_judge_names ? '심사위원 이름 표시' : '심사위원 이름 가림'}</Badge>
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
