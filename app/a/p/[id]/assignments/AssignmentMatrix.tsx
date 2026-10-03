'use client'
import { useMemo, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Alert, Badge, Button, Card, Empty, Table, cn } from '@/components/ui'
import { EligibilityBadge } from '@/components/StatusBadges'
import { Feedback, must, useRun } from '@/components/admin/setup/client'
import { fmtDate } from '@/lib/format'
import type { Assignment, Eligibility, Stage } from '@/lib/types'

type Co = { id: string; name: string; blind_code: string | null; field: string | null; eligibility: Eligibility }
type Ju = { id: string; name: string; is_chair: boolean; expertise: string | null }
type Asg = Assignment & { conflict_reported_at: string | null }

const key = (j: string, c: string) => `${j}:${c}`

export default function AssignmentMatrix({ stage, companies, judges, assignments, scoreCount }:
  { stage: Stage; companies: Co[]; judges: Ju[]; assignments: Asg[]; scoreCount: Record<string, number> }) {
  const { busy, error, notice, run } = useRun()
  const [hideIneligible, setHideIneligible] = useState(false)
  const map = useMemo(() => new Map(assignments.map(a => [key(a.judge_id, a.company_id), a])), [assignments])
  const locked = stage.status === 'locked' || stage.status === 'published'
  const eligible = companies.filter(c => c.eligibility !== 'ineligible')
  const shown = hideIneligible ? eligible : companies
  const sb = supabaseBrowser()

  async function insertPairs(pairs: { judge_id: string; company_id: string }[], msg: string) {
    const missing = pairs.filter(p => !map.has(key(p.judge_id, p.company_id)))
    if (!missing.length) return alert('추가로 배정할 조합이 없습니다.')
    await run(async () => {
      must(await sb.from('assignments').upsert(missing.map(p => ({ stage_id: stage.id, ...p })),
        { onConflict: 'stage_id,judge_id,company_id', ignoreDuplicates: true, defaultToNull: false }))
    }, { success: `${msg}: ${missing.length}건 배정` })
  }

  const assignAll = () => {
    if (!confirm(`심사위원 ${judges.length}명 × 심사 대상 기업 ${eligible.length}곳을 전원 배정합니다.\n(이해충돌로 제외된 조합은 그대로 유지)`)) return
    insertPairs(judges.flatMap(j => eligible.map(c => ({ judge_id: j.id, company_id: c.id }))), '전원 배정')
  }

  async function clearUnscored() {
    const targets = assignments.filter(a => !a.conflict && !scoreCount[a.id])
    if (!targets.length) return alert('해제할 배정이 없습니다. (점수가 입력된 배정·이해충돌 기록은 유지)')
    if (!confirm(`점수가 입력되지 않은 배정 ${targets.length}건을 해제합니다.`)) return
    await run(async () => { must(await sb.from('assignments').delete().in('id', targets.map(a => a.id))) }, { success: `${targets.length}건 해제` })
  }

  async function toggle(j: Ju, c: Co) {
    const a = map.get(key(j.id, c.id))
    if (!a) return run(async () => { must(await sb.from('assignments').insert({ stage_id: stage.id, judge_id: j.id, company_id: c.id })) })
    if (a.conflict) return restore(a, j.name, c.name)
    const n = scoreCount[a.id] ?? 0
    if (n > 0 && !confirm(`${j.name} → ${c.name} 배정을 해제합니다.\n입력된 점수 ${n}건과 심사평이 함께 삭제됩니다. 이해충돌이라면 '충돌 제외'를 사용하세요.`)) return
    await run(async () => { must(await sb.from('assignments').delete().eq('id', a.id)) })
  }

  async function markConflict(j: Ju, c: Co) {
    const reason = prompt(`${j.name} → ${c.name}\n이해충돌 제외 사유`, '이해관계 있음')?.trim()
    if (!reason) return
    const a = map.get(key(j.id, c.id))
    await run(async () => {
      if (a) must(await sb.from('assignments').update({ conflict: true, conflict_reason: reason }).eq('id', a.id))
      else must(await sb.from('assignments').insert({ stage_id: stage.id, judge_id: j.id, company_id: c.id, conflict: true, conflict_reason: reason }))
    }, { success: '이해충돌로 제외했습니다. 해당 배정은 열람·평가·집계에서 빠집니다.' })
  }

  async function restore(a: Asg, jName: string, cName: string) {
    if (!confirm(`${jName} → ${cName}\n이해충돌 제외를 해제하고 다시 배정합니다.${a.conflict_reported_at ? '\n(심사위원 본인이 신고한 건입니다)' : ''}\n사유: ${a.conflict_reason ?? '-'}`)) return
    await run(async () => {
      must(await sb.from('assignments').update({ conflict: false, conflict_reason: null, conflict_reported_at: null }).eq('id', a.id))
    }, { success: '복구했습니다.' })
  }

  const conflicts = assignments.filter(a => a.conflict)
  const judgeName = new Map(judges.map(j => [j.id, j.name]))
  const coName = new Map(companies.map(c => [c.id, c.name]))
  const total = assignments.filter(a => !a.conflict).length

  if (!judges.length || !companies.length) {
    return <Empty>{!judges.length ? '등록된 심사위원이 없습니다. 심사위원 관리에서 먼저 등록하세요.' : '이 단계의 참가 기업이 없습니다.'}</Empty>
  }

  return (
    <div className="grid gap-5">
      <Feedback error={error} notice={notice} />
      {locked && <Alert>확정된 단계입니다. 배정을 변경할 수 없습니다.</Alert>}
      {stage.status === 'evaluating' && <Alert tone="highlight">평가가 진행 중입니다. 배정 해제 시 해당 심사위원이 입력한 점수가 삭제됩니다. 이해충돌은 &apos;충돌 제외&apos;로 처리하세요.</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={assignAll} disabled={busy || locked}>전원 배정</Button>
        <Button variant="outline" onClick={clearUnscored} disabled={busy || locked}>미평가 배정 해제</Button>
        <label className="ml-2 flex items-center gap-1 text-sm"><input type="checkbox" checked={hideIneligible} onChange={e => setHideIneligible(e.target.checked)} />부적격 기업 숨기기</label>
        <span className="ml-auto text-sm text-muted">유효 배정 <b className="tabular text-fg">{total}</b>건 · 이해충돌 제외 <b className="tabular text-fg">{conflicts.length}</b>건</span>
      </div>

      <Table>
        <thead>
          <tr>
            <th className="sticky left-0 z-10">기업 \ 심사위원</th>
            {judges.map(j => {
              const n = assignments.filter(a => a.judge_id === j.id && !a.conflict).length
              return (
                <th key={j.id} className="text-center">
                  <div className="text-fg">{j.name}{j.is_chair && <span className="ml-1 text-xs text-primary">위원장</span>}</div>
                  <div className="tabular text-xs font-normal">{n}곳</div>
                  {!locked && <button className="text-xs font-normal text-primary hover:underline disabled:opacity-50" disabled={busy}
                    onClick={() => insertPairs(eligible.map(c => ({ judge_id: j.id, company_id: c.id })), `${j.name} 전체`)}>열 전체</button>}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {shown.map(c => {
            const inel = c.eligibility === 'ineligible'
            const n = assignments.filter(a => a.company_id === c.id && !a.conflict).length
            return (
              <tr key={c.id} className={cn(inel && 'opacity-50')}>
                <td className="sticky left-0 z-10 bg-card">
                  <div className="flex items-center gap-2">
                    <span className="tabular text-xs text-muted">{c.blind_code}</span>
                    <span className="font-semibold">{c.name}</span>
                    {c.eligibility !== 'eligible' && c.eligibility !== 'pending' && <EligibilityBadge value={c.eligibility} />}
                  </div>
                  <div className="flex gap-2 text-xs text-muted">
                    <span className="tabular">{n}명 배정</span>
                    {!locked && !inel && <button className="text-primary hover:underline disabled:opacity-50" disabled={busy}
                      onClick={() => insertPairs(judges.map(j => ({ judge_id: j.id, company_id: c.id })), `${c.name} 전체`)}>행 전체</button>}
                  </div>
                </td>
                {judges.map(j => {
                  const a = map.get(key(j.id, c.id))
                  const scored = a ? scoreCount[a.id] ?? 0 : 0
                  return (
                    <td key={j.id} className={cn('text-center', a?.conflict && 'bg-highlight/10')}>
                      {a?.conflict ? (
                        <div className="grid justify-items-center gap-0.5">
                          <Badge tone="highlight">{a.conflict_reported_at ? '본인 신고' : '충돌 제외'}</Badge>
                          {!locked && <button className="text-xs text-primary hover:underline disabled:opacity-50" disabled={busy} onClick={() => restore(a, j.name, c.name)}>복구</button>}
                        </div>
                      ) : (
                        <div className="group flex items-center justify-center gap-1">
                          <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--primary))]" aria-label={`${j.name}-${c.name}`}
                            checked={!!a} disabled={busy || locked || (inel && !a)} onChange={() => toggle(j, c)} />
                          {scored > 0 && <span className="tabular text-[10px] text-accent" title="입력된 점수 항목 수">{scored}</span>}
                          {!locked && <button className="text-xs text-muted opacity-0 hover:text-[#8a5a00] group-hover:opacity-100 disabled:opacity-0" disabled={busy}
                            title="이해충돌 제외" onClick={() => markConflict(j, c)}>⊘</button>}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </Table>
      <p className="text-xs text-muted">체크 = 배정. 칸에 마우스를 올리면 ⊘(이해충돌 제외)가 표시됩니다. 숫자는 입력된 점수 항목 수입니다. 부적격 기업은 전원 배정에서 제외됩니다.</p>

      <Card title={`이해충돌 내역 (${conflicts.length})`}>
        {conflicts.length === 0 ? <p className="text-sm text-muted">이해충돌로 제외된 배정이 없습니다.</p> : (
          <Table className="border-0">
            <thead><tr><th>심사위원</th><th>기업</th><th>구분</th><th>사유</th><th>신고 시각</th><th /></tr></thead>
            <tbody>
              {conflicts.map(a => (
                <tr key={a.id}>
                  <td>{judgeName.get(a.judge_id)}</td>
                  <td>{coName.get(a.company_id)}</td>
                  <td>{a.conflict_reported_at ? <Badge tone="highlight">심사위원 신고</Badge> : <Badge>관리자 제외</Badge>}</td>
                  <td className="max-w-sm whitespace-pre-line">{a.conflict_reason ?? '-'}</td>
                  <td className="whitespace-nowrap text-xs text-muted">{fmtDate(a.conflict_reported_at)}</td>
                  <td className="text-right">
                    {!locked && <Button size="sm" variant="ghost" disabled={busy}
                      onClick={() => restore(a, judgeName.get(a.judge_id) ?? '', coName.get(a.company_id) ?? '')}>복구</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  )
}
