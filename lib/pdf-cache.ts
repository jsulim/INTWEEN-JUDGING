'use client'
// 심사 자료 PDF 캐시 (브라우저)
//  · 메모리: 같은 화면·페이지 이동(이전/다음 기업) 동안 다시 받지 않는다. 동시에 요청돼도 한 번만 받는다.
//  · 디스크(Cache Storage): 새로고침해도 다시 받지 않는다. 제출 파일은 버전마다 id 가 달라 내용이 바뀌지 않으므로 id 로 보관.
//    로그아웃하면 지운다 (clearPdfCache). 24시간 지난 것은 쓰지 않는다.

const CACHE_NAME = 'intween-pdf-v1'
const MAX_AGE_MS = 24 * 60 * 60 * 1000
const MAX_MEMORY_BYTES = 400 * 1024 * 1024

const memory = new Map<string, Promise<Uint8Array>>()
const sizes = new Map<string, number>()

const cacheKey = (id: string) => `https://pdf-cache.invalid/${encodeURIComponent(id)}`

async function readDisk(id: string): Promise<Uint8Array | null> {
  try {
    if (typeof caches === 'undefined') return null
    const res = await (await caches.open(CACHE_NAME)).match(cacheKey(id))
    if (!res) return null
    const at = Number(res.headers.get('x-cached-at') || 0)
    if (Date.now() - at > MAX_AGE_MS) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    return null
  }
}

async function writeDisk(id: string, data: Uint8Array) {
  try {
    if (typeof caches === 'undefined') return
    const body = new Blob([data.slice()], { type: 'application/pdf' })
    await (await caches.open(CACHE_NAME)).put(cacheKey(id),
      new Response(body, { headers: { 'content-type': 'application/pdf', 'x-cached-at': String(Date.now()) } }))
  } catch { /* 저장 공간 부족 등은 무시 (메모리 캐시는 유지) */ }
}

function trimMemory() {
  let total = [...sizes.values()].reduce((a, b) => a + b, 0)
  for (const id of memory.keys()) {
    if (total <= MAX_MEMORY_BYTES) break
    total -= sizes.get(id) ?? 0
    memory.delete(id)
    sizes.delete(id)
  }
}

/**
 * PDF 바이트 가져오기. 메모리 → 디스크 → 네트워크(getUrl 로 서명 URL 받아 다운로드) 순.
 * persist=false 면 디스크에 남기지 않는다 (공유 링크 화면 등).
 */
export function loadPdfBytes(id: string, getUrl: () => Promise<string>, persist = true): Promise<Uint8Array> {
  const hit = memory.get(id)
  if (hit) {
    // 최근 사용으로 순서 갱신
    memory.delete(id)
    memory.set(id, hit)
    return hit
  }
  const p = (async () => {
    const disk = persist ? await readDisk(id) : null
    if (disk) return disk
    const res = await fetch(await getUrl())
    if (!res.ok) throw new Error(`파일을 불러오지 못했습니다 (${res.status})`)
    const data = new Uint8Array(await res.arrayBuffer())
    if (persist) void writeDisk(id, data)
    return data
  })()
  memory.set(id, p)
  p.then(d => { sizes.set(id, d.byteLength); trimMemory() }, () => { memory.delete(id); sizes.delete(id) })
  return p
}

/** 로그아웃 시 이 기기에 남은 자료를 지운다 */
export async function clearPdfCache() {
  memory.clear()
  sizes.clear()
  try { if (typeof caches !== 'undefined') await caches.delete(CACHE_NAME) } catch { /* 무시 */ }
}
