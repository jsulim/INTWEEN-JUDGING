'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { fmtDate } from '@/lib/format'

/**
 * A-01 실시간 반영 (8-2, Q5): scores·assignments 변경 구독 → 500ms 디바운스 router.refresh()
 * 새 편차 경고가 나타나면 /api/stages/:id/deviation-check 로 n8n 알림 요청
 */
export default function LiveRefresh({ stageId, alertIds, renderedAt }: { stageId: string; alertIds: string[]; renderedAt: string }) {
  const router = useRouter()
  const [connected, setConnected] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const known = useRef<Set<string> | null>(null)

  useEffect(() => {
    const sb = supabaseBrowser()
    const refresh = () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => router.refresh(), 500)
    }
    const ch = sb.channel(`admin-dashboard-${stageId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: `stage_id=eq.${stageId}` }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stages', filter: `id=eq.${stageId}` }, refresh)
      .subscribe(status => setConnected(status === 'SUBSCRIBED'))
    return () => {
      clearTimeout(timer.current)
      sb.removeChannel(ch)
    }
  }, [stageId, router])

  // 편차 경고: 첫 렌더 기준선 이후 새로 생긴 기업만 알림
  useEffect(() => {
    if (known.current === null) {
      known.current = new Set(alertIds)
      return
    }
    const fresh = alertIds.filter(id => !known.current!.has(id))
    alertIds.forEach(id => known.current!.add(id))
    if (fresh.length) api(`/api/stages/${stageId}/deviation-check`, { body: { company_ids: fresh } }).catch(() => {})
  }, [alertIds, stageId])

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className={`h-2 w-2 rounded-full ${connected ? 'animate-pulse bg-accent' : 'bg-fg/20'}`} />
      {connected ? '실시간 반영 중' : '연결 중…'} · {fmtDate(renderedAt).slice(-5)} 갱신
    </span>
  )
}
