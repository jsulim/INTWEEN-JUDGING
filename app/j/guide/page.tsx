import Link from 'next/link'
import { PageHeader } from '@/components/ui'

// 심사위원 이용 안내 — 동의서 서명 전에도 볼 수 있다 (app/j/(signed) 밖).
// 처음 쓰는 분·고령 심사위원 기준으로 큰 글씨, 화면 버튼 이름 그대로 적는다.

const STEPS: { title: string; items: React.ReactNode[] }[] = [
  {
    title: '로그인',
    items: [
      '운영사무국에서 받은 이메일 주소와 비밀번호를 입력하고 「로그인」을 누릅니다.',
      '30분 동안 아무 동작이 없으면 자동으로 로그아웃됩니다. 다시 로그인하면 입력한 점수는 그대로 남아 있습니다.',
    ],
  },
  {
    title: '동의서 서명 (처음 한 번)',
    items: [
      '처음 로그인하면 「동의서 서명」 화면이 열립니다.',
      '동의서 문구를 마우스 휠로 끝까지 내려 읽습니다. 끝까지 읽어야 서명할 수 있습니다.',
      '이해충돌 확인서에서는 「이해관계 없음」 또는 「이해관계 있음」을 고릅니다.',
      '서명칸에 마우스를 누른 채 움직여 이름을 쓰고 「동의하고 서명」을 누릅니다.',
      '모든 동의서에 「서명 완료」가 표시되면 「평가 시작」을 누릅니다.',
    ],
  },
  {
    title: '평가할 팀 고르기',
    items: [
      '로그인하면 대시보드에 발표 순서대로 팀 목록이 바로 보입니다.',
      '평가할 팀의 「평가」를 누릅니다.',
    ],
  },
  {
    title: '자료 보면서 점수 입력',
    items: [
      '왼쪽에 발표자료, 오른쪽에 점수표가 있습니다. 「확대」·「축소」로 글씨 크기를 바꿀 수 있습니다.',
      '항목마다 배점 안에서 점수를 숫자로 입력합니다. 배점을 넘는 점수는 입력되지 않습니다.',
      <>맨 아래 <b>종합 심사평</b>을 꼭 적어 주세요. 비어 있으면 평가가 완료되지 않습니다.</>,
      <>입력하면 <b>자동으로 저장</b>됩니다. 점수표 위에 「자동 저장됨」이 보이면 저장된 것입니다. 따로 저장 버튼은 없습니다.</>,
      '「다음 →」을 누르면 다음 발표 팀으로 넘어갑니다.',
    ],
  },
  {
    title: '점수 고치기',
    items: [
      '최종 제출 전에는 언제든 다시 들어가 점수와 심사평을 고칠 수 있습니다.',
      '최종 제출 후에 고쳐야 하면 현장 운영 요원에게 말씀해 주세요.',
    ],
  },
  {
    title: '최종 제출과 서명',
    items: [
      '모든 팀의 평가가 「완료」가 되면 대시보드의 「최종 제출」을 누릅니다.',
      '점수 내용을 확인하고, 확인란을 선택한 뒤 서명칸에 서명합니다.',
      '「서명하고 최종 제출」을 누르면 끝입니다. 서명한 평가표는 운영사무국에 바로 전달됩니다.',
    ],
  },
]

const TROUBLE = [
  { q: '「오프라인 · 입력 임시 보관 중」이 보여요', a: '인터넷 연결이 잠시 끊긴 상태입니다. 창을 닫지 마세요. 연결되면 자동으로 다시 저장됩니다.' },
  { q: '「저장하지 못했습니다」가 보여요', a: '창을 닫지 말고 운영 요원을 불러 주세요.' },
  { q: '발표자료가 안 보여요', a: '「다시 시도」를 누르고, 그래도 안 되면 운영 요원을 불러 주세요.' },
  { q: '평가할 팀과 이해관계가 있어요', a: '점수표 아래 「이해관계 있음 신고」를 누르고 내용을 적으면 그 팀 평가에서 빠집니다.' },
  { q: '다른 심사위원 점수가 보이나요?', a: '보이지 않습니다. 점수는 본인과 운영사무국만 볼 수 있습니다.' },
]

export default function JudgeGuidePage() {
  return (
    <div className="mx-auto max-w-3xl text-[17px] leading-relaxed">
      <PageHeader title="이용 안내" description="심사 플랫폼 사용 방법입니다. 어려운 점이 있으면 언제든 현장 운영 요원에게 말씀해 주세요." />
      <ol className="grid gap-5">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-lg border border-line bg-card p-6">
            <h2 className="flex items-center gap-3 text-xl font-bold">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-base text-primary-fg">{i + 1}</span>
              {s.title}
            </h2>
            <ul className="mt-4 grid gap-2.5 pl-1">
              {s.items.map((it, k) => (
                <li key={k} className="flex gap-3">
                  <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <section className="mt-8 rounded-lg border border-line bg-card p-6">
        <h2 className="text-xl font-bold">이럴 땐 이렇게</h2>
        <dl className="mt-4 grid gap-4">
          {TROUBLE.map(t => (
            <div key={t.q}>
              <dt className="font-bold">Q. {t.q}</dt>
              <dd className="mt-1 text-muted">{t.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-8 text-center">
        <Link href="/j" className="inline-flex h-12 items-center rounded-md bg-primary px-8 font-semibold text-primary-fg hover:bg-primary/90">
          대시보드로 가기
        </Link>
      </div>
    </div>
  )
}
