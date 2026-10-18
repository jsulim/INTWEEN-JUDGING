// 평가항목 대항목 묶음 (criteria.group_name). 표 머리글 위 줄에 대항목을 병합해 보여줄 때 쓴다.
type G = { group_name?: string | null; max_score: number | string }

/** 연속된 같은 대항목끼리 묶은 구간. 대항목이 하나도 없으면 null (머리글 한 줄) */
export function groupSpans<T extends G>(criteria: T[]): { name: string; span: number; max: number }[] | null {
  if (!criteria.some(c => c.group_name)) return null
  const out: { name: string; span: number; max: number }[] = []
  for (const c of criteria) {
    const name = c.group_name ?? ''
    const last = out[out.length - 1]
    if (last && last.name === name && name) { last.span++; last.max += Number(c.max_score) }
    else out.push({ name, span: 1, max: Number(c.max_score) })
  }
  return out
}
