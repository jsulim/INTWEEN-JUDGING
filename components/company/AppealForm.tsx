'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { fmtDate } from '@/lib/format'
import { Alert, Button, Field, Textarea } from '@/components/ui'
import { DDayBadge } from '@/components/StatusBadges'
import { uploadFile } from './upload'
import { EVIDENCE_ACCEPT, EVIDENCE_EXT, MAX_UPLOAD_BYTES, SIZE_ERROR, extOfName, fmtBytes } from './rules'

const MIN = 10
const MAX = 5000

export default function AppealForm({ entryId, until }: { entryId: string; until: string }) {
  const router = useRouter()
  const ref = useRef<HTMLInputElement>(null)
  const [reason, setReason] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function pick(f: File | undefined) {
    setErr(null)
    if (!f) return
    if (!(EVIDENCE_EXT as readonly string[]).includes(extOfName(f.name))) {
      setErr(`${EVIDENCE_EXT.map(e => e.toUpperCase()).join('·')} 파일만 첨부할 수 있습니다.`)
    } else if (f.size > MAX_UPLOAD_BYTES) {
      setErr(SIZE_ERROR)
    } else {
      setFile(f)
    }
    if (ref.current) ref.current.value = ''
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (reason.trim().length < MIN) return setErr(`사유를 ${MIN}자 이상 입력해 주세요.`)
    if (!window.confirm('이의신청은 단계별 1회만 가능하며 접수 후 수정할 수 없습니다. 제출할까요?')) return
    setBusy(true)
    try {
      const attachment = file ? (await uploadFile(file, 'appeal', { entry_id: entryId })).path : null
      await api('/api/appeals', { body: { entry_id: entryId, reason: reason.trim(), attachment_path: attachment } })
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '이의신청을 접수하지 못했습니다.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="tabular text-muted">신청 기한 {fmtDate(until)}</span>
        <DDayBadge deadline={until} />
      </div>
      <Field label="신청 사유" required hint={<span className="tabular">{reason.trim().length.toLocaleString()} / {MAX.toLocaleString()}자 · 단계별 1회, 접수 후 수정 불가</span>}>
        <Textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={MAX} className="min-h-[160px]"
          placeholder="이의 사유와 근거를 구체적으로 작성해 주세요." disabled={busy} required />
      </Field>
      <div>
        <span className="mb-1 block text-sm font-semibold">첨부 파일 <span className="font-normal text-muted">(선택)</span></span>
        <input ref={ref} type="file" className="sr-only" accept={EVIDENCE_ACCEPT} onChange={e => pick(e.target.files?.[0])} disabled={busy} />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {file ? (
            <>
              <span className="min-w-0 break-all font-medium">{file.name}</span>
              <span className="tabular text-xs text-muted">{fmtBytes(file.size)}</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setFile(null)} disabled={busy}>삭제</Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => ref.current?.click()} disabled={busy}>파일 선택</Button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">PDF·PPTX·PNG·JPG·ZIP, 최대 50MB</p>
      </div>
      {err && <Alert tone="danger">{err}</Alert>}
      <div>
        <Button type="submit" disabled={busy} className="w-full sm:w-auto">{busy ? '접수 중…' : '이의신청 제출'}</Button>
      </div>
    </form>
  )
}
