import { Badge } from '@/components/ui'
import { EVAL_STATE_LABEL, type EvalState } from './progress'

const TONE = { none: 'highlight', draft: 'primary', done: 'accent', conflict: 'neutral' } as const

export function EvalStateBadge({ state }: { state: EvalState }) {
  return <Badge tone={TONE[state]}>{EVAL_STATE_LABEL[state]}</Badge>
}
