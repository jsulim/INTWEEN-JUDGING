'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { fmtDate } from '@/lib/format'
import { Alert, Badge, Button, Card } from '@/components/ui'
import { uploadFile } from './upload'
import { MAX_UPLOAD_BYTES, SIZE_ERROR, extOfName, fmtBytes, myFileHref } from './rules'
import type { RequiredFile, Submission } from '@/lib/types'

export default function SlotUploader({ stageId, slot, open, versions }: {
  stageId: string
  slot: RequiredFile
  open: boolean
  versions: Submission[] // version desc
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'upload' | 'complete' | null>(null)
  const [msg, setMsg] = useState<{ tone: 'accent' | 'danger'; text: string } | null>(null)
  const accept = (slot.accept?.length ? slot.accept : ['pdf']).map(a => a.toLowerCase())
  const current = versions.find(v => v.is_current) ?? null
  const history = versions.filter(v => !v.is_current)

  async function onFile(file: File | undefined) {
    if (!file) return
    setMsg(null)
    const ext = extOfName(file.name)
    if (!accept.includes(ext)) {
      setMsg({ tone: 'danger', text: `${accept.map(a => a.toUpperCase()).join('·')} 파일만 제출할 수 있습니다.` })
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) return setMsg({ tone: 'danger', text: SIZE_ERROR })
    try {
      setBusy('upload')
      const t = await uploadFile(file, 'submission', { stage_id: stageId, file_type: slot.type })
      setBusy('complete')
      const row = await api<Submission>('/api/files/complete', {
        body: { kind: 'submission', stage_id: stageId, file_type: slot.type, path: t.path, file_name: file.name, size: file.size },
      })
      setMsg({ tone: 'accent', text: `제출 완료 · v${row.version}` })
      router.refresh()
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : '업로드하지 못했습니다.' })
    } finally {
      setBusy(null)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <Card
      title={<span className="flex flex-wrap items-center gap-2">{slot.label}{slot.required ? <span className="text-xs font-semibold text-danger">필수</span> : <span className="text-xs font-normal text-muted">선택</span>}</span>}
      actions={current ? <Badge tone="accent">제출 완료</Badge> : <Badge tone={slot.required ? 'highlight' : 'neutral'}>미제출</Badge>}
    >
      <div className="grid gap-4">
        {current ? (
          <FileRow sub={current} />
        ) : (
          <p className="text-sm text-muted">제출된 파일이 없습니다. <span className="tabular">({accept.map(a => a.toUpperCase()).join('·')}, 최대 50MB)</span></p>
        )}

        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

        {open && (
          <div>
            <input
              ref={input}
              type="file"
              className="sr-only"
              accept={accept.map(a => '.' + a).join(',')}
              onChange={e => onFile(e.target.files?.[0])}
              disabled={!!busy}
              id={`file-${slot.type}`}
            />
            <Button type="button" className="w-full sm:w-auto" size="lg" variant={current ? 'outline' : 'primary'}
              disabled={!!busy} onClick={() => input.current?.click()}>
              {busy === 'upload' ? '업로드 중…' : busy === 'complete' ? '제출 처리 중…' : current ? '새 버전 업로드' : '파일 선택'}
            </Button>
            {busy && <p className="mt-2 text-xs text-muted">창을 닫지 마세요. 파일 크기에 따라 시간이 걸릴 수 있습니다.</p>}
          </div>
        )}

        {history.length > 0 && (
          <details className="group rounded-md border border-line">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-muted">
              이전 버전 <span className="tabular">{history.length}</span>
            </summary>
            <ul className="divide-y divide-line border-t border-line">
              {history.map(v => (
                <li key={v.id} className="px-3 py-2"><FileRow sub={v} compact /></li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Card>
  )
}

function FileRow({ sub, compact }: { sub: Submission; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <div className="min-w-0">
        <a href={myFileHref({ submissionId: sub.id })} target="_blank" rel="noopener noreferrer"
          className={compact ? 'break-all text-fg hover:underline' : 'break-all font-semibold text-primary hover:underline'}>
          {sub.file_name}
        </a>
        <div className="tabular text-xs text-muted">v{sub.version} · {fmtBytes(sub.file_size)} · {fmtDate(sub.created_at)}</div>
      </div>
      {sub.pdf_path && (
        <a href={myFileHref({ submissionId: sub.id, pdf: true })} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-muted hover:text-fg">
          PDF 변환본
        </a>
      )}
    </div>
  )
}
