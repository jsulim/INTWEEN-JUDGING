import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/supabase/server'
import { loadShare, shareEntries } from '@/lib/server/pool-share'
import { EVENTS } from '@/lib/events'
import { POOL_CATEGORIES } from '@/lib/pool'
import PoolViewer, { type PoolCard } from './PoolViewer'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '심사위원 후보 풀', robots: { index: false, follow: false } }

const rgb = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

// 기관 검토용 심사위원 후보 풀 (링크 하나로 열람). 분야별 목록 → 이력서·증빙 뷰어.
export default async function PoolSharePage({ params }: { params: { token: string } }) {
  const share = await loadShare(params.token)
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
  // 열람 기록 (실패해도 화면은 보여준다)
  await supabaseAdmin().from('pool_shares')
    .update({ view_count: share.view_count + 1, last_viewed_at: new Date().toISOString() }).eq('id', share.id)
    .then(() => null, () => null)

  const ev = Object.values(EVENTS).find(e => share.program_id && e.programId === share.program_id) ?? null
  const theme = ev?.theme ?? { primary: '#578C76', deep: '#1F2A25', soft: '#E0E5E2', tint: '#F7F8F7' }
  const vars = {
    '--primary': rgb(theme.primary), '--bg': rgb(theme.tint), '--line': rgb(theme.soft),
    '--ev-deep': theme.deep, '--ev-soft': theme.soft,
  } as CSSProperties

  const entries = await shareEntries(share)
  const cards: PoolCard[] = entries.map(e => ({
    id: e.id, name: e.name, affiliation: e.affiliation, position: e.position, category: e.category,
    expertise: e.expertise ?? [], hasResume: !!e.resume_path, docs: (e.docs ?? []).map(d => d.label),
  }))
  const cats = POOL_CATEGORIES.filter(c => !share.categories?.length || share.categories.includes(c.code))

  return (
    <div style={vars} className="min-h-screen bg-bg text-fg">
      <header className="bg-[var(--ev-deep)] text-white">
        <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
          <p className="text-sm text-white/60">{ev ? ev.title : 'INTWEEN 심사 관리 플랫폼'}</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">심사위원 후보 풀</h1>
          <p className="mt-1 text-white/80">{share.title}</p>
        </div>
      </header>
      <div className="border-b border-line bg-card">
        <p className="mx-auto max-w-[1500px] px-4 py-2.5 text-xs leading-relaxed text-muted sm:px-6">
          심사위원 선정 검토용 자료입니다. 화면 열람만 가능하며 저장·인쇄·외부 공유를 삼가 주세요.
          주민등록번호는 가림 처리했습니다.
          {share.expires_at && <> · 열람 가능 기한 {new Date(share.expires_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</>}
        </p>
      </div>
      <PoolViewer token={share.token} cards={cards} categories={cats.map(c => ({ code: c.code, label: c.label }))} />
    </div>
  )
}
