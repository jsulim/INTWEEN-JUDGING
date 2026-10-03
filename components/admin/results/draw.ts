import { createHash } from 'node:crypto'

// 발표 순서 랜덤 추첨 (A-13): 시드 → 결정적 셔플. 같은 시드·같은 대상이면 언제 다시 돌려도 같은 순서 (검증 가능)
// 알고리즘: 대상 company_id 오름차순 정렬 → Fisher–Yates, i번째 난수 = SHA-256(seed:i) 앞 4바이트 / 2^32
export const DRAW_ALGORITHM = 'fisher-yates/sha256(seed:i)/sorted-company-id'

export function seededRandom(seed: string) {
  let i = 0
  return () => createHash('sha256').update(`${seed}:${i++}`).digest().readUInt32BE(0) / 2 ** 32
}

export function drawOrder(companyIds: string[], seed: string) {
  const xs = [...companyIds].sort()
  const rnd = seededRandom(seed)
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }
  return xs
}
