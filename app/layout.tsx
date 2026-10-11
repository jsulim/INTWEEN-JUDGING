import type { Metadata } from 'next'
import { BrandProvider, DEFAULT_BRAND } from '@/components/Brand'
import { currentEvent, eventThemeCss } from '@/lib/events/current'
import './globals.css'

// 대회 전용 주소(예: uljin-ideathon.sasurae.kr)로 들어오면 로그인·심사 화면도 그 대회 색과 이름으로 보인다.
export function generateMetadata(): Metadata {
  const ev = currentEvent()
  return {
    title: ev ? `${ev.title} 심사` : 'INTWEEN 심사 관리 플랫폼',
    description: '해커톤·기업심사 통합 운영 — 제출, 동의서 서명, 블라인드 평가, 실시간 집계',
    robots: { index: false, follow: false },
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const ev = currentEvent()
  const brand = ev ? { name: ev.title, sub: '심사 플랫폼' } : DEFAULT_BRAND
  return (
    <html lang="ko">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
        {ev && <style dangerouslySetInnerHTML={{ __html: eventThemeCss(ev) }} />}
      </head>
      <body><BrandProvider brand={brand}>{children}</BrandProvider></body>
    </html>
  )
}
