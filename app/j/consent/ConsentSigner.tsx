'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Textarea, cn } from '@/components/ui'
import { SignaturePad, type SignaturePadHandle } from '@/components/judge/SignaturePad'
import { api } from '@/lib/api'

export default function ConsentSigner({ judgeId, template }: { judgeId: string; template: { id: string; kind: string; body: string } }) {
  const router = useRouter()
  const boxRef = useRef<HTMLDivElement>(null)
  const padRef = useRef<SignaturePadHandle>(null)
  const [readAll, setReadAll] = useState(false)
  const [empty, setEmpty] = useState(true)
  const [conflict, setConflict] = useState<'none' | 'yes' | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const isConflict = template.kind === 'conflict'

  const check = useCallback(() => {
    const el = boxRef.current
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setReadAll(true)
  }, [])
  useEffect(() => { check() }, [check]) // 문구가 짧아 스크롤이 없으면 바로 활성화

  const conflictOk = !isConflict || conflict === 'none' || (conflict === 'yes' && note.trim().length > 0)
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
          ...(isConflict ? { conflict_declared: conflict === 'yes', conflict_note: conflict === 'yes' ? note.trim() : null } : {}),
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
            <Textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000}
              placeholder="관계가 있는 기업과 내용 (예: A사 자문 계약, 2025년~)" />
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
