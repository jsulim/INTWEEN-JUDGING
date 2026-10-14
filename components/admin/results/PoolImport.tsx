'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { supabaseBrowser } from '@/lib/supabase/client'
import { categoryLabel, parsePoolPath } from '@/lib/pool'
import { Alert, Button, Card, Table } from '@/components/ui'

// 심사위원 풀 자료 일괄 등록: 분야 폴더(01_… ~ 05_…)를 통째로 선택하면
//  파일명 '이름_소속_추천경로.pdf' → 이력서, '증빙서류/이름_소속_추천경로_문서명.pdf' → 증빙 으로 등록한다.
// 개인정보 가림을 마친 PDF만 올린다 (기관 공유 화면에 그대로 보인다).
type Row = { path: string; name: string; affiliation: string; category: string | null; kind: '이력서' | '증빙'; label: string | null; status: string }

export default function PoolImport({ programs }: { programs: { id: string; title: string }[] }) {
  const router = useRouter()
  const [programId, setProgramId] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<(Row & { file: File })[]>([])
  const [skipped, setSkipped] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  function choose(list: FileList | null) {
    if (!list) return
    const ok: (Row & { file: File })[] = []
    const bad: string[] = []
    for (const f of Array.from(list)) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
      const p = parsePoolPath(rel)
      if (!p) { if (!/(^|\/)\./.test(rel)) bad.push(rel); continue }
      ok.push({ file: f, path: rel, name: p.name, affiliation: p.affiliation, category: p.category, kind: p.docLabel ? '증빙' : '이력서', label: p.docLabel, status: '대기' })
    }
    // 이력서를 먼저 올려야 증빙이 같은 사람에 붙는다
    ok.sort((a, b) => (a.kind === b.kind ? a.path.localeCompare(b.path, 'ko') : a.kind === '이력서' ? -1 : 1))
    setRows(ok)
    setSkipped(bad)
    setDone(null)
  }

  async function upload() {
    setBusy(true)
    const ids = new Map<string, string>()
    let okCount = 0
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const set = (status: string) => setRows(rs => rs.map((x, k) => (k === i ? { ...x, status } : x)))
      try {
        set('등록 중…')
        const p = parsePoolPath(r.path)!
        // 같은 사람이 다른 분야 폴더에도 있으면 그 분야를 추가 분야로 담는다
        const key = `${r.name}|${r.affiliation}|${r.category}`
        let id = ids.get(key)
        if (!id) {
          id = (await api<{ id: string }>('/api/admin/pool', { body: { action: 'upsert', name: r.name, affiliation: r.affiliation, source: p.source, category: r.category, program_id: programId || null } })).id
          ids.set(key, id)
        }
        const kind = r.kind === '이력서' ? 'resume' : 'doc'
        const t = await api<{ path: string; token: string }>('/api/admin/pool', { body: { action: 'ticket', id, kind, size: r.file.size } })
        const { error } = await supabaseBrowser().storage.from('program-files')
          .uploadToSignedUrl(t.path, t.token, new Blob([r.file], { type: 'application/pdf' }), { contentType: 'application/pdf' })
        if (error) throw new Error('파일 업로드 실패')
        await api('/api/admin/pool', { body: { action: 'attach', id, kind, path: t.path, label: r.label ?? undefined } })
        set('완료')
        okCount++
      } catch (e) {
        set(e instanceof Error ? e.message : '실패')
      }
    }
    setBusy(false)
    setDone(`${okCount}/${rows.length}개 파일을 등록했습니다.`)
    router.refresh()
  }

  const people = new Set(rows.map(r => `${r.name}|${r.affiliation}`)).size

  return (
    <Card title="자료 일괄 등록 (기관 공유용)">
      <div className="grid gap-3 text-sm">
        <p className="text-muted">
          분야 폴더(<b>01_VC_펀드운용사</b> ~ <b>06_관광</b>)가 들어 있는 상위 폴더를 선택하세요.
          파일명 <code>이름_소속_추천경로.pdf</code>는 이력서로, <code>증빙서류</code> 폴더의 <code>이름_소속_추천경로_문서명.pdf</code>는 증빙으로 등록됩니다.
          같은 사람(이름+소속)은 갱신되고, 다른 분야 폴더에도 있으면 그 분야에도 함께 보입니다.
        </p>
        <Alert tone="highlight">주민등록번호·연락처·주소 가림, 신분증·통장 사본 제외를 마친 PDF만 올려 주세요. 기관 화면에 그대로 보입니다.</Alert>
        <label className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">후보로 담을 대회</span>
          <select value={programId} onChange={e => setProgramId(e.target.value)} disabled={busy}
            className="h-9 rounded-md border border-line bg-card px-2 text-sm">
            <option value="">선택 안 함 (공용 명단에만 등록)</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <span className="text-xs text-muted">대회 공유 링크에는 그 대회 후보만 보입니다.</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" className="hidden" multiple accept=".pdf"
            {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            onChange={e => { choose(e.target.files); e.target.value = '' }} />
          <Button variant="outline" onClick={() => input.current?.click()} disabled={busy}>폴더 선택</Button>
          {rows.length > 0 && <Button onClick={upload} disabled={busy}>{busy ? '등록 중…' : `${people}명 · 파일 ${rows.length}개 등록`}</Button>}
          {done && <span className="font-semibold text-accent">{done}</span>}
        </div>
        {skipped.length > 0 && <p className="text-xs text-muted">PDF가 아니거나 파일명 형식이 맞지 않아 제외: {skipped.slice(0, 5).join(', ')}{skipped.length > 5 ? ` 외 ${skipped.length - 5}개` : ''}</p>}
        {rows.length > 0 && (
          <div className="max-h-80 overflow-y-auto">
            <Table>
              <thead><tr><th>분야</th><th>이름</th><th>소속</th><th>종류</th><th>상태</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.path}>
                    <td className="whitespace-nowrap text-xs">{categoryLabel(r.category)}</td>
                    <td className="font-semibold">{r.name}</td>
                    <td className="text-xs">{r.affiliation}</td>
                    <td className="text-xs">{r.kind}{r.label ? ` · ${r.label}` : ''}</td>
                    <td className={r.status === '완료' ? 'text-accent' : r.status === '대기' || r.status.endsWith('…') ? 'text-muted' : 'text-danger'}>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </div>
    </Card>
  )
}
