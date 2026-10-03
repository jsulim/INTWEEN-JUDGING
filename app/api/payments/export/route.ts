import ExcelJS from 'exceljs'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { decrypt } from '@/lib/server/crypto'
import { fileResponse, loadJudgeDirectory, safeName, XLSX_TYPE } from '@/lib/server/export'
import { fmtDate } from '@/lib/format'
import { calcPayment, TAX_RULE_TEXT } from '@/components/admin/results/payroll'
import type { JudgePayment, Program } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/payments/export?program_id= — 지급·원천징수 명세 엑셀 (A-15)
// 정산 권한자만 주민등록번호·계좌 복호화, 그 외 관리자는 마스킹
const MASK_RRN = '******-*******'
const MASK_ACC = '**********'

export const GET = handle(async (req: Request) => {
  const { supabase, profile } = await requireApi('admin')
  const programId = new URL(req.url).searchParams.get('program_id')
  if (!programId) throw new ApiError(400, 'program_id 가 필요합니다.')
  const { data: prog } = await supabase.from('programs').select('*').eq('id', programId).maybeSingle()
  if (!prog) throw new ApiError(404, '프로그램을 찾을 수 없습니다.')
  const program = prog as Program
  const canPay = profile.can_pay

  const [judges, { data: pays }] = await Promise.all([
    loadJudgeDirectory(supabase, programId),
    supabase.from('judge_payments').select('*').eq('program_id', programId),
  ])
  const payOf = new Map(((pays ?? []) as JudgePayment[]).map(p => [p.judge_id, p]))
  const dec = (v: string | null) => {
    if (!v) return ''
    try { return decrypt(v) } catch { return '(복호화 실패)' }
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'INTWEEN 심사 관리 플랫폼'
  const ws = wb.addWorksheet('지급·원천징수 명세')
  ws.columns = [
    { header: '번호', key: 'no', width: 6 },
    { header: '성명', key: 'name', width: 12 },
    { header: '소속', key: 'aff', width: 18 },
    { header: '주민등록번호', key: 'rrn', width: 17 },
    { header: '은행', key: 'bank', width: 12 },
    { header: '계좌번호', key: 'acc', width: 20 },
    { header: '예금주', key: 'holder', width: 10 },
    { header: '횟수', key: 'sessions', width: 7 },
    { header: '지급액', key: 'amount', width: 12 },
    { header: '소득세', key: 'itax', width: 10 },
    { header: '지방소득세', key: 'ltax', width: 10 },
    { header: '원천징수 합계', key: 'tax', width: 12 },
    { header: '실지급액', key: 'net', width: 12 },
    { header: '지급일', key: 'paid', width: 18 },
    { header: '비고', key: 'note', width: 20 },
  ]
  const head = ws.getRow(1)
  head.font = { bold: true }
  head.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0EC' } } })
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  let sum = { amount: 0, itax: 0, ltax: 0, tax: 0, net: 0 }
  judges.forEach((j, i) => {
    const p = payOf.get(j.id)
    // 저장된 금액·세액 기준 (화면에서 산정·저장). 세목 분리는 같은 규칙으로 계산
    const amount = p?.amount ?? 0
    const tax = p?.tax ?? 0
    const split = calcPayment(1, amount)
    const itax = tax ? Math.min(tax, split.incomeTax) : 0
    const row = {
      no: i + 1, name: j.name, aff: j.affiliation ?? '',
      rrn: p?.rrn_enc ? (canPay ? dec(p.rrn_enc) : MASK_RRN) : '',
      bank: p?.bank_name ?? '', acc: p?.bank_enc ? (canPay ? dec(p.bank_enc) : MASK_ACC) : '', holder: p?.holder ?? '',
      sessions: p?.sessions ?? 0, amount, itax, ltax: tax - itax, tax, net: amount - tax,
      paid: p?.paid_at ? fmtDate(p.paid_at) : '', note: !p ? '정보 미등록' : !p.consent_at ? '동의 미확인' : '',
    }
    sum = { amount: sum.amount + amount, itax: sum.itax + itax, ltax: sum.ltax + row.ltax, tax: sum.tax + tax, net: sum.net + row.net }
    ws.addRow(row)
  })
  const total = ws.addRow({ name: '합계', ...sum })
  total.font = { bold: true }
  for (const k of ['amount', 'itax', 'ltax', 'tax', 'net']) ws.getColumn(k).numFmt = '#,##0'
  ws.addRow([])
  ws.addRow([`${program.title} · 1회 수당 ${program.payment_per_session.toLocaleString('ko-KR')}원`])
  ws.addRow([TAX_RULE_TEXT])
  ws.addRow([canPay ? `정산 권한자 ${profile.name} 출력 — 개인정보 포함, 취급 주의` : '개인정보 마스킹본 (정산 권한자만 복호화 가능)'])

  await supabase.rpc('log_event', {
    p_action: canPay ? 'view' : 'export', p_table: 'judge_payments', p_row: null,
    p_meta: { program_id: programId, type: 'payments-export', decrypted: canPay, count: judges.length },
  })

  const bytes = new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer)
  const name = `${safeName(program.title)}_심사수당_지급명세_${new Date().toISOString().slice(0, 10)}${canPay ? '' : '_마스킹'}.xlsx`
  return fileResponse(bytes, name, XLSX_TYPE)
})
