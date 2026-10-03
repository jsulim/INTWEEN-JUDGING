import Link from 'next/link'
import { cn } from '@/components/ui'
import { StageStatusBadge } from '@/components/StatusBadges'
import type { Stage } from '@/lib/types'

/** ?stage= 단계 선택 탭 (서버 컴포넌트에서 사용) */
export default function StageTabs({ stages, current, basePath, extra }:
  { stages: Stage[]; current: Stage | null; basePath: string; extra?: Record<string, string> }) {
  if (stages.length === 0) return null
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {stages.map(s => {
        const q = new URLSearchParams({ ...(extra ?? {}), stage: s.id })
        const active = current?.id === s.id
        return (
          <Link key={s.id} href={`${basePath}?${q}`}
            className={cn('flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold',
              active ? 'border-primary bg-primary/10 text-primary' : 'border-line bg-card text-muted hover:text-fg')}>
            <span>{s.order_no}. {s.name}</span>
            <StageStatusBadge status={s.status} />
          </Link>
        )
      })}
    </div>
  )
}
