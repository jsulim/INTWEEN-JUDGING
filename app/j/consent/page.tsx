import { Alert, Badge, Card, Empty, LinkButton, PageHeader } from '@/components/ui'
import { SignedPdfLink } from '@/components/judge/SignedPdfLink'
import { requireRole } from '@/lib/server/auth'
import { fmtDate } from '@/lib/format'
import type { Consent, ConsentTemplate, Judge } from '@/lib/types'
import ConsentSigner from './ConsentSigner'

export const dynamic = 'force-dynamic'

const KIND_ORDER: Record<string, number> = { privacy: 0, security: 1, conflict: 2, payment: 3 }
const KIND_LABEL: Record<string, string> = { privacy: '개인정보', security: '보안서약', conflict: '이해충돌', payment: '수당 지급' }

// J-01 동의서 서명: 문구 전체 스크롤 후 서명 패드 활성화, 서명 → PDF·해시 (8-3). 미서명 시 J-02 이하 차단(Q3)
export default async function ConsentPage() {
  const { supabase, user } = await requireRole('judge')
  const { data: judgeRows } = await supabase.from('judges').select('*, programs(title)').eq('user_id', user.id)
  const judges = (judgeRows ?? []) as (Judge & { programs: { title: string } | null })[]

  if (!judges.length) {
    return (
      <>
        <PageHeader title="동의서 서명" />
        <Empty>배정된 프로그램이 없습니다.</Empty>
      </>
    )
  }

  // RLS judge_read: 소속 프로그램의 활성 양식만 / 본인 서명 기록만
  const [{ data: tpls }, { data: cons }] = await Promise.all([
    supabase.from('consent_templates').select('*').in('program_id', judges.map(j => j.program_id)),
    supabase.from('consents').select('*').in('judge_id', judges.map(j => j.id)),
  ])
  const templates = ((tpls ?? []) as ConsentTemplate[]).sort((a, b) =>
    (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a.title.localeCompare(b.title, 'ko'))
  const consents = (cons ?? []) as Consent[]
  const activeIds = new Set(templates.map(t => t.id))

  const groups = judges.map(j => {
    const list = templates.filter(t => t.program_id === j.program_id)
    const signed = new Map(consents.filter(c => c.judge_id === j.id).map(c => [c.template_id, c]))
    const pendingRequired = list.filter(t => t.required && !signed.has(t.id)).length
    // 비활성(이전 버전) 양식에 대한 서명이 있으면 개정으로 인한 재서명
    const revised = consents.some(c => c.judge_id === j.id && !activeIds.has(c.template_id)) && list.some(t => !signed.has(t.id))
    return { judge: j, list, signed, pendingRequired, revised }
  })
  const allDone = groups.every(g => g.pendingRequired === 0)

  return (
    <>
      <PageHeader title="동의서 서명" description="문구를 끝까지 읽은 뒤 서명할 수 있습니다. 서명본은 수정할 수 없습니다." />
      {allDone ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/10 px-5 py-4">
          <div className="font-semibold text-accent">필수 동의서 서명 완료</div>
          <LinkButton href="/j">평가 시작</LinkButton>
        </div>
      ) : (
        <div className="mb-6">
          <Alert tone="highlight">필수 동의서를 모두 서명해야 배정 기업 자료를 열람하고 평가할 수 있습니다.</Alert>
        </div>
      )}

      <div className="grid gap-8">
        {groups.map(({ judge, list, signed, pendingRequired, revised }) => (
          <section key={judge.id}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">{judge.programs?.title}</h2>
              {pendingRequired > 0
                ? <Badge tone="highlight">미서명 {pendingRequired}건</Badge>
                : <Badge tone="accent">서명 완료</Badge>}
            </div>
            {revised && <div className="mb-3"><Alert tone="highlight">동의서 양식이 개정되었습니다. 새 버전에 다시 서명하세요.</Alert></div>}
            {list.length === 0 && <Empty>등록된 동의서가 없습니다.</Empty>}
            <div className="grid gap-4">
              {list.map(t => {
                const c = signed.get(t.id)
                const head = (
                  <span className="flex flex-wrap items-center gap-2">
                    {t.title}
                    <Badge>{KIND_LABEL[t.kind] ?? t.kind}</Badge>
                    <span className="tabular text-xs font-normal text-muted">v{t.version}</span>
                    {!t.required && <Badge tone="primary">선택</Badge>}
                  </span>
                )
                if (c) {
                  return (
                    <Card key={t.id} title={head} actions={<Badge tone="accent">서명 완료</Badge>}>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                        <span className="text-muted">서명 일시 <span className="tabular text-fg">{fmtDate(c.signed_at)}</span></span>
                        {c.conflict_declared != null && (
                          <span className="text-muted">이해충돌 <span className="text-fg">{c.conflict_declared ? '이해관계 있음' : '이해관계 없음'}</span></span>
                        )}
                        <span className="tabular text-xs text-muted" title="SHA-256">해시 {c.doc_hash.slice(0, 16)}…</span>
                        <SignedPdfLink path={c.signed_pdf_path} kind="consent" />
                      </div>
                    </Card>
                  )
                }
                return (
                  <Card key={t.id} title={head} actions={t.required ? <Badge tone="highlight">서명 필요</Badge> : undefined}>
                    <ConsentSigner judgeId={judge.id} template={{ id: t.id, kind: t.kind, body: t.body }} />
                  </Card>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
