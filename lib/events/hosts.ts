import { EVENTS } from '.'

// 하위 도메인 → 대회. 미들웨어가 대회 전용 주소로 들어온 요청을 연결할 때 쓴다.
const withHost = Object.values(EVENTS).filter(e => e.host)
export const EVENT_HOSTS: Record<string, string> = Object.fromEntries(withHost.map(e => [e.host!, e.slug]))
/** <host>/join → 연결된 프로그램의 심사위원 가입 신청 */
export const EVENT_JOIN: Record<string, string> = Object.fromEntries(
  withHost.filter(e => e.programId).map(e => [e.host!, e.programId!]),
)
