import 'server-only'

// 10장: 플랫폼은 이벤트만 웹훅으로 보낸다. 메일·슬랙·카카오 발송과 문구·시점은 n8n 에서 관리.
export type N8nEvent =
  | 'invite.created'
  | 'submission.completed'
  | 'submission.reminder' // 접수 마감 D-3, D-1 미제출 기업
  | 'evaluation.started'
  | 'evaluation.reminder' // 평가 마감 D-1 미완료 심사위원
  | 'evaluation.completed'
  | 'score.deviation' // 점수 편차 경고
  | 'stage.locked'
  | 'stage.published'
  | 'stage.advanced'
  | 'eligibility.supplement' // 보완 요청
  | 'presentation.scheduled' // 발표 순서 확정
  | 'presentation.upcoming' // 발표 10분 전
  | 'appeal.received'
  | 'retention.upcoming' // 파기 예정 D-30

export async function emitEvent(event: N8nEvent, payload: Record<string, unknown>) {
  const url = process.env.N8N_WEBHOOK_URL
  if (!url) return { skipped: true }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.N8N_WEBHOOK_SECRET ? { 'x-intween-secret': process.env.N8N_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify({ event, at: new Date().toISOString(), site: process.env.NEXT_PUBLIC_SITE_URL, ...payload }),
      signal: AbortSignal.timeout(5000),
    })
    return { ok: res.ok }
  } catch (e) {
    // 알림 실패가 본 작업을 막지 않도록 삼킨다
    console.error('[n8n]', event, e)
    return { ok: false }
  }
}
