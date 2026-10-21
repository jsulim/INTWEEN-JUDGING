'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Button, Textarea } from '@/components/ui'
import { Dialog } from '@/components/judge/Dialog'

// 심사위원별 채점표 '비고' 칸 (관리자 화면): 누르면 가운데 창에서 작성. 인쇄에는 글만 나온다
export default function RemarkCell({ assignmentId, remark, title }: { assignmentId: string; remark: string | null; title: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(remark ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      await api('/api/admin/remarks', { body: { assignment_id: assignmentId, remark: text } })
      setOpen(false)
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => { setText(remark ?? ''); setErr(null); setOpen(true) }}
        className="block min-h-[1.5em] w-full whitespace-pre-wrap text-left hover:bg-[#f3f7ff]" title="눌러서 비고 작성">
        {remark || <span className="no-print text-xs text-[#999]">+ 작성</span>}
      </button>
      <Dialog open={open} title={`비고 · ${title}`} onClose={() => setOpen(false)}
        footer={<>
          <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
          <Button onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</Button>
        </>}>
        <div className="grid gap-2 text-sm">
          <Textarea value={text} onChange={e => setText(e.target.value)} maxLength={2000} rows={5} autoFocus
            placeholder="예: 이해충돌 사전 신고, 발표 시간 초과, 점수 정정 사유 등" />
          <p className="text-xs text-muted">관리자만 작성할 수 있고 심사위원에게는 보이지 않습니다. 비우고 저장하면 지워집니다.</p>
          {err && <p className="text-danger">{err}</p>}
        </div>
      </Dialog>
    </>
  )
}
