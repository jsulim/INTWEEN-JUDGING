import type { SupabaseClient } from '@supabase/supabase-js'

/** 목록에서 i 번째 항목을 dir(-1/+1) 만큼 이동하고 order_no 를 1..n 으로 다시 매겨 변경된 행만 저장 */
export async function moveRow<T extends { id: string; order_no: number }>(
  sb: SupabaseClient, table: string, list: T[], i: number, dir: -1 | 1,
) {
  const j = i + dir
  if (j < 0 || j >= list.length) return
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  const changed = next.map((r, k) => ({ id: r.id, order_no: k + 1, old: r.order_no })).filter(r => r.order_no !== r.old)
  const results = await Promise.all(changed.map(r => sb.from(table).update({ order_no: r.order_no }).eq('id', r.id)))
  const err = results.find(r => r.error)?.error
  if (err) throw new Error(err.message)
}
