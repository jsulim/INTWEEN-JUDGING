import JSZip from 'jszip'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { downloadBytes } from '@/lib/server/storage'
import type { Company, Submission } from '@/lib/types'

// GET /api/admin/stages/:stageId/files-zip — 단계 제출 파일 일괄 다운로드 (A-05)
// 기업별 폴더({blind_code}_{기업명}/)에 현재 버전 파일. 저장소 읽기는 서비스 롤.
export const runtime = 'nodejs'
export const maxDuration = 300

const safe = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || '_'

export const GET = handle(async (_req: Request, { params }: { params: { stageId: string } }) => {
  const { supabase } = await requireApi('admin')
  const { data: stage } = await supabase.from('stages').select('id, name, order_no, programs(title)').eq('id', params.stageId).maybeSingle()
  if (!stage) throw new ApiError(404, '단계를 찾을 수 없습니다.')
  const { data: entries } = await supabase.from('stage_entries').select('id, companies(*)').eq('stage_id', stage.id)
  const list = (entries ?? []) as unknown as { id: string; companies: Company }[]
  const entryIds = list.map(e => e.id)
  const { data: subs } = entryIds.length
    ? await supabase.from('submissions').select('*').eq('is_current', true).in('entry_id', entryIds)
    : { data: [] }
  if (!subs?.length) throw new ApiError(404, '제출된 파일이 없습니다.')

  const zip = new JSZip()
  const byEntry = new Map(list.map(e => [e.id, e.companies]))
  const failed: string[] = []
  for (const s of subs as Submission[]) {
    const c = byEntry.get(s.entry_id)
    const folder = safe(`${c?.blind_code ?? ''}_${c?.name ?? s.entry_id}`)
    try {
      const bytes = await downloadBytes(s.storage_path)
      zip.file(`${folder}/${safe(`${s.file_type}_v${s.version}_${s.file_name}`)}`, bytes)
    } catch {
      failed.push(`${folder}/${s.file_name}`)
    }
  }
  if (failed.length) zip.file('_누락_파일.txt', `다운로드하지 못한 파일:\n${failed.join('\n')}\n`)
  await supabase.rpc('log_event', { p_action: 'download', p_table: 'stages', p_row: stage.id, p_meta: { kind: 'files-zip', files: subs.length } })

  const buf = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  const programTitle = (stage.programs as unknown as { title: string } | null)?.title ?? ''
  const fname = safe(`${programTitle}_${stage.order_no}_${stage.name}_제출파일.zip`)
  return new Response(new Blob([new Uint8Array(buf)], { type: 'application/zip' }), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="files.zip"; filename*=UTF-8''${encodeURIComponent(fname)}`,
      'cache-control': 'no-store',
    },
  })
})
