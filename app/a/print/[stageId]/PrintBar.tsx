'use client'
import Link from 'next/link'
import { cn } from '@/components/ui'

// 출력 화면 상단 도구 (인쇄 시 숨김): 양식 선택 · 옵션 · 인쇄
export default function PrintBar({ back, options }: {
  back: string
  options: { label: string; href: string; on: boolean }[][]
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card p-3 print:hidden">
      <Link href={back} className="text-sm text-muted hover:text-fg">← 평가 결과</Link>
      {options.map((group, i) => (
        <div key={i} className="flex overflow-hidden rounded-md border border-line text-sm">
          {group.map(o => (
            <Link key={o.label} href={o.href} replace
              className={cn('px-3 py-1.5 font-semibold', o.on ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-bg')}>{o.label}</Link>
          ))}
        </div>
      ))}
      <button type="button" onClick={() => window.print()}
        className="ml-auto rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-fg hover:bg-primary/90">인쇄 · PDF 저장</button>
    </div>
  )
}
