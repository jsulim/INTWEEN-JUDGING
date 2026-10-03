import Link from 'next/link'
import { Badge, Button, Card, Empty, Input, PageHeader, Select, Table, cn } from '@/components/ui'
import { requireRole } from '@/lib/server/auth'
import { diffKeys, type AuditViewRow } from '@/lib/server/export'
import { fmtDate } from '@/lib/format'

export const dynamic = 'force-dynamic'

const PAGE = 50
const TABLES = ['scores', 'reviews', 'criteria', 'assignments', 'stages', 'stage_results', 'stage_entries', 'evaluation_submissions',
  'consents', 'consent_templates', 'companies', 'submissions', 'judges', 'programs', 'entry_bonuses', 'bonus_rules', 'eligibility_checks',
  'presentation_slots', 'appeals', 'judge_payments', 'chair_reviews', 'profiles']
const TABLE_LABEL: Record<string, string> = {
  scores: '점수', reviews: '심사평', criteria: '평가항목', assignments: '배정', stages: '단계', stage_results: '확정 결과', stage_entries: '단계 참가',
  evaluation_submissions: '평가표 제출', consents: '동의서 서명', consent_templates: '동의서 양식', companies: '기업', submissions: '제출 파일',
  judges: '심사위원', programs: '프로그램', entry_bonuses: '가점 신청', bonus_rules: '가점 규칙', eligibility_checks: '적격 검토',
  presentation_slots: '발표 순서', appeals: '이의신청', judge_payments: '정산', chair_reviews: '위원장 의견', profiles: '프로필',
}
const ACTIONS = ['insert', 'update', 'delete', 'login', 'view', 'export', 'eval.reopen', 'stage.lock', 'stage.unlock', 'stage.status',
  'stage.advance', 'presentation.draw', 'presentation.state', 'presentation.notify', 'appeal.decide']
const ACTION_LABEL: Record<string, string> = { insert: '생성', update: '수정', delete: '삭제', login: '로그인', view: '열람', export: '내보내기' }
const ACTION_TONE: Record<string, 'neutral' | 'primary' | 'accent' | 'highlight' | 'danger'> = {
  insert: 'accent', update: 'primary', delete: 'danger', login: 'neutral', view: 'highlight', export: 'highlight',
}

type SP = { tab?: string; table?: string; action?: string; actor?: string; from?: string; to?: string; program?: string; page?: string }

const show = (v: unknown) => {
  if (v === null || v === undefined || v === '') return '∅'
  if (typeof v === 'string') return v.length > 80 ? v.slice(0, 80) + '…' : v
  const s = JSON.stringify(v)
  return s.length > 80 ? s.slice(0, 80) + '…' : s
}
const kstStart = (d: string) => new Date(`${d}T00:00:00+09:00`).toISOString()
const kstEnd = (d: string) => new Date(new Date(`${d}T00:00:00+09:00`).getTime() + 86_400_000).toISOString()
const clean = (s: string) => s.replace(/[,()%*\\]/g, ' ').trim()

// A-11 감사로그: 점수 수정 이력(이전→새 값), 로그인·열람 기록, 파기 대장
export default async function AuditPage({ searchParams: sp }: { searchParams: SP }) {
  const { supabase } = await requireRole('admin')
  const tab = sp.tab === 'disposal' ? 'disposal' : 'logs'
  const page = Math.max(1, Number(sp.page) || 1)
  const { data: programs } = await supabase.from('programs').select('id, title').order('created_at', { ascending: false })
  const qs = (patch: Partial<SP>) => {
    const u = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) u.set(k, String(v))
    return `/a/audit?${u.toString()}`
  }

  return (
    <>
      <PageHeader title="감사로그" description="모든 변경은 트리거가 기록합니다 (누가 · 언제 · 이전 값 → 새 값). 로그인·열람·내보내기 기록 포함." />
      <nav className="mb-5 flex gap-1 border-b border-line">
        {[{ k: 'logs', l: '감사로그' }, { k: 'disposal', l: '개인정보 파기 대장' }].map(t => (
          <Link key={t.k} href={t.k === 'logs' ? '/a/audit' : '/a/audit?tab=disposal'}
            className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-semibold', tab === t.k ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-fg')}>
            {t.l}
          </Link>
        ))}
      </nav>
      {tab === 'disposal' ? <Disposal page={page} qs={qs} /> : <Logs sp={sp} page={page} qs={qs} programs={programs ?? []} />}
    </>
  )

  async function Disposal({ page, qs }: { page: number; qs: (p: Partial<SP>) => string }) {
    let q = supabase.from('disposal_logs').select('*', { count: 'exact' }).order('disposed_at', { ascending: false })
    if (sp.program) q = q.eq('program_id', sp.program)
    const { data, count } = await q.range((page - 1) * PAGE, page * PAGE - 1)
    const rows = (data ?? []) as { id: string; program_title: string | null; target: string; disposed_at: string; method: string; operator: string }[]
    return (
      <Card title="파기 대장" actions={<span className="text-sm text-muted">보유기간(프로그램 종료 + 보유 연수) 경과 시 자동 파기</span>}>
        {!rows.length ? <Empty>파기 기록이 없습니다.</Empty> : (
          <Table>
            <thead><tr><th>파기 일시</th><th>프로그램</th><th>파기 대상</th><th>방법</th><th>처리자</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="tabular whitespace-nowrap">{fmtDate(r.disposed_at)}</td>
                  <td>{r.program_title ?? '-'}</td><td>{r.target}</td><td>{r.method}</td><td>{r.operator}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pager page={page} total={count ?? 0} qs={qs} />
      </Card>
    )
  }

  async function Logs({ sp, page, qs, programs }: { sp: SP; page: number; qs: (p: Partial<SP>) => string; programs: { id: string; title: string }[] }) {
    let q = supabase.from('v_audit_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false })
    if (sp.table) q = q.eq('table_name', sp.table)
    if (sp.action) q = q.eq('action', sp.action)
    if (sp.program) q = q.eq('program_id', sp.program)
    if (sp.from) q = q.gte('created_at', kstStart(sp.from))
    if (sp.to) q = q.lt('created_at', kstEnd(sp.to))
    if (sp.actor && clean(sp.actor)) {
      const a = clean(sp.actor)
      q = a.toLowerCase() === 'system' ? q.is('actor_id', null) : q.or(`actor_name.ilike.*${a}*,actor_email.ilike.*${a}*`)
    }
    const { data, count, error } = await q.range((page - 1) * PAGE, page * PAGE - 1)
    const rows = (data ?? []) as AuditViewRow[]
    const ctx = await scoreContext(rows)

    return (
      <div className="grid gap-4">
        <Card>
          <form method="get" action="/a/audit" className="grid gap-3 md:grid-cols-[repeat(6,minmax(0,1fr))_auto]">
            <Select name="program" defaultValue={sp.program ?? ''} aria-label="프로그램">
              <option value="">전체 프로그램</option>
              {programs.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </Select>
            <Select name="table" defaultValue={sp.table ?? ''} aria-label="테이블">
              <option value="">전체 대상</option>
              {TABLES.map(t => <option key={t} value={t}>{TABLE_LABEL[t] ?? t} ({t})</option>)}
            </Select>
            <Input name="action" list="audit-actions" defaultValue={sp.action ?? ''} placeholder="작업 (update, login …)" aria-label="작업" />
            <datalist id="audit-actions">{ACTIONS.map(a => <option key={a} value={a}>{ACTION_LABEL[a] ?? a}</option>)}</datalist>
            <Input name="actor" defaultValue={sp.actor ?? ''} placeholder="작업자 이름·이메일" aria-label="작업자" />
            <Input name="from" type="date" defaultValue={sp.from ?? ''} aria-label="시작일" />
            <Input name="to" type="date" defaultValue={sp.to ?? ''} aria-label="종료일" />
            <div className="flex gap-2"><Button type="submit">조회</Button><Link href="/a/audit" className="self-center text-sm text-muted hover:text-fg">초기화</Link></div>
          </form>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <span className="text-muted">바로가기</span>
            <Link className="text-primary hover:underline" href={`/a/audit?table=scores&action=update${sp.program ? `&program=${sp.program}` : ''}`}>점수 수정 이력</Link>
            <Link className="text-primary hover:underline" href="/a/audit?action=login">로그인 기록</Link>
            <Link className="text-primary hover:underline" href="/a/audit?action=view">열람 기록</Link>
            <Link className="text-primary hover:underline" href="/a/audit?action=export">내보내기 기록</Link>
            <Link className="text-primary hover:underline" href="/a/audit?action=eval.reopen">평가 재오픈</Link>
          </div>
        </Card>

        {error ? <Empty>감사로그를 불러오지 못했습니다: {error.message}</Empty> : !rows.length ? <Empty>조건에 맞는 기록이 없습니다.</Empty> : (
          <Table>
            <thead><tr><th>일시</th><th>작업자</th><th>작업</th><th>대상</th><th>변경 내용 (이전 → 새 값)</th><th>IP</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="align-top">
                  <td className="tabular whitespace-nowrap text-xs">{fmtDate(r.created_at)}</td>
                  <td className="whitespace-nowrap">
                    {r.actor_id ? <><div className="font-semibold">{r.actor_name || '(이름 없음)'}</div><div className="text-xs text-muted">{r.actor_email}</div></> : <span className="text-muted">system</span>}
                  </td>
                  <td><Badge tone={ACTION_TONE[r.action] ?? 'neutral'}>{ACTION_LABEL[r.action] ?? r.action}</Badge></td>
                  <td className="whitespace-nowrap">
                    <div>{r.table_name ? TABLE_LABEL[r.table_name] ?? r.table_name : '-'}</div>
                    {ctx.get(r.id) && <div className="text-xs text-muted">{ctx.get(r.id)}</div>}
                  </td>
                  <td className="max-w-[640px]"><Change row={r} /></td>
                  <td className="tabular text-xs text-muted">{r.ip ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pager page={page} total={count ?? 0} qs={qs} />
      </div>
    )
  }

  /** 점수·심사평 행에 기업·심사위원·항목 이름을 붙인다 */
  async function scoreContext(rows: AuditViewRow[]) {
    const out = new Map<string, string>()
    const target = rows.filter(r => r.table_name === 'scores' || r.table_name === 'reviews')
    if (!target.length) return out
    const data = (r: AuditViewRow) => (r.after ?? r.before ?? {}) as Record<string, string>
    const asgIds = [...new Set(target.map(r => data(r).assignment_id).filter(Boolean))]
    const critIds = [...new Set(target.map(r => data(r).criterion_id).filter(Boolean))]
    const [{ data: asg }, { data: crit }] = await Promise.all([
      asgIds.length ? supabase.from('assignments').select('id, company_id, judge_id').in('id', asgIds) : Promise.resolve({ data: [] as { id: string; company_id: string; judge_id: string }[] }),
      critIds.length ? supabase.from('criteria').select('id, name').in('id', critIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ])
    const as = asg ?? []
    const [{ data: comps }, { data: judges }] = await Promise.all([
      as.length ? supabase.from('companies').select('id, name').in('id', [...new Set(as.map(a => a.company_id))]) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      as.length ? supabase.from('judges').select('id, user_id').in('id', [...new Set(as.map(a => a.judge_id))]) : Promise.resolve({ data: [] as { id: string; user_id: string }[] }),
    ])
    const { data: profs } = judges?.length ? await supabase.from('profiles').select('user_id, name').in('user_id', judges.map(j => j.user_id)) : { data: [] as { user_id: string; name: string }[] }
    const cm = new Map((comps ?? []).map(c => [c.id, c.name]))
    const pm = new Map((profs ?? []).map(p => [p.user_id, p.name]))
    const jm = new Map((judges ?? []).map(j => [j.id, pm.get(j.user_id) ?? '']))
    const am = new Map(as.map(a => [a.id, a]))
    const km = new Map((crit ?? []).map(c => [c.id, c.name]))
    for (const r of target) {
      const d = data(r)
      const a = am.get(d.assignment_id)
      const parts = [a ? cm.get(a.company_id) : null, a ? jm.get(a.judge_id) : null, d.criterion_id ? km.get(d.criterion_id) : null].filter(Boolean)
      if (parts.length) out.set(r.id, parts.join(' · '))
    }
    return out
  }
}

function Change({ row }: { row: AuditViewRow }) {
  if (!row.before && !row.after) {
    return row.meta ? <code className="block whitespace-pre-wrap break-all text-xs text-muted">{JSON.stringify(row.meta)}</code> : <span className="text-muted">-</span>
  }
  const d = diffKeys(row.before, row.after).filter(x => x.key !== 'id')
  if (row.action === 'insert' || row.action === 'delete') {
    const src = (row.after ?? row.before) as Record<string, unknown>
    const keys = Object.keys(src).filter(k => !['id', 'created_at', 'updated_at'].includes(k)).slice(0, 6)
    return (
      <div className="text-xs text-muted">
        {keys.map(k => <span key={k} className="mr-3 inline-block"><span className="font-semibold text-fg/70">{k}</span> {show(src[k])}</span>)}
      </div>
    )
  }
  return (
    <div className="grid gap-0.5 text-xs">
      {d.map(x => {
        const key = x.key === 'score' || x.key === 'comment' || x.key === 'status'
        return (
          <div key={x.key} className={cn('flex flex-wrap items-baseline gap-1.5', key && 'text-sm')}>
            <span className="font-semibold text-muted">{x.key}</span>
            <span className="tabular rounded bg-danger/10 px-1 text-danger line-through decoration-danger/40">{show(x.before)}</span>
            <span className="text-muted">→</span>
            <span className="tabular rounded bg-accent/15 px-1 font-semibold text-[#1f7a5f]">{show(x.after)}</span>
          </div>
        )
      })}
      {!d.length && <span className="text-muted">변경 없음</span>}
    </div>
  )
}

function Pager({ page, total, qs }: { page: number; total: number; qs: (p: Partial<SP>) => string }) {
  const pages = Math.max(1, Math.ceil(total / PAGE))
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-muted">
      <span className="tabular">총 {total.toLocaleString('ko-KR')}건 · {page}/{pages} 페이지</span>
      <div className="flex gap-2">
        {page > 1 ? <Link className="rounded-md border border-line bg-card px-3 py-1 hover:bg-bg" href={qs({ page: String(page - 1) })}>이전</Link> : null}
        {page < pages ? <Link className="rounded-md border border-line bg-card px-3 py-1 hover:bg-bg" href={qs({ page: String(page + 1) })}>다음</Link> : null}
      </div>
    </div>
  )
}
