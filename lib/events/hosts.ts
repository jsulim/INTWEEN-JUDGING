import { EVENTS } from '.'

// 하위 도메인 → slug. 미들웨어가 대회 전용 주소로 들어온 요청을 /<slug> 로 연결할 때 쓴다.
export const EVENT_HOSTS: Record<string, string> = Object.fromEntries(
  Object.values(EVENTS).filter(e => e.host).map(e => [e.host!, e.slug]),
)
