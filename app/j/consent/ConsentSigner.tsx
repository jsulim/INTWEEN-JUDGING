'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Textarea, cn } from '@/components/ui'
import { SignaturePad, type SignaturePadHandle } from '@/components/judge/SignaturePad'
import { api } from '@/lib/api'

export type ConflictCompany = { id: string; name: string; code: string | null }

export default function ConsentSigner({ judgeId, template, companies = [] }: {
  judgeId: string; template: { id: string; kind: string; body: string }
  /** 이해충돌 확인서: 이 프로그램에 등록된 기업 (이해관계 기업 선택용) */
  companies?: ConflictCompany[]
}) {
  const router = useRouter()
  const boxRef = useRef<HTMLDivElement>(null)
  const padRef = useRef<SignaturePadHandle>(null)
  const [readAll, setReadAll] = useState(false)
  const [empty, setEmpty] = useState(true)
  const [conflict, setConflict] = useState<'none' | 'yes' | null>(null)
  const [note, setNote] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const isConflict = template.kind === 'conflict'

  const check = useCallback(() => {
    const el = boxRef.current
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setReadAll(true)
  }, [])
  useEffect(() => { check() }, [check]) // 문구가 짧아 스크롤이 없으면 바로 활성화

  const conflictOk = !isConflict || conflict === 'none' || (conflict === 'yes' && picked.size > 0)
  const canSubmit = readAll && !empty && conflictOk && !busy

  async function submit() {
    if (!padRef.current || padRef.current.isEmpty()) return setErr('서명을 입력하세요.')
    setBusy(true)
    setErr(null)
    try {
      await api('/api/consent/sign', {
        body: {
          template_id: template.id,
          judge_id: judgeId,
          signature: padRef.current.toDataURL(),
          ...(isConflict ? { conflict_declared: conflict === 'yes', conflict_note: conflict === 'yes' ? note.trim() : null,
            conflict_company_ids: conflict === 'yes' ? [...picked] : [] } : {}),
        },
      })
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '서명하지 못했습니다.')
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div ref={boxRef} onScroll={check} tabIndex={0}
        className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-bg px-4 py-3 text-sm leading-relaxed">
        {template.body}
      </div>
      <p className={cn('text-xs', readAll ? 'text-accent' : 'text-muted')}>
        {readAll ? '문구를 끝까지 확인했습니다.' : '문구를 끝까지 스크롤하면 서명할 수 있습니다.'}
      </p>

      {isConflict && (
        <fieldset disabled={!readAll} className="grid gap-2 disabled:opacity-50">
          <legend className="mb-1 text-sm font-semibold">배정 기업과의 이해관계<span className="ml-0.5 text-danger">*</span></legend>
          <div className="flex flex-wrap gap-2">
            {([['none', '이해관계 없음'], ['yes', '이해관계 있음']] as const).map(([v, label]) => (
              <label key={v} className={cn('flex h-11 cursor-pointer items-center gap-2 rounded-md border px-4 text-sm font-semibold',
                conflict === v ? 'border-primary bg-primary/10 text-primary' : 'border-line bg-card')}>
                <input type="radio" name={`conflict-${template.id}`} value={v} checked={conflict === v}
                  onChange={() => setConflict(v)} className="accent-[rgb(var(--primary))]" />
                {label}
              </label>
            ))}
          </div>
          {conflict === 'yes' && (
            <div className="grid gap-3 rounded-md border border-line bg-bg p-3">
              <div>
                <div className="text-sm font-semibold">이해관계가 있는 기업을 모두 고르세요<span className="ml-0.5 text-danger">*</span></div>
                <p className="text-xs text-muted">고른 기업은 서명하면 자동으로 평가에서 제외됩니다 (자료 열람·채점 불가, 평균에서 제외).</p>
              </div>
              {companies.length === 0 ? (
                <p className="text-sm text-muted">아직 등록된 기업이 없습니다. 기업이 등록된 뒤 서명하거나 운영사무국에 알려 주세요.</p>
              ) : (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {companies.map(c => (
                    <label key={c.id} className={cn('flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm',
                      picked.has(c.id) ? 'border-danger bg-danger/10 font-semibold text-danger' : 'border-line bg-card')}>
                      <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} className="accent-[rgb(var(--danger))]" />
                      {c.code && <span className="tabular text-xs text-muted">{c.code}</span>}
                      {c.name}
                    </label>
                  ))}
                </div>
              )}
              <Textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000}
                placeholder="관계 내용 (선택, 예: 자문 계약 2025년~, 친족 관계 등)" />
            </div>
          )}
        </fieldset>
      )}

      <div>
        <div className="mb-1 text-sm font-semibold">서명</div>
        <SignaturePad ref={padRef} disabled={!readAll} disabledText="문구를 끝까지 읽으면 서명할 수 있습니다" onChange={setEmpty} />
      </div>
      {err && <Alert tone="danger">{err}</Alert>}
      <div className="flex justify-end">
        <Button onClick={submit} disabled={!canSubmit} size="lg">{busy ? '서명 저장 중…' : '동의하고 서명'}</Button>
      </div>
    </div>
  )
}
