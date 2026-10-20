import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase/server'
import { loadResultShare } from '@/lib/server/result-share'
import { loadJudgeProgress, loadStageReport } from '@/lib/server/export'
import { EVENTS } from '@/lib/events'
import { JudgeSheets, SHEET_CSS, SheetTitle, SummarySheet } from '@/components/ResultSheets'
import { cn } from '@/components/ui'
import type { ViewerFile } from '@/components/judge/PdfViewer'
import type { RequiredFile, Stage } from '@/lib/types'
import ShareFiles, { type ShareTeam } from './ShareFiles'
import PrintButton from './PrintButton'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '심사 결과 열람', robots: { index: false, follow: false } }

const rgb = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

const TABS = [
  { key: 'summary', label: '종합 평가표' },
  { key: 'judges', label: '심사위원별 채점 결과' },
  { key: 'files', label: '발표자료 · 사업계획서' },
] as const

// 기관 담당자용 심사 결과 열람 (로그인 없이 링크 하나로 보기만): 종합 평가표 · 심사위원별 채점 결과 · 제출 자료
export default async function ResultSharePage({ params, searchParams }: { params: { token: string }; searchParams: { stage?: string; tab?: string; judge?: string } }) {
  const share = await loadResultShare(params.token)
  if (!share) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <div className="max-w-sm rounded-lg border border-line bg-card p-8 text-center">
          <div className="text-lg font-bold">열람할 수 없는 링크입니다</div>
          <p className="mt-2 text-sm text-muted">링크가 만료되었거나 사용이 중지되었습니다. 운영사무국에 문의해 주세요.</p>
        </div>
      </div>
    )
  }
  const db = supabaseAdmin()
  await db.from('result_shares')
    .update({ view_count: share.view_count + 1, last_viewed_at: new Date().toISOString() }).eq('id', share.id)
    .then(() => null, () => null)

  const ev = Object.values(EVENTS).find(e => e.programId === share.program_id) ?? null
  const theme = ev?.theme ?? { primary: '#578C76', deep: '#1F2A25', soft: '#E0E5E2', tint: '#F7F8F7' }
  const vars = { '--primary': rgb(theme.primary), '--bg': rgb(theme.tint), '--line': rgb(theme.soft), '--ev-deep': theme.deep } as CSSProperties

  const { data: stageRows } = await db.from('stages').select('*').eq('program_id', share.program_id).order('order_no')
  const stages = (stageRows ?? []) as Stage[]
  const stage = stages.find(s => s.id === searchParams.stage)
    ?? [...stages].reverse().find(s => s.status !== 'ready') ?? stages[stages.length - 1]
  const tab = TABS.find(t => t.key === searchParams.tab)?.key ?? 'summary'
  const judgeNo = Math.max(Number(searchParams.judge) || 0, 0) // 심사위원별 채점 결과: 화면에는 한 명씩
  const href = (p: { stage?: string; tab?: string; judge?: number }) => {
    const q = new URLSearchParams({ stage: p.stage ?? stage?.id ?? '', tab: p.tab ?? tab })
    if (p.judge) q.set('judge', String(p.judge))
    return `/r/${share.token}?${q}`
  }

  const r = stage ? await loadStageReport(db, stage.id) : null
  const progress = r ? await loadJudgeProgress(db, r) : []
  const submitted = progress.filter(p => p.submission?.status === 'submitted').length

  // 제출 자료: 팀별 현재 파일 (단계 제출 항목 순서·이름)
  let teams: ShareTeam[] = []
  if (r && tab === 'files') {
    const slots = (stage!.required_files ?? []) as RequiredFile[]
    const order = (t: string) => { const i = slots.findIndex(f => f.type === t); return i >= 0 ? i : 100 + (t === 'deck' ? 0 : t === 'plan' ? 1 : 2) }
    const { data: entries } = await db.from('stage_entries').select('id, company_id').eq('stage_id', stage!.id)
    const entryIds = (entries ?? []).map(e => e.id as string)
    const { data: subs } = entryIds.length
      ? await db.from('submissions').select('id, entry_id, file_type, file_name, version, storage_path, pdf_path').in('entry_id', entryIds).eq('is_current', true)
      : { data: [] }
    teams = (entries ?? []).map(e => {
      const c = r.companies.get(e.company_id as string)
      const files: ViewerFile[] = (subs ?? []).filter(s => s.entry_id === e.id)
        .sort((a, b) => order(a.file_type) - order(b.file_type))
        .map(s => ({
          submission_id: s.id, file_type: s.file_type, file_name: s.file_name, version: s.version,
          viewable: !!s.pdf_path || /\.pdf$/i.test(s.storage_path), label: slots.find(f => f.type === s.file_type)?.label,
        }))
      return { id: e.company_id as string, name: c?.name ?? '(삭제된 팀)', code: c?.blind_code ?? null, files }
    }).sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '', 'ko') || a.name.localeCompare(b.name, 'ko'))
  }

  return (
    <div style={vars} className="min-h-screen bg-bg text-fg">
      <style>{`${SHEET_CSS}\n@page { size: A4 portrait; margin: 12mm; }`}</style>
      <header className="no-print bg-[var(--ev-deep)] text-white">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
          <p className="text-sm text-white/60">{ev ? ev.title : 'INTWEEN 심사 관리 플랫폼'}</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">심사 결과 열람</h1>
          <p className="mt-1 text-white/80">{share.title}</p>
        </div>
      </header>
      <div className="no-print border-b border-line bg-card">
        <p className="mx-auto max-w-[1400px] px-4 py-2.5 text-xs leading-relaxed text-muted sm:px-6">
          기관 검토용 자료입니다. 외부 공유를 삼가 주세요. 점수는 심사위원이 입력하는 대로 바로 반영됩니다{r?.source === 'snapshot' ? ' (현재 확정된 결과)' : ''}.
          {share.expires_at && <> · 열람 가능 기한 {new Date(share.expires_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</>}
        </p>
      </div>

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {!r ? <p className="text-muted">등록된 심사 단계가 없습니다.</p> : (
          <>
            <div className="no-print mb-5 flex flex-wrap items-center gap-3">
              {stages.length > 1 && (
                <div className="flex overflow-hidden rounded-md border border-line text-sm">
                  {stages.map(s => (
                    <Link key={s.id} href={href({ stage: s.id })} className={cn('px-3 py-1.5 font-semibold', s.id === stage!.id ? 'bg-[var(--ev-deep)] text-white' : 'bg-card text-muted hover:bg-bg')}>{s.name}</Link>
                  ))}
                </div>
              )}
              <div className="flex overflow-hidden rounded-md border border-line text-sm">
                {TABS.map(t => (
                  <Link key={t.key} href={href({ tab: t.key })} className={cn('px-4 py-2 font-semibold', t.key === tab ? 'bg-primary text-primary-fg' : 'bg-card text-muted hover:bg-bg')}>{t.label}</Link>
                ))}
              </div>
              <span className="text-sm text-muted">심사위원 최종 제출 <b className="tabular text-fg">{submitted}/{progress.length}</b>명</span>
              {tab !== 'files' && <span className="ml-auto"><PrintButton /></span>}
            </div>

            {tab === 'files' ? (
              <ShareFiles token={share.token} teams={teams} watermark={r.program.title} />
            ) : (
              <div className="sheet rounded-lg border border-line bg-white p-4 text-[#111] print:border-0 print:p-0">
                <SheetTitle r={r} subtitle={tab === 'summary' ? '종합 평가표' : '심사위원별 채점 결과'} />
                {tab === 'summary'
                  ? <SummarySheet r={r} showNames={share.show_judge_names} signature />
                  : <JudgeSheets r={r} showNames={share.show_judge_names} current={judgeNo} nav={i => href({ judge: i })} />}
                {tab === 'judges' && <p className="no-print mt-4 text-xs text-muted">인쇄하면 심사위원마다 한 장씩 모두 출력됩니다.</p>}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
