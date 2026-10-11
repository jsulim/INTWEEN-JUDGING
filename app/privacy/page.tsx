import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: '개인정보처리방침 · INTWEEN 심사 관리 플랫폼' }

// 공개 개인정보처리방침 (Google 로그인 동의 화면 링크용). 문구 변경 시 시행일을 함께 바꾼다.
const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: '1. 처리하는 개인정보 항목',
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>심사위원: 이름, 이메일, 연락처, 소속·직위, 전문 분야, 동의서·평가표 전자서명, 접속 기록(IP, 브라우저 정보)</li>
        <li>참가 기업·팀: 기업(팀)명, 대표자명, 사업자등록번호(해당 시), 담당자 이메일·연락처, 제출 자료</li>
        <li>Google 계정으로 로그인하는 경우: Google이 제공하는 이름, 이메일 주소</li>
        <li>심사 수당을 지급하는 사업에 한해: 계좌 정보, 주민등록번호 (별도 동의 후 암호화 저장)</li>
      </ul>
    ),
  },
  {
    title: '2. 처리 목적',
    body: '해커톤·경진대회·지원사업의 참가 접수, 심사위원 배정과 평가, 심사 결과 산정·안내, 동의서·평가표 서명 증빙, 심사 수당 지급(해당 시), 부정 접근 방지를 위해 처리합니다.',
  },
  {
    title: '3. 보유 및 이용 기간',
    body: '각 사업(프로그램) 종료일부터 해당 사업의 공고 또는 발주처 기준에 따른 보유기간(기본 3년) 동안 보관한 뒤 지체 없이 파기하고, 파기 기록을 남깁니다. 정보주체가 삭제를 요청하면 관계 법령상 보관 의무가 없는 한 지체 없이 파기합니다.',
  },
  {
    title: '4. 제3자 제공',
    body: '사업의 주최·주관 기관에 심사 운영과 결과 보고에 필요한 범위에서 제공할 수 있으며, 이 경우 각 사업의 공고·동의서에 제공받는 자와 항목을 미리 알리고 동의를 받습니다. 그 밖에는 법령에 근거가 있는 경우를 제외하고 제3자에게 제공하지 않습니다.',
  },
  {
    title: '5. 처리 위탁 및 국외 이전',
    body: '서비스 운영을 위해 클라우드 서비스(Supabase: 데이터베이스·파일 저장, 서울 리전 / Vercel: 웹 호스팅)를 이용합니다. 저장된 정보는 접근 권한이 통제되며, 심사위원 간 점수는 서로 공개되지 않습니다.',
  },
  {
    title: '6. 정보주체의 권리',
    body: '정보주체는 언제든지 개인정보 열람·정정·삭제·처리정지를 요청할 수 있으며, 아래 연락처로 요청하시면 지체 없이 조치합니다.',
  },
  {
    title: '7. 안전성 확보 조치',
    body: '전 구간 암호화 통신(HTTPS), 역할별 접근 통제(데이터베이스 행 단위 보안), 민감정보 암호화 저장, 점수 수정·열람 감사기록을 적용합니다.',
  },
  {
    title: '8. 문의처',
    body: '(주)인트윈 운영사무국 · 070-5227-4304',
  },
]

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Link href="/" className="text-xl font-black tracking-tight text-primary">INTWEEN</Link>
        <h1 className="mt-6 text-3xl font-bold">개인정보처리방침</h1>
        <p className="mt-2 text-muted">(주)인트윈은 INTWEEN 심사 관리 플랫폼 이용자의 개인정보를 「개인정보 보호법」에 따라 아래와 같이 처리합니다.</p>
        <div className="mt-8 grid gap-6 rounded-lg border border-line bg-card p-6 leading-relaxed sm:p-8">
          {SECTIONS.map(s => (
            <section key={s.title}>
              <h2 className="mb-2 text-lg font-bold">{s.title}</h2>
              <div className="text-fg/80">{s.body}</div>
            </section>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted">시행일: 2026년 10월 11일</p>
      </div>
    </div>
  )
}
