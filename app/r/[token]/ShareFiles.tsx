'use client'
import { useRef, useState } from 'react'
import { api } from '@/lib/api'
import PdfViewer, { type ViewerFile } from '@/components/judge/PdfViewer'
import { cn } from '@/components/ui'

export type ShareTeam = { id: string; name: string; code: string | null; files: ViewerFile[] }

// 기관 열람: 팀을 고르면 발표자료·사업계획서를 화면에서 본다 (다운로드 없음, 워터마크)
export default function ShareFiles({ token, teams, watermark }: { token: string; teams: ShareTeam[]; watermark: string }) {
  const [selected, setSelected] = useState(teams.find(t => t.files.length)?.id ?? teams[0]?.id ?? null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const team = teams.find(t => t.id === selected) ?? null
  const resolveUrl = async (f: ViewerFile) => (await api<{ url: string }>(`/api/r/${token}/file`, { body: { submission_id: f.submission_id } })).url

  if (!teams.length) return <p className="text-muted">등록된 팀이 없습니다.</p>
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <ul className="grid content-start gap-1">
        {teams.map(t => (
          <li key={t.id}>
            <button type="button"
              onClick={() => { setSelected(t.id); if (window.innerWidth < 1024) setTimeout(() => viewerRef.current?.scrollIntoView({ behavior: 'smooth' }), 50) }}
              className={cn('flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm',
                t.id === selected ? 'bg-primary text-primary-fg' : 'bg-card hover:bg-primary/10')}>
              <span className="font-semibold">{t.code && <span className="mr-1.5 tabular opacity-70">{t.code}</span>}{t.name}</span>
              <span className={cn('shrink-0 text-xs', t.id === selected ? 'text-primary-fg/80' : 'text-muted')}>{t.files.length ? `자료 ${t.files.length}` : '자료 없음'}</span>
            </button>
          </li>
        ))}
      </ul>
      <div ref={viewerRef} className="scroll-mt-4">
        {team && (
          <PdfViewer key={team.id} files={team.files} resolveUrl={resolveUrl} watermarkName="기관 열람용"
            watermarkTitle={`${watermark} · ${team.name}`} emptyText="이 팀은 아직 올라온 자료가 없습니다."
            className="h-[78vh]" />
        )}
      </div>
    </div>
  )
}
