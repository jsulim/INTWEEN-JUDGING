// 심사위원 수당·원천징수 (A-15) — 화면·엑셀 공용 순수 함수
// 기타소득: 필요경비 60% 공제 후 소득세 20% + 지방소득세 2% → 지급액의 8.8%.
// 과세최저한: 건별 기타소득금액 5만원 이하(= 지급액 125,000원 이하)는 과세하지 않는다.
export const OTHER_INCOME_TAX_RATE = 0.088
export const INCOME_TAX_RATE = 0.08
export const TAX_EXEMPT_LIMIT = 125_000
export const TAX_RULE_TEXT = `기타소득 원천징수: 지급액 ${TAX_EXEMPT_LIMIT.toLocaleString('ko-KR')}원 초과 시 지급액 × ${(OTHER_INCOME_TAX_RATE * 100).toFixed(1)}%(소득세 8% + 지방소득세 0.8%, 10원 미만 절사), 이하면 과세최저한으로 0원`

const floor10 = (n: number) => Math.floor(n / 10) * 10

export function calcPayment(sessions: number, perSession: number) {
  const amount = Math.max(0, Math.round(sessions)) * Math.max(0, perSession)
  const tax = amount > TAX_EXEMPT_LIMIT ? floor10(amount * OTHER_INCOME_TAX_RATE) : 0
  const incomeTax = tax ? Math.min(tax, floor10(amount * INCOME_TAX_RATE)) : 0
  return { amount, tax, incomeTax, localTax: tax - incomeTax, net: amount - tax }
}

export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`
