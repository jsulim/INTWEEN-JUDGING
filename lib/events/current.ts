import 'server-only'
import { headers } from 'next/headers'
import { EVENTS } from '.'
import { EVENT_HOSTS } from './hosts'
import type { EventConfig } from './types'

/** 요청 주소가 대회 전용 하위 도메인이면 그 대회 설정 */
export function currentEvent(): EventConfig | null {
  const host = headers().get('host')?.split(':')[0] ?? ''
  const slug = EVENT_HOSTS[host]
  return slug ? EVENTS[slug] ?? null : null
}

const rgb = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

/** 플랫폼 테마 변수(globals.css)를 대회 포스터 색으로 덮어쓰는 CSS. 상태 색(완료·경고·오류)은 그대로 둔다 */
export function eventThemeCss(e: EventConfig) {
  return `:root{--primary:${rgb(e.theme.primary)};--bg:${rgb(e.theme.tint)};--line:${rgb(e.theme.soft)}}`
}
