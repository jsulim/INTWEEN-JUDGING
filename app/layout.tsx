import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'INTWEEN 심사 관리 플랫폼',
  description: '해커톤·기업심사 통합 운영 — 제출, 동의서 서명, 블라인드 평가, 실시간 집계',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body>{children}</body>
    </html>
  )
}
