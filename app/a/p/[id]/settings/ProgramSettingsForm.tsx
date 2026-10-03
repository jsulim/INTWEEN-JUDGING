'use client'
import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Button, Card, Field, Input, Select, Textarea } from '@/components/ui'
import { Check, Feedback, must, useRun } from '@/components/admin/setup/client'
import { fromLocalInput, toLocalInput } from '@/lib/format'
import type { Program } from '@/lib/types'

export default function ProgramSettingsForm({ program }: { program: Program }) {
  const { busy, error, notice, run } = useRun()
  const [f, setF] = useState({
    title: program.title,
    type: program.type,
    status: program.status,
    description: program.description ?? '',
    retention_years: String(program.retention_years),
    payment_per_session: String(program.payment_per_session),
    application_open: program.application_open,
    application_due: toLocalInput(program.application_due),
  })

  async function save(e: React.FormEvent) {
    e.preventDefault()
    await run(async () => {
      must(await supabaseBrowser().from('programs').update({
        title: f.title.trim(),
        type: f.type,
        status: f.status,
        description: f.description.trim() || null,
        retention_years: Number(f.retention_years) || 3,
        payment_per_session: Number(f.payment_per_session) || 0,
        application_open: f.application_open,
        application_due: fromLocalInput(f.application_due),
        ...(f.status === 'closed' && !program.closed_at ? { closed_at: new Date().toISOString() } : {}),
      }).eq('id', program.id))
    }, { success: '저장됨' })
  }

  return (
    <Card title="프로그램 설정">
      <Feedback error={error} notice={notice} />
      <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
        <Field label="프로그램명" required><Input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="유형">
            <Select value={f.type} onChange={e => setF({ ...f, type: e.target.value as Program['type'] })}>
              <option value="screening">기업심사</option>
              <option value="hackathon">해커톤</option>
            </Select>
          </Field>
          <Field label="상태">
            <Select value={f.status} onChange={e => setF({ ...f, status: e.target.value as Program['status'] })}>
              <option value="draft">준비</option>
              <option value="active">운영</option>
              <option value="closed">종료</option>
              <option value="archived">보관</option>
            </Select>
          </Field>
        </div>
        <div className="md:col-span-2"><Field label="설명"><Textarea value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field></div>
        <Field label="개인정보 보유기간 (년)" hint={program.closed_at ? `종료일 ${program.closed_at.slice(0, 10)} 기준` : '프로그램 종료일부터 기산'}>
          <Input type="number" min={1} max={20} value={f.retention_years} onChange={e => setF({ ...f, retention_years: e.target.value })} />
        </Field>
        <Field label="심사 1회 수당 (원)">
          <Input type="number" min={0} step={10000} value={f.payment_per_session} onChange={e => setF({ ...f, payment_per_session: e.target.value })} />
        </Field>
        <div className="rounded-md border border-line p-4 md:col-span-2">
          <div className="mb-3 font-semibold">신청서 접수 (C-06)</div>
          <div className="grid items-end gap-4 md:grid-cols-2">
            <Check label="신청서 접수 중" hint="켜면 참가 기업이 신청서를 작성·수정할 수 있습니다. 보완 요청 기업은 기한 내 수정 가능."
              checked={f.application_open} onChange={v => setF({ ...f, application_open: v })} />
            <Field label="신청 마감 (KST)">
              <Input type="datetime-local" value={f.application_due} onChange={e => setF({ ...f, application_due: e.target.value })} />
            </Field>
          </div>
        </div>
        <div className="md:col-span-2"><Button type="submit" disabled={busy}>저장</Button></div>
      </form>
    </Card>
  )
}
