import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { inviteCompany, type InviteStatus } from '@/components/admin/setup/invite'
import { siteUrl } from '@/components/admin/setup/server'

// POST /api/invite/bulk — 엑셀(.xlsx)·CSV 일괄 등록 (A-05)
// multipart/form-data: file, program_id, send('true'|'false')
// 열: 기업명, 사업자번호, 대표자, 분야, 이메일
export const runtime = 'nodejs'
const MAX_ROWS = 500

const COLS = {
  name: ['기업명', '회사명', '기업', 'name'],
  biz_no: ['사업자번호', '사업자등록번호', 'biz_no'],
  ceo: ['대표자', '대표자명', '대표', 'ceo'],
  field: ['분야', '업종', 'field'],
  email: ['이메일', '메일', 'email', 'e-mail'],
} as const
type Key = keyof typeof COLS

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if ('text' in v && v.text != null) return typeof v.text === 'string' ? v.text : cellText(v.text as ExcelJS.CellValue)
    if ('richText' in v) return v.richText.map(r => r.text).join('')
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue)
    if ('hyperlink' in v) return String(v.hyperlink).replace(/^mailto:/, '')
  }
  return String(v)
}

/** RFC4180 수준의 간단 CSV 파서 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cur); rows.push(row); row = []; cur = ''
    } else cur += ch
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows
}

async function readTable(file: File): Promise<string[][]> {
  const buf = Buffer.from(await file.arrayBuffer())
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    let text = buf.toString('utf8')
    if (text.includes('�')) text = new TextDecoder('euc-kr').decode(buf) // 엑셀 기본 CSV(CP949)
    return parseCsv(text.replace(/^﻿/, ''))
  }
  if (!name.endsWith('.xlsx')) throw new ApiError(400, '.xlsx 또는 .csv 파일만 지원합니다.')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
  const ws = wb.worksheets[0]
  if (!ws) throw new ApiError(400, '시트를 찾을 수 없습니다.')
  const rows: string[][] = []
  ws.eachRow({ includeEmpty: false }, r => {
    const vals: string[] = []
    for (let c = 1; c <= r.cellCount; c++) vals.push(cellText(r.getCell(c).value).trim())
    rows.push(vals)
  })
  return rows
}

export const POST = handle(async (req: Request) => {
  const { supabase } = await requireApi('admin')
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  const programId = String(form?.get('program_id') ?? '')
  const send = String(form?.get('send') ?? 'true') === 'true'
  if (!(file instanceof File)) throw new ApiError(400, '파일을 첨부해 주세요.')
  if (!/^[0-9a-f-]{36}$/i.test(programId)) throw new ApiError(400, '프로그램 정보가 없습니다.')
  if (file.size > 5 * 1024 * 1024) throw new ApiError(400, '파일은 5MB 이하만 업로드할 수 있습니다.')

  const table = (await readTable(file)).filter(r => r.some(v => v.trim() !== ''))
  if (table.length < 2) throw new ApiError(400, '헤더 행과 데이터 행이 필요합니다.')

  const header = table[0].map(h => h.replace(/\s|\*/g, '').toLowerCase())
  const idx = {} as Record<Key, number>
  for (const k of Object.keys(COLS) as Key[]) {
    idx[k] = header.findIndex(h => (COLS[k] as readonly string[]).some(c => c.toLowerCase() === h))
  }
  if (idx.name < 0) throw new ApiError(400, "'기업명' 열을 찾을 수 없습니다. 양식의 헤더(기업명, 사업자번호, 대표자, 분야, 이메일)를 확인해 주세요.")
  const body = table.slice(1)
  if (body.length > MAX_ROWS) throw new ApiError(400, `한 번에 ${MAX_ROWS}행까지 등록할 수 있습니다.`)

  const ctx = { supabase, site: siteUrl(req) }
  const results: { row: number; name: string; email: string; status: InviteStatus; message: string }[] = []
  for (let i = 0; i < body.length; i++) {
    const r = body[i]
    const get = (k: Key) => (idx[k] >= 0 ? (r[idx[k]] ?? '').trim() : '')
    const name = get('name')
    const email = get('email')
    if (!name) {
      results.push({ row: i + 2, name, email, status: 'error', message: '기업명 누락' })
      continue
    }
    try {
      const out = await inviteCompany(ctx, {
        programId,
        company: { name, biz_no: get('biz_no') || null, ceo: get('ceo') || null, field: get('field') || null },
        email: email || undefined,
        send,
      })
      results.push({ row: i + 2, name, email, status: out.status, message: out.message })
    } catch (e) {
      results.push({ row: i + 2, name, email, status: 'error', message: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) })
    }
  }
  const summary = {
    total: results.length,
    invited: results.filter(r => r.status === 'invited').length,
    created: results.filter(r => r.status === 'created').length,
    exists: results.filter(r => r.status === 'exists').length,
    error: results.filter(r => r.status === 'error').length,
  }
  return NextResponse.json({ summary, results })
})
