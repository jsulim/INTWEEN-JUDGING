import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import EventLanding from '@/components/event/EventLanding'
import { EVENTS } from '@/lib/events'

// 대회별 소개 페이지 /<slug>
//  · 일반용 링크:         /<slug>             (로그인 버튼 없음)
//  · 심사위원·관리자 링크: /<slug>?view=staff  (로그인 버튼 노출)
// 외부 비공개 — 루트 레이아웃의 robots noindex 를 그대로 따른다.

type Props = { params: { slug: string }; searchParams: { view?: string } }

export function generateMetadata({ params }: Props): Metadata {
  const c = EVENTS[params.slug]
  return c ? { title: c.title, description: c.summary } : {}
}

export default function EventPage({ params, searchParams }: Props) {
  const c = EVENTS[params.slug]
  if (!c) notFound()
  return <EventLanding config={c} showLogin={searchParams.view === 'staff'} />
}
