'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { fmtDate } from '@/lib/format'

/**
 * A-01 실시간 반영 (8-2, Q5): scores·assignments 변경 구독 → 500ms 디바운스 router.refresh()
 * 편차 경고가 있으면 /api/stages/:id/deviation-check 로 즉시 확인 요청 (중복 발송은 서버가 막는다)
 */
export default function LiveRefresh({ stageId, alertIds, renderedAt }: { stageId: string; alertIds: string[]; renderedAt: string }) {
  const router = useRouter()
  const [connected, setConnected] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()

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

  // 편차 경고: 경고 기업 구성이 바뀔 때만 요청. 이미 알린 기업은 서버(deviation_alerts)가 걸러 낸다
  const alertKey = [...alertIds].sort().join(',')
  useEffect(() => {
    if (alertKey) api(`/api/stages/${stageId}/deviation-check`, { body: {} }).catch(() => {})
  }, [alertKey, stageId])

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className={`h-2 w-2 rounded-full ${connected ? 'animate-pulse bg-accent' : 'bg-fg/20'}`} />
      {connected ? '실시간 반영 중' : '연결 중…'} · {fmtDate(renderedAt).slice(-5)} 갱신
    </span>
  )
}
