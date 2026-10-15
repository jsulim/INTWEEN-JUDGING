import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { EventConfig } from '@/lib/events/types'

// 대회별 소개 페이지 공통 틀: 메인 / 일정·타임테이블 / 참가팀 / 하단 운영사무국.
// 색은 config.theme 을 CSS 변수로 내려 대회마다 포스터 키비주얼에 맞춘다.
// showLogin=false 인 일반용 링크에서는 로그인 버튼을 감춘다 (권한은 로그인 후 역할로 구분).

const NAV = [
  { href: '#about', label: '대회 소개' },
  { href: '#schedule', label: '일정' },
  { href: '#timetable', label: '타임테이블' },
  { href: '#teams', label: '참가팀' },
  { href: '#contact', label: '문의' },
]

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-bold tracking-widest text-[var(--ev-primary)]">{children}</p>
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[var(--ev-primary)] px-4 py-1.5 text-sm font-bold text-white">
      {children}
    </span>
  )
}

export default function EventLanding({ config: c, showLogin }: { config: EventConfig; showLogin: boolean }) {
  const vars = {
    '--ev-primary': c.theme.primary,
    '--ev-deep': c.theme.deep,
    '--ev-soft': c.theme.soft,
    '--ev-tint': c.theme.tint,
  } as CSSProperties

  return (
    <div style={vars} className="min-h-screen bg-white text-[#16131F]">
      {/* 상단 메뉴 */}
      <header className="sticky top-0 z-30 border-b border-black/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#top" className="truncate text-base font-black tracking-tight sm:text-lg">
            {c.year} {c.region} <span className="text-[var(--ev-primary)]">{c.name}</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm font-medium lg:flex">
            {NAV.map(n => (
              <a key={n.href} href={n.href} className="text-black/55 hover:text-black">{n.label}</a>
            ))}
          </nav>
          {showLogin && (
            <Link
              href="/home"
              className="inline-flex h-9 shrink-0 items-center rounded-md bg-[var(--ev-primary)] px-4 text-sm font-semibold text-white hover:opacity-90"
            >
              심사위원·관리자 로그인
            </Link>
          )}
        </div>
      </header>

      {/* 메인 */}
      <section id="top" className="relative overflow-hidden bg-gradient-to-b from-[var(--ev-soft)] to-[var(--ev-tint)]">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[var(--ev-primary)] opacity-15 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="flex items-center gap-4">
              <span className="text-4xl font-black sm:text-5xl">{c.year}</span>
              <span className="h-px flex-1 bg-black/70" />
              <span className="h-3 w-3 rounded-full border-2 border-black/70" />
            </div>
            <h1 className="mt-4 text-5xl font-black leading-[1.1] tracking-tight sm:text-7xl">
              {c.region}
              <br />
              <span className="text-[var(--ev-primary)]">{c.name}</span>
              <br />
              <span className="text-4xl sm:text-6xl">{c.stageLabel}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-black/65">{c.summary}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#teams"
                className="inline-flex h-12 items-center rounded-md bg-[var(--ev-primary)] px-7 font-semibold text-white hover:opacity-90"
              >
                참가팀 보기
              </a>
              <a
                href="#timetable"
                className="inline-flex h-12 items-center rounded-md border border-[var(--ev-primary)] bg-white/60 px-7 font-semibold text-[var(--ev-primary)] hover:bg-white"
              >
                타임테이블
              </a>
            </div>
          </div>
          {c.poster && (
            <div className="mx-auto w-full max-w-sm overflow-hidden rounded-xl shadow-2xl shadow-[var(--ev-deep)]/20 ring-1 ring-black/5">
              <Image src={c.poster} alt={`${c.title} 포스터`} width={1420} height={2000} priority className="h-auto w-full" />
            </div>
          )}
        </div>

        {/* 핵심 정보 띠 */}
        <div className="relative bg-[var(--ev-deep)] text-white">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-y-6 px-4 py-8 sm:px-6 lg:grid-cols-4">
            {c.keyFacts.map(f => (
              <div key={f.label} className="text-center">
                <dt className="text-sm text-white/60">{f.label}</dt>
                <dd className="mt-1 text-xl font-black sm:text-2xl">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 대회 소개 */}
      <section id="about" className="scroll-mt-16">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <Eyebrow>ABOUT</Eyebrow>
            <h2 className="mt-3 text-3xl font-black leading-snug sm:text-4xl">대회 소개</h2>
            <p className="mt-6 leading-relaxed text-black/65">{c.about.topic}</p>
            <p className="mt-3 text-sm text-black/50">{c.about.resources}</p>
            <dl className="mt-8 space-y-2 text-sm">
              {c.hosts.map(h => (
                <div key={h.role} className="flex gap-4">
                  <dt className="w-10 shrink-0 font-bold text-[var(--ev-primary)]">{h.role}</dt>
                  <dd>{h.name}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="rounded-xl bg-[var(--ev-tint)] p-7">
            <div className="font-bold">7대 분야 비즈니스 모델</div>
            <ol className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {c.about.fields.map((f, i) => (
                <li key={f} className="flex items-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-semibold">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--ev-primary)] text-xs text-white">
                    {i + 1}
                  </span>
                  {f}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* 일정 */}
      <section id="schedule" className="scroll-mt-16 bg-[var(--ev-tint)]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <Eyebrow>SCHEDULE</Eyebrow>
          <h2 className="mt-3 text-3xl font-black sm:text-4xl">추진 일정</h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {c.schedule.map(s => (
              <li
                key={s.label}
                className={`overflow-hidden rounded-2xl border-2 bg-white text-center ${s.highlight ? 'border-[var(--ev-primary)]' : 'border-[var(--ev-soft)]'}`}
              >
                <div className={`px-3 py-3 text-sm font-bold ${s.highlight ? 'bg-[var(--ev-primary)] text-white' : 'bg-[var(--ev-soft)] text-[var(--ev-deep)]'}`}>
                  {s.label}
                </div>
                <div className="px-3 py-4">
                  <div className="text-lg font-black">{s.date}</div>
                  <div className="mt-1 text-xs leading-relaxed text-black/55">{s.desc}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 타임테이블 · 심사 */}
      <section id="timetable" className="scroll-mt-16">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <Eyebrow>TIMETABLE</Eyebrow>
            <h2 className="mt-3 text-3xl font-black sm:text-4xl">{c.timetable.title}</h2>
            <ul className="mt-8 divide-y divide-black/10 border-y border-black/10">
              {c.timetable.rows.map(r => (
                <li key={r.time} className="flex gap-6 py-5">
                  <span className="w-14 shrink-0 font-black tabular-nums text-[var(--ev-primary)]">{r.time}</span>
                  <div>
                    <div className="font-bold">{r.item}</div>
                    {r.desc && <div className="mt-1 text-sm text-black/55">{r.desc}</div>}
                  </div>
                </li>
              ))}
            </ul>
            {c.timetable.note && <p className="mt-4 text-sm text-black/50">※ {c.timetable.note}</p>}
          </div>
          <div className="space-y-6">
            <div className="rounded-xl bg-[var(--ev-tint)] p-7">
              <Pill>심사 기준</Pill>
              <ul className="mt-5 space-y-4">
                {c.criteria.map(cr => (
                  <li key={cr.name}>
                    <div className="flex items-baseline justify-between gap-2 font-bold text-[var(--ev-deep)]">
                      {cr.name}{cr.score != null && <span className="text-sm text-[var(--ev-primary)]">{cr.score}점</span>}
                    </div>
                    <ul className="mt-1 space-y-0.5 text-sm text-black/60">
                      {cr.points.map(p => <li key={p}>· {p}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
            <dl className="space-y-3 text-sm">
              {c.judgingRules.map(r => (
                <div key={r.label} className="flex gap-4">
                  <dt className="w-16 shrink-0 font-bold text-[var(--ev-primary)]">{r.label}</dt>
                  <dd className="text-black/70">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* 시상 */}
      <section className="bg-[var(--ev-deep)] text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="text-sm font-bold tracking-widest text-white/60">AWARDS</p>
          <h2 className="mt-3 text-3xl font-black">시상 내역</h2>
          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {c.awards.map((a, i) => (
              <div key={a.name} className={`rounded-xl p-6 ${i === 0 ? 'bg-white text-[var(--ev-deep)]' : 'bg-white/10'}`}>
                <div className="text-sm font-bold opacity-70">{a.name} · {a.count}</div>
                <div className="mt-2 text-3xl font-black">{a.prize}</div>
              </div>
            ))}
          </div>
          {c.awardsNote && <p className="mt-5 text-sm text-white/60">※ {c.awardsNote}</p>}
        </div>
      </section>

      {/* 참가팀 */}
      <section id="teams" className="scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>TEAMS</Eyebrow>
              <h2 className="mt-3 text-3xl font-black sm:text-4xl">
                본선 진출팀 <span className="text-[var(--ev-primary)]">{c.teams.length}</span>
              </h2>
            </div>
            {c.teamsNote && <p className="text-sm text-black/50">※ {c.teamsNote}</p>}
          </div>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {c.teams.map(t => (
              <li key={t.team} className="flex flex-col rounded-xl border border-black/10 p-6 transition-shadow hover:shadow-lg">
                <div className="text-sm font-bold text-[var(--ev-primary)]">{t.team}</div>
                <div className="mt-1 text-lg font-black leading-snug">{t.idea}</div>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-black/60">{t.summary}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {t.fields.map(f => (
                    <span key={f} className="rounded-full bg-[var(--ev-tint)] px-2.5 py-1 text-xs font-semibold text-[var(--ev-deep)]">
                      {f}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 운영사무국 */}
      <footer id="contact" className="scroll-mt-16 bg-[#16131F] text-white/70">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-2">
          <div>
            <div className="text-lg font-black text-white">{c.title}</div>
            <div className="mt-3 space-y-1 text-sm">
              {c.hosts.map(h => (
                <div key={h.role}>
                  <span className="mr-2 text-white/40">{h.role}</span>
                  {h.name}
                </div>
              ))}
            </div>
          </div>
          <div className="text-sm md:text-right">
            <div className="font-bold text-white">{c.office.name}</div>
            <div className="mt-3 space-y-1">
              <div>
                <a href={`tel:${c.office.phone}`} className="hover:text-white">{c.office.phone}</a>
                <span className="mx-2 text-white/30">|</span>
                <a href={`mailto:${c.office.email}`} className="hover:text-white">{c.office.email}</a>
              </div>
              {c.office.hours && <div>운영시간 {c.office.hours}</div>}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
