'use client'
import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { fmtDate } from '@/lib/format'
import { Badge, Button, Card, Input, Table } from '@/components/ui'
import { Check, Feedback, must, useRun } from '@/components/admin/setup/client'
import { EVENTS } from '@/lib/events'
import type { JudgeRequest } from '@/lib/types'

// 심사위원 자가 가입 신청 (A-06). 가입 링크를 열어 두면 심사위원이 Google·이메일로 신청하고, 여기서 승인한다.
export default function JudgeRequests({ programId, open, requests }: { programId: string; open: boolean; requests: JudgeRequest[] }) {
  const { busy, error, notice, run, setNotice } = useRun()
  const [link, setLink] = useState('')
  useEffect(() => {
    // 대회 전용 주소가 연결된 프로그램이면 그 주소의 짧은 링크를 안내한다
    const ev = Object.values(EVENTS).find(e => e.programId === programId && e.host)
    setLink(ev ? `https://${ev.host}/join` : `${window.location.origin}/join/${programId}`)
  }, [programId])
  const pending = requests.filter(r => r.status === 'pending')
  const done = requests.filter(r => r.status !== 'pending')

  const toggle = (v: boolean) => run(async () => {
    must(await supabaseBrowser().from('programs').update({ judge_signup_open: v }).eq('id', programId))
  }, { success: v ? '가입 신청을 받습니다.' : '가입 신청을 닫았습니다.' })

  const decide = (r: JudgeRequest, action: 'approve' | 'reject') => run(async () => {
    if (action === 'reject' && !confirm(`${r.name} 님의 신청을 반려할까요?`)) return
    await api('/api/admin/judge-requests', { body: { id: r.id, action } })
    setNotice(action === 'approve' ? `${r.name} 님을 심사위원으로 승인했습니다.` : `${r.name} 님의 신청을 반려했습니다.`)
  })

  return (
    <Card title={<span className="flex items-center gap-2">심사위원 가입 신청{pending.length > 0 && <Badge tone="highlight">승인 대기 {pending.length}</Badge>}</span>}>
      <Feedback error={error} notice={notice} />
      <div className="grid gap-4">
        <Check label="가입 신청 받기" checked={open} onChange={toggle}
          hint="켜면 아래 링크로 심사위원이 직접 계정(Google 또는 이메일)을 만들어 신청합니다. 승인 전에는 아무 화면도 볼 수 없습니다." />
        {open && (
          <div className="flex flex-wrap items-center gap-2">
            <Input readOnly value={link} className="max-w-md font-mono text-xs" onFocus={e => e.target.select()} />
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(link); setNotice('가입 링크를 복사했습니다.') }}>링크 복사</Button>
          </div>
        )}
        {pending.length > 0 && (
          <Table>
            <thead><tr><th>이름</th><th>이메일</th><th>연락처</th><th>소속·전문분야</th><th>신청일</th><th /></tr></thead>
            <tbody>
              {pending.map(r => (
                <tr key={r.id}>
                  <td className="font-semibold">{r.name}</td>
                  <td className="text-xs">{r.email}</td>
                  <td className="tabular whitespace-nowrap">{r.phone ?? '-'}</td>
                  <td className="text-sm">{r.org ?? '-'}{r.expertise && <div className="text-xs text-muted">{r.expertise}</div>}</td>
                  <td className="whitespace-nowrap text-xs text-muted">{fmtDate(r.created_at)}</td>
                  <td>
                    <div className="flex justify-end gap-1 whitespace-nowrap">
                      <Button size="sm" onClick={() => decide(r, 'approve')} disabled={busy}>승인</Button>
                      <Button size="sm" variant="ghost" className="text-danger" onClick={() => decide(r, 'reject')} disabled={busy}>반려</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {pending.length === 0 && open && <p className="text-sm text-muted">대기 중인 신청이 없습니다.</p>}
        {done.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">처리한 신청 {done.length}건</summary>
            <ul className="mt-2 grid gap-1">
              {done.map(r => (
                <li key={r.id} className="flex items-center gap-2">
                  <Badge tone={r.status === 'approved' ? 'accent' : 'neutral'}>{r.status === 'approved' ? '승인' : '반려'}</Badge>
                  {r.name} <span className="text-xs text-muted">{r.email} · {fmtDate(r.decided_at)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <p className="text-xs text-muted">신청 이메일이 본인 것인지 이름·연락처로 확인한 뒤 승인해 주세요. 승인하면 아래 심사위원 목록에 추가되고 동의서 서명부터 시작합니다.</p>
      </div>
    </Card>
  )
}
