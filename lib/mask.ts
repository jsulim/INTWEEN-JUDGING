// 화면 표시용 마스킹 (Q17)
export function maskRrn(rrn: string) {
  const d = rrn.replace(/\D/g, '')
  return d.length >= 7 ? `${d.slice(0, 6)}-${d[6]}******` : '******'
}
export function maskAccount(acc: string) {
  const d = acc.replace(/\s/g, '')
  return d.length > 4 ? `${'*'.repeat(d.length - 4)}${d.slice(-4)}` : '****'
}
