'use client'
import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Badge, Button, Card, Input, Table } from '@/components/ui'
import { Feedback, must, num, useRun } from '@/components/admin/setup/client'
import { fmtScore } from '@/lib/format'
import type { BonusRule, Stage } from '@/lib/types'

type Draft = { name: string; points: string; evidence_required: boolean }
const toDraft = (r?: BonusRule): Draft => ({ name: r?.name ?? '', points: r ? String(Number(r.points)) : '', evidence_required: r?.evidence_required ?? true })

function validate(d: Draft) {
  if (!d.name.trim()) return '규칙명을 입력해 주세요.'
  const p = num(d.points)
  if (p == null || p === 0) return '점수는 0이 아닌 값이어야 합니다. (감점은 음수)'
  if (Math.abs(p) > 999) return '점수가 너무 큽니다.'
  return null
}

function RuleRow({ r, disabled, claims }: { r: BonusRule; disabled: boolean; claims: number }) {
  const { busy, error, run } = useRun()
  const [edit, setEdit] = useState(false)
  const [d, setD] = useState(toDraft(r))
  async function save() {
    const v = validate(d)
    if (v) return alert(v)
    const ok = await run(async () => {
      must(await supabaseBrowser().from('bonus_rules').update({ name: d.name.trim(), points: num(d.points), evidence_required: d.evidence_required }).eq('id', r.id))
    })
    if (ok) setEdit(false)
  }
  async function remove() {
    if (!confirm(`'${r.name}' 규칙을 삭제합니다.${claims ? `\n기업 신청 ${claims}건도 함께 삭제됩니다.` : ''}`)) return
    await run(async () => { must(await supabaseBrowser().from('bonus_rules').delete().eq('id', r.id)) })
  }
  const pts = Number(r.points)
  return (
    <tr>
      {edit ? (
        <>
          <td><Input className="h-9" value={d.name} onChange={e => setD({ ...d, name: e.target.value })} /></td>
          <td><Input className="h-9 w-24" type="number" step={0.5} value={d.points} onChange={e => setD({ ...d, points: e.target.value })} /></td>
          <td><label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={d.evidence_required} onChange={e => setD({ ...d, evidence_required: e.target.checked })} />증빙 필요</label></td>
          <td className="tabular">{claims}</td>
          <td className="text-right">
            <Button size="sm" onClick={save} disabled={busy}>저장</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEdit(false); setD(toDraft(r)) }}>취소</Button>
          </td>
        </>
      ) : (
        <>
          <td className="font-semibold">{r.name}{error && <div className="text-xs font-normal text-danger">{error}</div>}</td>
          <td className={`tabular font-bold ${pts < 0 ? 'text-danger' : 'text-accent'}`}>{pts > 0 ? '+' : ''}{fmtScore(pts)}</td>
          <td>{r.evidence_required ? <Badge tone="primary">증빙 필요</Badge> : <Badge>증빙 불필요</Badge>}</td>
          <td className="tabular">{claims}</td>
          <td className="text-right">
            {!disabled && <>
              <Button size="sm" variant="ghost" onClick={() => setEdit(true)}>수정</Button>
              <Button size="sm" variant="ghost" className="text-danger" onClick={remove} disabled={busy}>삭제</Button>
            </>}
          </td>
        </>
      )}
    </tr>
  )
}

export default function BonusRules({ stage, rules, claimCount }: { stage: Stage; rules: BonusRule[]; claimCount: Record<string, number> }) {
  const { busy, error, notice, run } = useRun()
  const [d, setD] = useState(toDraft())
  const locked = stage.status === 'locked' || stage.status === 'published'

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const v = validate(d)
    if (v) return alert(v)
    const ok = await run(async () => {
      must(await supabaseBrowser().from('bonus_rules').insert({ stage_id: stage.id, name: d.name.trim(), points: num(d.points), evidence_required: d.evidence_required }))
    }, { success: '규칙을 추가했습니다.' })
    if (ok) setD(toDraft())
  }

  return (
    <Card title="가점·감점 규칙" actions={<span className="text-xs text-muted">상한 ±{fmtScore(Number(stage.bonus_cap))}점 (단계 설정) · 증빙 승인분만 반영</span>}>
      <Feedback error={error} notice={notice} />
      <p className="mb-3 text-sm text-muted">우대 조건 가점(여성·장애인기업, 지역 등)과 서류 미비 감점. 기업이 신청서(C-06)에서 증빙을 올리면 적격 검토(A-12)에서 승인합니다. 미승인 가점은 0점 처리됩니다.</p>
      {rules.length > 0 && (
        <Table className="mb-4">
          <thead><tr><th>규칙</th><th>점수</th><th>증빙</th><th>신청</th><th /></tr></thead>
          <tbody>{rules.map(r => <RuleRow key={r.id} r={r} disabled={locked} claims={claimCount[r.id] ?? 0} />)}</tbody>
        </Table>
      )}
      {!locked && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1"><Input value={d.name} onChange={e => setD({ ...d, name: e.target.value })} placeholder="예: 여성기업 인증" aria-label="규칙명" /></div>
          <Input className="w-28" type="number" step={0.5} value={d.points} onChange={e => setD({ ...d, points: e.target.value })} placeholder="+1 / -2" aria-label="점수" />
          <label className="flex h-10 items-center gap-1 text-sm"><input type="checkbox" checked={d.evidence_required} onChange={e => setD({ ...d, evidence_required: e.target.checked })} />증빙 필요</label>
          <Button type="submit" variant="secondary" disabled={busy}>추가</Button>
        </form>
      )}
    </Card>
  )
}
