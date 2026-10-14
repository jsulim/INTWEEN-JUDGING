import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { signedUploadUrl } from '@/lib/server/storage'
import { POOL_CATEGORIES } from '@/lib/pool'
import type { JudgePoolEntry } from '@/lib/types'

// POST /api/admin/pool — 심사위원 풀 자료 일괄 등록 (A-16)
//  · upsert : 이름+소속으로 찾아 분야·추천경로 갱신, 없으면 새로 등록 → id. program_id 를 주면 그 대회 후보로 담는다
//  · ticket : 이력서·증빙 PDF 서명 업로드 URL
//  · attach : 업로드한 파일을 이력서 또는 증빙으로 연결 (같은 이름의 증빙은 교체)
// 파일은 업로드 전에 개인정보 가림을 마친 PDF만 받는다 (기관에 그대로 보여지므로).
const codes = POOL_CATEGORIES.map(c => c.code) as [string, ...string[]]
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('upsert'), name: z.string().trim().min(1).max(50), affiliation: z.string().trim().max(100),
    source: z.string().trim().max(100).nullable(), category: z.enum(codes).nullable(), program_id: z.guid().nullable().optional() }),
  z.object({ action: z.literal('ticket'), id: z.guid(), kind: z.enum(['resume', 'doc']), size: z.number().int().positive().max(30 * 1024 * 1024) }),
  z.object({ action: z.literal('attach'), id: z.guid(), kind: z.enum(['resume', 'doc']), path: z.string().min(1).max(300), label: z.string().trim().max(100).optional() }),
])

export const POST = handle(async (req: Request) => {
  const { supabase } = await requireApi('admin')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '요청 형식이 올바르지 않습니다.')
  const b = parsed.data

  if (b.action === 'upsert') {
    const { data: found } = await supabase.from('judge_pool').select('id').eq('name', b.name).eq('affiliation', b.affiliation).limit(1)
    let id = found?.[0]?.id as string | undefined
    if (id) {
      const { error } = await supabase.from('judge_pool').update({ category: b.category, source: b.source }).eq('id', id)
      if (error) throw error
    } else {
      const { data, error } = await supabase.from('judge_pool')
        .insert({ name: b.name, affiliation: b.affiliation, source: b.source, category: b.category }).select('id').single()
      if (error) throw error
      id = data.id as string
    }
    if (b.program_id) {
      const { error } = await supabase.from('pool_members').upsert({ program_id: b.program_id, pool_id: id }, { onConflict: 'program_id,pool_id' })
      if (error) throw error
    }
    return NextResponse.json({ id, created: !found?.[0] })
  }

  const { data: entry } = await supabase.from('judge_pool').select('id, docs').eq('id', b.id).maybeSingle()
  if (!entry) throw new ApiError(404, '심사위원을 찾을 수 없습니다.')
  const prefix = `pool/${b.id}/`

  if (b.action === 'ticket') {
    const path = `${prefix}${b.kind}_${Date.now()}.pdf`
    const signed = await signedUploadUrl(path)
    return NextResponse.json({ path: signed.path ?? path, token: signed.token })
  }

  if (!b.path.startsWith(prefix)) throw new ApiError(400, '잘못된 파일 경로입니다.')
  if (b.kind === 'resume') {
    const { error } = await supabase.from('judge_pool').update({ resume_path: b.path }).eq('id', b.id)
    if (error) throw error
  } else {
    const label = b.label || '증빙'
    const docs = ((entry as Pick<JudgePoolEntry, 'docs'>).docs ?? []).filter(d => d.label !== label)
    const { error } = await supabase.from('judge_pool').update({ docs: [...docs, { label, path: b.path }] }).eq('id', b.id)
    if (error) throw error
  }
  return NextResponse.json({ ok: true })
})
