import Link from 'next/link'
import { Badge, Card, Empty, LinkButton, PageHeader, Progress, Stat } from '@/components/ui'
import { StageStatusBadge, DDayBadge } from '@/components/StatusBadges'
import { requireRole } from '@/lib/server/auth'
import { fmtDate } from '@/lib/format'
import { pickStage, stageOverview } from '@/components/admin/setup/server'
import type { Program, Stage } from '@/lib/types'

export const dynamic = 'force-dynamic'

// 통합 대시보드: 운영 중 프로그램별 단계 상태·제출률·평가 진행률
export default async function AdminHome() {
  const { supabase } = await requireRole('admin')
  const { data: programs } = await supabase.from('programs').select('*, stages(*)')
    .in('status', ['active', 'draft']).order('created_at', { ascending: false })
  const list = ((programs ?? []) as (Program & { stages: Stage[] })[])
    .map(p => ({ ...p, stages: [...p.stages].sort((a, b) => a.order_no - b.order_no) }))
  const active = list.filter(p => p.status === 'active')
  const drafts = list.filter(p => p.status === 'draft')

  const overviews = await Promise.all(active.map(async p => {
    const stage = pickStage(p.stages)
    if (!stage) return { program: p, stage: null, ov: null }
    const ov = await stageOverview(supabase, stage.id).catch(() => null)
    return { program: p, stage, ov }
  }))

  const totalAlerts = overviews.reduce((a, o) => a + (o.ov?.alerts.length ?? 0), 0)
  const evaluating = active.flatMap(p => p.stages).filter(s => s.status === 'evaluating').length
  const submitting = active.flatMap(p => p.stages).filter(s => s.status === 'submitting').length

  return (
    <>
      <PageHeader title="통합 대시보드" description="운영 중인 프로그램의 현재 단계와 진행 현황"
        actions={<LinkButton href="/a/programs" variant="outline">프로그램 관리</LinkButton>} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="운영 중 프로그램" value={active.length} hint={drafts.length ? `준비 중 ${drafts.length}개` : undefined} />
        <Stat label="접수중 단계" value={submitting} />
        <Stat label="평가중 단계" value={evaluating} />
        <Stat label="점수 편차 경고" value={totalAlerts} tone={totalAlerts ? 'highlight' : undefined} />
      </div>

      {active.length === 0 ? (
        <Empty>
          운영 중인 프로그램이 없습니다.{' '}
          <Link href="/a/programs" className="font-semibold text-primary">프로그램 관리</Link>에서 생성하거나 상태를 &apos;운영&apos;으로 바꿔 주세요.
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {overviews.map(({ program, stage, ov }) => (
            <Card key={program.id}
              title={<Link href={`/a/p/${program.id}`} className="hover:text-primary">{program.title}</Link>}
              actions={<>
                <Badge>{program.type === 'hackathon' ? '해커톤' : '기업심사'}</Badge>
                <LinkButton href={`/a/p/${program.id}${stage ? `?stage=${stage.id}` : ''}`} size="sm" variant="secondary">대시보드</LinkButton>
              </>}>
              <div className="mb-4 flex flex-wrap gap-2">
                {program.stages.length === 0 && <span className="text-sm text-muted">단계 없음 — <Link className="text-primary" href={`/a/p/${program.id}/stages`}>단계 추가</Link></span>}
                {program.stages.map(s => (
                  <Link key={s.id} href={`/a/p/${program.id}?stage=${s.id}`}
                    className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${s.id === stage?.id ? 'border-primary' : 'border-line'}`}>
                    <span className="font-semibold">{s.order_no}. {s.name}</span>
                    <StageStatusBadge status={s.status} />
                  </Link>
                ))}
              </div>
              {stage && ov ? (
                <div className="grid gap-3 text-sm">
                  <div className="flex items-center justify-between text-muted">
                    <span>현재 단계: <b className="text-fg">{stage.name}</b></span>
                    <span className="flex items-center gap-2">
                      {stage.status === 'submitting' && <><span>접수 마감 {fmtDate(stage.submit_end)}</span><DDayBadge deadline={stage.submit_end} /></>}
                      {stage.status === 'evaluating' && <><span>평가 마감 {fmtDate(stage.eval_end)}</span><DDayBadge deadline={stage.eval_end} /></>}
                    </span>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold text-muted">제출률 (필수 파일 {ov.requiredCount}종)</div>
                    <Progress value={ov.submittedCount} max={ov.entryCount} />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold text-muted">평가 진행률 (완료 / 배정)</div>
                    <Progress value={ov.done} max={ov.assigned} tone={ov.done < ov.assigned ? 'highlight' : 'accent'} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>참가 {ov.entryCount}개사</Badge>
                    {ov.inProgressCount > 0 && <Badge tone="highlight">집계 중 {ov.inProgressCount}</Badge>}
                    {ov.alerts.length > 0 && <Badge tone="highlight">편차 경고 {ov.alerts.length}</Badge>}
                    {ov.results.filter(r => r.cutoff).length > 0 && <Badge tone="danger">과락 {ov.results.filter(r => r.cutoff).length}</Badge>}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">집계할 단계가 없습니다.</p>
              )}
            </Card>
          ))}
        </div>
      )}

      {drafts.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-bold">준비 중 프로그램</h2>
          <div className="flex flex-wrap gap-2">
            {drafts.map(p => (
              <Link key={p.id} href={`/a/p/${p.id}/settings`} className="rounded-md border border-line bg-card px-3 py-2 text-sm hover:border-primary">
                {p.title} <span className="text-muted">· 단계 {p.stages.length}개</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
