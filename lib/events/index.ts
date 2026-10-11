import type { EventConfig } from './types'
import { uljin } from './uljin'

// slug → 대회 소개 페이지. 새 대회는 lib/events/<slug>.ts 를 만들고 여기에 등록한다.
export const EVENTS: Record<string, EventConfig> = {
  [uljin.slug]: uljin,
}
