import { Badge } from '@/components/ui'
import { STAGE_STATUS, ELIGIBILITY, RESULT, dday } from '@/lib/format'
import type { StageStatus, Eligibility, EntryResult } from '@/lib/types'

export function StageStatusBadge({ status }: { status: StageStatus }) {
  const tone = ({ ready: 'neutral', submitting: 'primary', evaluating: 'highlight', locked: 'accent', published: 'accent' } as const)[status]
  return <Badge tone={tone}>{STAGE_STATUS[status]}</Badge>
}

export function EligibilityBadge({ value }: { value: Eligibility }) {
  const tone = ({ pending: 'neutral', eligible: 'accent', supplement: 'highlight', ineligible: 'danger' } as const)[value]
  return <Badge tone={tone}>{ELIGIBILITY[value]}</Badge>
}

export function ResultBadge({ value }: { value: EntryResult }) {
  const tone = ({ pending: 'neutral', pass: 'accent', fail: 'danger' } as const)[value]
  return <Badge tone={tone}>{RESULT[value]}</Badge>
}

export function DDayBadge({ deadline }: { deadline: string | null | undefined }) {
  const d = dday(deadline)
  if (!d) return null
  return <Badge tone={d.closed ? 'neutral' : d.urgent ? 'highlight' : 'primary'}>{d.label}</Badge>
}
