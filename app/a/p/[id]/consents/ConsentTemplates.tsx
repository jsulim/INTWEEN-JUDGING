'use client'
import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Alert, Badge, Button, Card, Empty, Field, Input, Progress, Textarea } from '@/components/ui'
import { Check, Feedback, must, useRun } from '@/components/admin/setup/client'
import { CONSENT_KINDS, DEFAULT_CONSENTS, PAYMENT_CONSENT } from '@/components/admin/setup/consent-defaults'
import { fmtDate } from '@/lib/format'
import type { ConsentTemplate } from '@/lib/types'

const ALL_DEFAULTS = [...DEFAULT_CONSENTS, PAYMENT_CONSENT]

function KindCard({ kind, versions, signedCount, judgeCount }:
  { kind: string; versions: ConsentTemplate[]; signedCount: Record<string, number>; judgeCount: number }) {
  const { busy, error, notice, run } = useRun()
  const active = versions.find(v => v.is_active) ?? null
  const latest = versions[0]
  const [edit, setEdit] = useState(false)
  const [title, setTitle] = useState(latest.title)
  const [body, setBody] = useState(latest.body)
  const [showHistory, setShowHistory] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  const sb = supabaseBrowser()

  async function saveVersion() {
    if (!title.trim() || !body.trim()) return alert('제목과 문구를 입력해 주세요.')
    if (active && title.trim() === active.title && body.trim() === active.body.trim()) return alert('변경된 내용이 없습니다.')
    const n = active ? signedCount[active.id] ?? 0 : 0
    if (!confirm(`v${latest.version + 1}을(를) 등록합니다.${n ? `\n이미 서명한 심사위원 ${n}명은 새 버전에 다시 서명해야 평가를 계속할 수 있습니다.` : ''}`)) return
    const ok = await run(async () => {
      const created = must(await sb.from('consent_templates').insert({
        program_id: latest.program_id, kind, title: title.trim(), body: body.trim(),
        version: latest.version + 1, required: active?.required ?? latest.required, is_active: true,
      }).select('id').single()) as { id: string }
      must(await sb.from('consent_templates').update({ is_active: false }).eq('program_id', latest.program_id).eq('kind', kind).neq('id', created.id).eq('is_active', true))
    }, { success: `v${latest.version + 1} 등록 · 재서명 요청됨` })
    if (ok) setEdit(false)
  }

  async function setRequired(v: boolean) {
    if (!active) return
    await run(async () => { must(await sb.from('consent_templates').update({ required: v }).eq('id', active.id)) })
  }

  async function activate(t: ConsentTemplate) {
    if (!confirm(`v${t.version}을(를) 활성 버전으로 되돌립니다. 이 버전에 서명하지 않은 심사위원은 다시 서명해야 합니다.`)) return
    await run(async () => {
      must(await sb.from('consent_templates').update({ is_active: false }).eq('program_id', t.program_id).eq('kind', kind).eq('is_active', true))
      must(await sb.from('consent_templates').update({ is_active: true }).eq('id', t.id))
    })
  }

  async function deactivate() {
    if (!active) return
    if (!confirm(`'${active.title}' 양식을 사용 중지합니다. 심사위원에게 더 이상 서명을 요청하지 않습니다.`)) return
    await run(async () => { must(await sb.from('consent_templates').update({ is_active: false }).eq('id', active.id)) })
  }

  const signed = active ? signedCount[active.id] ?? 0 : 0
  return (
    <Card title={<span className="flex flex-wrap items-center gap-2">{CONSENT_KINDS[kind] ?? kind}
      {active ? <Badge tone="accent">v{active.version} 사용 중</Badge> : <Badge>사용 안 함</Badge>}
      {active && (active.required ? <Badge tone="primary">필수</Badge> : <Badge>선택</Badge>)}
    </span>}
      actions={!edit && <>
        <Button size="sm" variant="outline" onClick={() => { setTitle((active ?? latest).title); setBody((active ?? latest).body); setEdit(true) }}>문구 수정</Button>
        {active ? <Button size="sm" variant="ghost" onClick={deactivate} disabled={busy}>사용 중지</Button>
          : <Button size="sm" variant="ghost" onClick={() => activate(latest)} disabled={busy}>다시 사용</Button>}
      </>}>
      <Feedback error={error} notice={notice} />
      {edit ? (
        <div className="grid gap-3">
          <Alert tone="highlight">저장하면 v{latest.version + 1}이 새로 등록되고 기존 서명은 이전 버전 기준으로 보관됩니다.</Alert>
          <Field label="제목" required><Input value={title} onChange={e => setTitle(e.target.value)} /></Field>
          <Field label="문구" required hint="심사위원은 전체 문구를 스크롤한 뒤 서명할 수 있습니다."><Textarea className="min-h-[320px] text-sm leading-relaxed" value={body} onChange={e => setBody(e.target.value)} /></Field>
          <div className="flex gap-2">
            <Button onClick={saveVersion} disabled={busy}>새 버전으로 저장</Button>
            <Button variant="ghost" onClick={() => setEdit(false)}>취소</Button>
          </div>
        </div>
      ) : active ? (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_260px]">
            <div>
              <div className="font-semibold">{active.title}</div>
              <div className="text-xs text-muted">v{active.version} · 등록 {fmtDate(active.created_at)}</div>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-muted">서명 현황</div>
              <Progress value={signed} max={judgeCount} tone={signed < judgeCount ? 'highlight' : 'accent'} />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto whitespace-pre-line rounded-md border border-line bg-bg p-3 text-sm leading-relaxed">{active.body}</div>
          <Check label="필수 서명" hint="필수 양식을 모두 서명해야 심사위원이 자료 열람·평가를 할 수 있습니다." checked={active.required} disabled={busy} onChange={setRequired} />
        </div>
      ) : <p className="text-sm text-muted">사용 중인 버전이 없습니다. 심사위원에게 서명을 요청하지 않습니다.</p>}

      {versions.length > 1 && (
        <div className="mt-4 border-t border-line pt-3">
          <button className="text-sm font-semibold text-muted hover:text-fg" onClick={() => setShowHistory(h => !h)}>버전 이력 ({versions.length}) {showHistory ? '▲' : '▼'}</button>
          {showHistory && (
            <ul className="mt-2 grid gap-2">
              {versions.map(v => (
                <li key={v.id} className="rounded-md border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <b>v{v.version}</b><span>{v.title}</span>
                    {v.is_active && <Badge tone="accent">사용 중</Badge>}
                    <span className="text-xs text-muted">{fmtDate(v.created_at)} · 서명 {signedCount[v.id] ?? 0}명</span>
                    <span className="ml-auto flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setViewing(viewing === v.id ? null : v.id)}>{viewing === v.id ? '접기' : '문구 보기'}</Button>
                      {!v.is_active && <Button size="sm" variant="ghost" onClick={() => activate(v)} disabled={busy}>이 버전 사용</Button>}
                    </span>
                  </div>
                  {viewing === v.id && <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-line rounded bg-bg p-2 text-xs leading-relaxed">{v.body}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}

export default function ConsentTemplates({ programId, templates, signedCount, judgeCount }:
  { programId: string; templates: ConsentTemplate[]; signedCount: Record<string, number>; judgeCount: number }) {
  const { busy, error, notice, run } = useRun()
  const byKind = new Map<string, ConsentTemplate[]>()
  for (const t of templates) {
    if (!byKind.has(t.kind)) byKind.set(t.kind, [])
    byKind.get(t.kind)!.push(t)
  }
  const order = ['privacy', 'security', 'conflict', 'payment']
  const kinds = [...byKind.keys()].sort((a, b) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99)
  const missing = ALL_DEFAULTS.filter(d => !byKind.has(d.kind))

  async function addDefault(d: (typeof ALL_DEFAULTS)[number]) {
    await run(async () => {
      must(await supabaseBrowser().from('consent_templates').insert({ program_id: programId, kind: d.kind, title: d.title, body: d.body, required: d.required, version: 1, is_active: true }))
    }, { success: `'${d.title}' 양식을 추가했습니다.` })
  }

  return (
    <div className="grid gap-5">
      <Feedback error={error} notice={notice} />
      {missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line bg-card p-4">
          <span className="text-sm text-muted">기본 양식 추가:</span>
          {missing.map(d => <Button key={d.kind} size="sm" variant="secondary" disabled={busy} onClick={() => addDefault(d)}>+ {CONSENT_KINDS[d.kind]}</Button>)}
        </div>
      )}
      {kinds.length === 0 ? <Empty>동의서 양식이 없습니다. 위에서 기본 양식을 추가하세요.</Empty>
        : kinds.map(k => <KindCard key={k} kind={k} versions={byKind.get(k)!} signedCount={signedCount} judgeCount={judgeCount} />)}
    </div>
  )
}
