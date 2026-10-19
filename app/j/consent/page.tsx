import { Alert, Badge, Card, Empty, LinkButton, PageHeader } from '@/components/ui'
import { SignedPdfLink } from '@/components/judge/SignedPdfLink'
import { requireRole } from '@/lib/server/auth'
import { fmtDate } from '@/lib/format'
import type { Consent, ConsentTemplate, Judge } from '@/lib/types'
import { supabaseAdmin } from '@/lib/supabase/server'
import ConsentSigner, { type ConflictCompany } from './ConsentSigner'
import WithdrawButton from './WithdrawButton'

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
  const consents = (cons ?? []) as (Consent & { conflict_company_ids?: string[] | null })[]

  // 이해충돌 확인서용 기업 목록: 배정 전에도 고를 수 있게 프로그램에 등록된 기업 전체 (이름·코드만)
  const conflictPrograms = [...new Set(templates.filter(t => t.kind === 'conflict').map(t => t.program_id))]
  const { data: compRows } = conflictPrograms.length
    ? await supabaseAdmin().from('companies').select('id, program_id, name, blind_code').in('program_id', conflictPrograms)
    : { data: [] }
  const companiesOf = (programId: string): ConflictCompany[] => (compRows ?? [])
    .filter(c => c.program_id === programId)
    .map(c => ({ id: c.id as string, name: c.name as string, code: (c.blind_code as string | null) ?? null }))
    .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '', 'ko') || a.name.localeCompare(b.name, 'ko'))
  const companyName = new Map((compRows ?? []).map(c => [c.id as string, c.name as string]))
  const activeIds = new Set(templates.map(t => t.id))

  const groups = judges.map(j => {
    const list = templates.filter(t => t.program_id === j.program_id)
    const signed = new Map(consents.filter(c => c.judge_id === j.id).map(c => [c.template_id, c]))
    const pendingRequired = list.filter(t => t.required && !signed.has(t.id)).length
    // 필수 양식이 아직 없으면 서명 완료로 보지 않는다 (DB has_signed_all 과 동일 기준)
    const notReady = !list.some(t => t.required)
    // 비활성(이전 버전) 양식에 대한 서명이 있으면 개정으로 인한 재서명
    const revised = consents.some(c => c.judge_id === j.id && !activeIds.has(c.template_id)) && list.some(t => !signed.has(t.id))
    return { judge: j, list, signed, pendingRequired, notReady, revised }
  })
  const allDone = groups.every(g => g.pendingRequired === 0 && !g.notReady)
  const anyNotReady = groups.some(g => g.notReady)

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
          <Alert tone="highlight">
            필수 동의서를 모두 서명해야 배정 기업 자료를 열람하고 평가할 수 있습니다.
            {anyNotReady && ' 동의서가 아직 준비되지 않은 프로그램이 있습니다. 관리자가 등록하면 서명할 수 있습니다.'}
          </Alert>
        </div>
      )}

      <div className="grid gap-8">
        {groups.map(({ judge, list, signed, pendingRequired, notReady, revised }) => (
          <section key={judge.id}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">{judge.programs?.title}</h2>
              {notReady
                ? <Badge tone="highlight">동의서 준비 중</Badge>
                : pendingRequired > 0
                  ? <Badge tone="highlight">미서명 {pendingRequired}건</Badge>
                  : <Badge tone="accent">서명 완료</Badge>}
            </div>
            {revised && <div className="mb-3"><Alert tone="highlight">동의서 양식이 개정되었습니다. 새 버전에 다시 서명하세요.</Alert></div>}
            {notReady && <Empty>관리자가 아직 필수 동의서를 등록하지 않았습니다. 등록되면 여기서 서명한 뒤 평가할 수 있습니다.</Empty>}
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
                        <SignedPdfLink path={c.signed_pdf_path} kind="consent">서명본 PDF 보기 (서명 포함)</SignedPdfLink>
                        <span className="ml-auto"><WithdrawButton consentId={c.id} required={t.required} /></span>
                      </div>
                      {c.conflict_declared && !!c.conflict_company_ids?.length && (
                        <p className="mt-2 text-sm text-muted">평가 제외 기업 <span className="font-semibold text-danger">{c.conflict_company_ids.map(id => companyName.get(id) ?? '(삭제된 기업)').join(', ')}</span></p>
                      )}
                      {c.conflict_declared && c.conflict_note && (
                        <p className="mt-2 text-sm text-muted">신고 내용 <span className="whitespace-pre-wrap text-fg">{c.conflict_note}</span></p>
                      )}
                      <details className="group mt-3">
                        <summary className="cursor-pointer select-none text-sm font-semibold text-primary">
                          <span className="group-open:hidden">동의서 내용 보기</span><span className="hidden group-open:inline">동의서 내용 접기</span>
                        </summary>
                        <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-bg px-4 py-3 text-sm leading-relaxed">
                          {t.body}
                        </div>
                      </details>
                    </Card>
                  )
                }
                return (
                  <Card key={t.id} title={head} actions={t.required ? <Badge tone="highlight">서명 필요</Badge> : undefined}>
                    <ConsentSigner judgeId={judge.id} template={{ id: t.id, kind: t.kind, body: t.body }}
                      companies={t.kind === 'conflict' ? companiesOf(judge.program_id) : undefined} />
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
