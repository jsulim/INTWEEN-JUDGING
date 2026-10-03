import { Badge, Card, Empty, PageHeader, Table } from '@/components/ui'
import { DownloadLink } from '@/components/admin/results/ui'
import { StageStatusBadge } from '@/components/StatusBadges'
import { requireRole } from '@/lib/server/auth'
import { fmtDate } from '@/lib/format'
import type { Stage } from '@/lib/types'

export const dynamic = 'force-dynamic'

const ITEMS = [
  { type: 'excel', label: '결과표 엑셀', desc: '결과 · 점수매트릭스 · 항목별 평균 · 심사평 4개 시트', file: '.xlsx' },
  { type: 'reviews', label: '심사평 PDF', desc: '기업별 심사위원 항목 점수·심사평·종합 의견', file: '.pdf' },
  { type: 'signatures', label: '서명본 일괄 ZIP', desc: '심사위원 동의서 서명 PDF + 이 단계 평가표 최종 제출 서명 PDF', file: '.zip' },
] as const

// A-09 내보내기: 결과표 엑셀 / 심사평 PDF / 서명본 ZIP / 증빙 패키지
export default async function ExportPage({ params, searchParams }: { params: { id: string }; searchParams: { stage?: string } }) {
  const { supabase } = await requireRole('admin')
  const { data: stageRows } = await supabase.from('stages').select('*').eq('program_id', params.id).order('order_no')
  const stages = (stageRows ?? []) as Stage[]
  if (!stages.length) return (<><PageHeader title="내보내기" /><Empty>등록된 단계가 없습니다.</Empty></>)

  const ids = stages.map(s => s.id)
  const [{ data: snaps }, { data: evals }, { data: judges }] = await Promise.all([
    supabase.from('stage_results').select('stage_id, locked_at').in('stage_id', ids),
    supabase.from('evaluation_submissions').select('stage_id, status, signed_pdf_path').in('stage_id', ids),
    supabase.from('judges').select('id').eq('program_id', params.id),
  ])
  const judgeIds = (judges ?? []).map(j => j.id)
  const { count: consentCount } = judgeIds.length
    ? await supabase.from('consents').select('id', { count: 'exact', head: true }).in('judge_id', judgeIds)
    : { count: 0 }
  const snapOf = new Map<string, { count: number; locked_at: string | null }>()
  for (const s of snaps ?? []) {
    const cur = snapOf.get(s.stage_id) ?? { count: 0, locked_at: null }
    cur.count++
    if (s.locked_at && (!cur.locked_at || s.locked_at > cur.locked_at)) cur.locked_at = s.locked_at
    snapOf.set(s.stage_id, cur)
  }
  const evalCount = (sid: string) => (evals ?? []).filter(e => e.stage_id === sid && e.signed_pdf_path).length
  const focus = searchParams.stage

  return (
    <>
      <PageHeader title="내보내기" description="확정된 단계는 확정 스냅샷, 미확정 단계는 실시간 집계로 내보냅니다. 숫자는 평가 결과·대시보드와 같습니다." />
      <div className="grid gap-5">
        {stages.map(s => {
          const snap = snapOf.get(s.id)
          const locked = s.status === 'locked' || s.status === 'published'
          return (
            <Card key={s.id} className={focus === s.id ? 'ring-2 ring-primary/30' : undefined}
              title={<span className="flex items-center gap-2"><span className="tabular text-muted">{s.order_no}.</span>{s.name} <StageStatusBadge status={s.status} /></span>}
              actions={locked && snap
                ? <Badge tone="accent">확정 스냅샷 {snap.count}개 기업 · {fmtDate(snap.locked_at)}</Badge>
                : <Badge tone="highlight">미확정 — 실시간 집계</Badge>}>
              <Table>
                <thead><tr><th>항목</th><th>내용</th><th className="text-right">파일</th></tr></thead>
                <tbody>
                  {ITEMS.map(it => (
                    <tr key={it.type}>
                      <td className="font-semibold">{it.label}</td>
                      <td className="text-muted">
                        {it.desc}
                        {it.type === 'signatures' && <span className="tabular ml-2 text-xs">(동의서 {consentCount ?? 0} · 평가표 {evalCount(s.id)})</span>}
                      </td>
                      <td className="text-right"><DownloadLink href={`/api/export/${s.id}?type=${it.type}`}>{it.file} 다운로드</DownloadLink></td>
                    </tr>
                  ))}
                  <tr>
                    <td className="font-semibold">증빙 패키지</td>
                    <td className="text-muted">평가표 원본(엑셀) · 서명본 · 심사평 PDF · 수정 이력 CSV + manifest.json(SHA-256) — 감사·발주처 제출용</td>
                    <td className="text-right"><DownloadLink href={`/api/export/${s.id}/audit-pack`} variant="primary">ZIP 다운로드</DownloadLink></td>
                  </tr>
                </tbody>
              </Table>
              {!locked && <p className="mt-2 text-xs text-muted">평가가 진행 중이면 내보낸 이후 점수가 바뀔 수 있습니다. 제출용 자료는 순위 확정 후 내려받으세요.</p>}
            </Card>
          )
        })}
      </div>
    </>
  )
}
