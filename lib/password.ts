export function passwordProblem(pw: string, confirm?: string) {
  if (pw.length < 8) return '비밀번호는 8자 이상이어야 합니다.'
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return '영문과 숫자를 모두 포함해 주세요.'
  if (confirm !== undefined && pw !== confirm) return '비밀번호 확인이 일치하지 않습니다.'
  return null
}
