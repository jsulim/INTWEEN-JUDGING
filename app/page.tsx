import Link from 'next/link'

// 소개(랜딩) 페이지 — 사이트 첫 화면. 내용은 하드코딩, DB 조회 없음.
// 로그인 버튼은 /home 으로 보내고, 미로그인이면 미들웨어가 /login 으로, 로그인 상태면 역할별 홈으로 보낸다.

const NAV = [
  { href: '#about', label: '소개' },
  { href: '#process', label: '심사 절차' },
  { href: '#features', label: '주요 기능' },
  { href: '#roles', label: '이용 안내' },
]

const STATS = [
  { value: '3', unit: '개 역할', label: '기업 · 심사위원 · 사무국' },
  { value: 'N', unit: '단계', label: '서류 · 발표 · 최종까지 자유 구성' },
  { value: '100', unit: '%', label: '블라인드 · 전자서명 · 감사기록' },
  { value: '실시간', unit: '', label: '점수 집계와 순위 반영' },
]

const PROCESS = [
  { step: '01', title: '신청 · 접수', desc: '참가 기업이 신청서를 작성하고 사업계획서·발표자료를 단계별로 제출합니다.' },
  { step: '02', title: '적격 검토', desc: '사무국이 자격요건과 필수서류를 확인하고, 필요하면 기한을 정해 보완을 요청합니다.' },
  { step: '03', title: '서류 · 발표 심사', desc: '심사위원이 동의서 서명 후 배정된 기업의 자료를 열람하고 항목별로 평가합니다.' },
  { step: '04', title: '점수 확정', desc: '과락·가감점·동점 기준을 반영해 순위를 확정하고 결과를 잠급니다.' },
  { step: '05', title: '결과 공개', desc: '통과 기업은 다음 단계로 이관되고, 기업은 플랫폼에서 결과를 확인합니다.' },
]

const FEATURES = [
  { title: '블라인드 심사', desc: '서류심사 단계에서 기업명·대표자명을 코드로 가려 공정하게 평가합니다. 심사위원끼리는 서로의 점수를 볼 수 없습니다.' },
  { title: '평가 루브릭 · 과락 기준', desc: '항목별 점수 구간 설명을 평가표 옆에 띄워 심사위원 간 기준 차이를 줄이고, 최저점 미달은 자동으로 과락 처리합니다.' },
  { title: '전자 동의서 서명', desc: '개인정보 동의·보안서약·이해충돌 확인을 화면에서 손서명하고, 서명본은 위·변조 확인이 가능한 PDF로 보관합니다.' },
  { title: '실시간 집계 · 편차 경고', desc: '점수가 입력되는 즉시 순위가 갱신되고, 같은 기업에 대한 심사위원 간 점수 차이가 크면 사무국에 알립니다.' },
  { title: '발표 현장 모드', desc: '발표 순서 추첨, 발표·질의 타이머, 현재 발표 기업 자동 전환으로 현장 심사를 태블릿 하나로 진행합니다.' },
  { title: '감사기록 · 증빙 패키지', desc: '모든 점수 수정 이력이 남고, 평가표 원본·서명본·심사평을 ZIP 하나로 내려받아 발주처에 제출할 수 있습니다.' },
]

const ROLES = [
  {
    who: '참가 기업',
    items: ['신청서 작성과 자격요건 자가 체크', '단계별 사업계획서 · 발표자료 업로드', '마감 일정과 제출 상태 확인', '공개된 심사 결과 확인'],
  },
  {
    who: '심사위원',
    items: ['동의서 · 보안서약 전자 서명', '배정 기업 자료 열람 (워터마크 뷰어)', '항목별 점수 · 심사평 자동 저장', '평가표 최종 제출 및 서명'],
  },
  {
    who: '운영 사무국',
    items: ['프로그램 · 단계 · 평가항목 설정', '기업 · 심사위원 초대와 배정', '실시간 대시보드로 진행 현황 확인', '결과 확정 · 엑셀 · 증빙 내보내기'],
  },
]

function LoginButton({ className = '', children = '로그인' }: { className?: string; children?: React.ReactNode }) {
  return (
    <Link
      href="/home"
      className={`inline-flex items-center justify-center rounded-md font-semibold transition-colors ${className}`}
    >
      {children}
    </Link>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-card text-fg">
      {/* 상단 메뉴 */}
      <header className="sticky top-0 z-30 border-b border-line bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-xl font-black tracking-tight text-primary">INTWEEN</span>
            <span className="hidden text-sm text-muted sm:inline">심사 관리 플랫폼</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
            {NAV.map(n => (
              <a key={n.href} href={n.href} className="text-muted hover:text-fg">{n.label}</a>
            ))}
          </nav>
          <LoginButton className="h-9 bg-primary px-4 text-sm text-primary-fg hover:bg-primary/90" />
        </div>
      </header>

      {/* 히어로 */}
      <section className="relative overflow-hidden bg-[#1F2A25] text-white">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-primary/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 -left-32 h-[420px] w-[420px] rounded-full bg-accent/25 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
          <p className="mb-5 inline-block rounded-full border border-white/20 px-4 py-1 text-sm text-white/80">
            해커톤 · 지원사업 · 경진대회 심사 통합 운영
          </p>
          <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-6xl">
            접수부터 심사, 결과 공개까지<br />
            <span className="text-highlight">한 곳에서.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/75">
            INTWEEN 심사 관리 플랫폼은 참가 기업의 자료 제출, 심사위원의 서명·평가, 사무국의 실시간 집계와 결과 확정을
            하나의 흐름으로 연결합니다.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <LoginButton className="h-12 bg-highlight px-7 text-base text-[#1F2A25] hover:bg-highlight/90">
              플랫폼 로그인
            </LoginButton>
            <a
              href="#process"
              className="inline-flex h-12 items-center justify-center rounded-md border border-white/30 px-7 text-base font-semibold text-white hover:bg-white/10"
            >
              심사 절차 보기
            </a>
          </div>
        </div>
      </section>

      {/* 숫자 강조 띠 */}
      <section className="border-b border-line bg-bg">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-4 py-12 sm:px-6 lg:grid-cols-4">
          {STATS.map(s => (
            <div key={s.label} className="text-center">
              <div className="text-3xl font-black text-primary sm:text-4xl">
                {s.value}
                <span className="ml-0.5 text-xl font-bold">{s.unit}</span>
              </div>
              <div className="mt-2 text-sm text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 소개 */}
      <section id="about" className="scroll-mt-16">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-bold tracking-widest text-accent">ABOUT</p>
            <h2 className="mt-3 text-3xl font-black leading-snug sm:text-4xl">
              공정하고 투명한 심사,<br />운영은 더 가볍게.
            </h2>
          </div>
          <div className="space-y-5 text-base leading-relaxed text-muted">
            <p>
              메일로 파일을 주고받고, 엑셀로 점수를 모으고, 종이 서약서를 스캔하던 심사 운영을 하나의 플랫폼으로 옮겼습니다.
            </p>
            <p>
              하나의 프로그램에 서류심사·발표심사 등 필요한 만큼 단계를 두고, 단계마다 평가항목과 배점을 따로 정할 수 있습니다.
              점수와 심사평은 마감 전까지 수정할 수 있고, 확정하면 잠기며 모든 변경은 기록으로 남습니다.
            </p>
          </div>
        </div>
      </section>

      {/* 심사 절차 */}
      <section id="process" className="scroll-mt-16 bg-bg">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <p className="text-sm font-bold tracking-widest text-accent">PROCESS</p>
          <h2 className="mt-3 text-3xl font-black sm:text-4xl">심사 절차</h2>
          <ol className="mt-12 grid gap-4 md:grid-cols-5">
            {PROCESS.map((p, i) => (
              <li key={p.step} className="relative rounded-lg border border-line bg-card p-6">
                <div className="text-sm font-black text-highlight">STEP {p.step}</div>
                <div className="mt-2 text-lg font-bold">{p.title}</div>
                <p className="mt-3 text-sm leading-relaxed text-muted">{p.desc}</p>
                {i < PROCESS.length - 1 && (
                  <span className="absolute -right-3 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-xs text-white md:flex">
                    →
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 주요 기능 */}
      <section id="features" className="scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <p className="text-sm font-bold tracking-widest text-accent">FEATURES</p>
          <h2 className="mt-3 text-3xl font-black sm:text-4xl">주요 기능</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="rounded-lg border border-line p-7 transition-shadow hover:shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-sm font-black text-primary">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <h3 className="mt-5 text-lg font-bold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 이용 안내 */}
      <section id="roles" className="scroll-mt-16 bg-bg">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <p className="text-sm font-bold tracking-widest text-accent">FOR YOU</p>
          <h2 className="mt-3 text-3xl font-black sm:text-4xl">이용 안내</h2>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {ROLES.map(r => (
              <div key={r.who} className="overflow-hidden rounded-lg border border-line bg-card">
                <div className="bg-primary px-7 py-5 text-lg font-bold text-primary-fg">{r.who}</div>
                <ul className="space-y-3 px-7 py-6 text-sm">
                  {r.items.map(it => (
                    <li key={it} className="flex gap-3">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 로그인 안내 */}
      <section className="bg-primary text-primary-fg">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">초대 메일을 받으셨나요?</h2>
            <p className="mt-2 text-primary-fg/80">
              계정은 운영 사무국의 초대로 발급됩니다. 메일의 링크로 비밀번호를 설정한 뒤 로그인하세요.
            </p>
          </div>
          <LoginButton className="h-12 shrink-0 bg-white px-8 text-base text-primary hover:bg-white/90">
            로그인하기
          </LoginButton>
        </div>
      </section>

      {/* 하단 정보 */}
      <footer className="bg-[#1F2A25] text-sm text-white/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-base font-black text-white">INTWEEN</div>
            <div className="mt-1">심사 관리 플랫폼 · 운영 문의는 프로그램 운영 사무국으로 연락해 주세요.</div>
          </div>
          <div>© 2026 INTWEEN. All rights reserved.</div>
        </div>
      </footer>
    </div>
  )
}
