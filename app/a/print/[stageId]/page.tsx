import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/server/auth'
import { loadStageReport } from '@/lib/server/export'
import { belowPass, type CompanyResult } from '@/lib/scoring'
import { fmtScore } from '@/lib/format'
import { groupSpans } from '@/lib/criteria-groups'
import CriteriaHead from '@/components/CriteriaHead'
import PrintBar from './PrintBar'

export const dynamic = 'force-dynamic'

const PRINT_CSS = `
@media print {
  header, nav, .no-print { display: none !important; }
  main { padding: 0 !important; max-width: none !important; }
  .sheet table { font-size: 10.5pt; }
  .page-break { break-before: page; }
  tr, td, th { break-inside: avoid; }
}
.sheet table { width: 100%; border-collapse: collapse; }
.sheet th, .sheet td { border: 1px solid #555; padding: 6px 8px; }
.sheet th { background: #f1f1f1; font-weight: 700; text-align: center; white-space: nowrap; }
.sheet td.num { text-align: center; font-variant-numeric: tabular-nums; }
`

// A-08 평가표 출력 (인쇄·PDF 저장)
//  · sign   서명용 총괄표: 기업별 평균·최종 점수·순위만 (심사위원별 점수 없음) + 심사위원 수기 서명란
//  · detail 상세 채점표(내부 보관용): 기업 × 심사위원 합계, 기업별 세부 항목 점수
// 참가자에게 공개하는 문서가 아니다 (결과 공개는 기업 화면의 결과 확인으로 한다).
export default async function PrintSheet({ params, searchParams }: {
  params: { stageId: string }
  searchParams: { mode?: string; names?: string; per?: string }
}) {
  const { supabase } = await requireRole('admin')
  const r = await loadStageReport(supabase, params.stageId).catch(() => null)
  if (!r) notFound()
  const mode = searchParams.mode === 'detail' ? 'detail' : 'sign'
  const showNames = searchParams.names !== '0'
  const perCompany = searchParams.per !== '0'
  const href = (p: Partial<{ mode: string; names: string; per: string }>) => {
    const q = new URLSearchParams({ mode, names: showNames ? '1' : '0', per: perCompany ? '1' : '0', ...p })
    return `/a/print/${params.stageId}?${q}`
  }

  const { stage, program, criteria } = r
  const passScore = stage.pass_score == null ? null : Number(stage.pass_score)
  const name = (id: string) => r.companies.get(id)?.name ?? '(삭제된 기업)'
  const code = (id: string) => r.companies.get(id)?.blind_code ?? ''
  const maxTotal = criteria.reduce((a, c) => a + Number(c.max_score), 0)
  // 심사위원 순서: 위원장 먼저, 이름순
  const judges = [...r.stageJudges].sort((a, b) => Number(b.is_chair) - Number(a.is_chair) || a.name.localeCompare(b.name, 'ko'))
  const judgeLabel = (i: number) => (showNames ? judges[i].name : `심사위원 ${String.fromCharCode(65 + i)}`)
  const hasBonus = r.results.some(x => x.bonus)
  const groups = groupSpans(criteria)
  // 대항목이 있으면 대항목별 평균 합, 없으면 항목별 평균
  const cols = groups
    ? groups.map(g => ({ key: g.name, label: g.name || '기타', max: g.max, ids: criteria.filter(c => (c.group_name ?? '') === g.name).map(c => c.id) }))
    : criteria.map(c => ({ key: c.id, label: c.name, max: Number(c.max_score), ids: [c.id] }))
  const colAvg = (x: CompanyResult, ids: string[]) => {
    const vals = ids.map(id => x.criterion_avgs[id])
    return vals.some(v => v == null) ? null : vals.reduce<number>((a, v) => a + (v ?? 0), 0)
  }
  const verdict = (x: CompanyResult) =>
    x.cutoff ? '과락' : x.final == null ? '집계 중' : passScore == null ? '' : belowPass(x.final, passScore) ? '미달' : '합격선 이상'
  const day = stage.eval_end ? new Date(stage.eval_end) : new Date()
  const dateText = day.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' })
  const incomplete = r.results.some(x => x.in_progress || x.final == null)

  return (
    <div className="mx-auto max-w-[1100px] text-[#111]">
      <style>{`@page { size: A4 ${mode === 'detail' ? 'landscape' : 'portrait'}; margin: 12mm; }${PRINT_CSS}`}</style>

      <div className="no-print">
        <PrintBar back={`/a/p/${stage.program_id}/results?stage=${stage.id}`} options={[
          [{ label: '서명용 총괄표', href: href({ mode: 'sign' }), on: mode === 'sign' }, { label: '상세 채점표', href: href({ mode: 'detail' }), on: mode === 'detail' }],
          [{ label: '심사위원 이름 표시', href: href({ names: '1' }), on: showNames }, { label: mode === 'sign' ? '이름 칸 비움' : '이름 가림 (A·B·C)', href: href({ names: '0' }), on: !showNames }],
          ...(mode === 'detail' ? [[{ label: '기업별 세부 점수 포함', href: href({ per: '1' }), on: perCompany }, { label: '합계만', href: href({ per: '0' }), on: !perCompany }]] : []),
        ]} />
        {incomplete && (
          <p className="mb-4 rounded-md bg-[#fff4d6] px-4 py-2 text-sm text-[#8a5a00]">아직 평가가 끝나지 않은 기업이 있습니다. 모든 심사위원이 제출한 뒤 출력하세요.</p>
        )}
      </div>

      <div className="sheet bg-white p-2">
        <h1 className="text-center text-2xl font-black">{program.title} {stage.name}</h1>
        <p className="mt-1 text-center text-lg font-bold">{mode === 'sign' ? '심사 결과 총괄표' : '심사위원별 상세 채점표'}</p>
        <div className="mb-2 mt-4 flex flex-wrap justify-between gap-2 text-sm">
          <span>심사일: {dateText} · 심사위원 {judges.length}명 · 대상 {r.results.length}개 팀</span>
          <span>{passScore != null && `합격선 ${fmtScore(passScore)}점 · `}{maxTotal ? `${fmtScore(maxTotal)}점 만점` : ''}{r.source === 'snapshot' ? ' · 확정 결과' : ' · 실시간 집계'}</span>
        </div>

        {mode === 'sign' ? (
          <>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '6%' }}>순위</th>
                  <th>기업(팀)명</th>
                  {cols.map(c => <th key={c.key}>{c.label}<div className="text-xs font-normal">{fmtScore(c.max)}점</div></th>)}
                  <th>심사위원<br />평균</th>
                  {hasBonus && <th>가감점</th>}
                  <th>최종 점수</th>
                  {passScore != null && <th>결과</th>}
                </tr>
              </thead>
              <tbody>
                {r.results.map(x => (
                  <tr key={x.company_id}>
                    <td className="num font-bold">{x.rank ?? '-'}{x.tied ? '(공동)' : ''}</td>
                    <td className="font-semibold">{name(x.company_id)}{code(x.company_id) && <span className="ml-1 text-xs font-normal text-[#555]">{code(x.company_id)}</span>}</td>
                    {cols.map(c => <td key={c.key} className="num">{fmtScore(colAvg(x, c.ids), 2)}</td>)}
                    <td className="num">{fmtScore(x.raw, 2)}</td>
                    {hasBonus && <td className="num">{x.bonus ? (x.bonus > 0 ? `+${fmtScore(x.bonus)}` : fmtScore(x.bonus)) : '-'}</td>}
                    <td className="num text-base font-black">{fmtScore(x.final, 2)}</td>
                    {passScore != null && <td className="num">{verdict(x)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-[#444]">
              점수는 심사위원 점수의 평균입니다(이해충돌 제외).{criteria.some(c => c.tie_priority != null) && ` 동점이면 ${tieText(criteria)} 순으로 점수가 높은 팀이 앞섭니다.`}
            </p>

            <div className="mt-8" style={{ breakInside: 'avoid' }}>
              <p className="text-center">위와 같이 심사 결과를 확인합니다.</p>
              <p className="mt-2 text-center">{dateText}</p>
              <table className="mt-5">
                <thead>
                  <tr><th style={{ width: '16%' }}>구분</th><th style={{ width: '30%' }}>소속</th><th style={{ width: '22%' }}>성명</th><th>서명</th></tr>
                </thead>
                <tbody>
                  {judges.map(j => (
                    <tr key={j.id} style={{ height: 52 }}>
                      <td className="num">{j.is_chair ? '심사위원장' : '심사위원'}</td>
                      <td>{showNames ? j.affiliation ?? '' : ''}</td>
                      <td className="num font-semibold">{showNames ? j.name : ''}</td>
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>순위</th><th>기업(팀)명</th>
                  {judges.map((j, i) => <th key={j.id}>{judgeLabel(i)}{j.is_chair && showNames && <div className="text-xs font-normal">위원장</div>}</th>)}
                  <th>평균</th>{hasBonus && <th>가감점</th>}<th>최종 점수</th>{passScore != null && <th>결과</th>}
                </tr>
              </thead>
              <tbody>
                {r.results.map(x => {
                  const tot = new Map(x.judge_totals.map(t => [t.judge_id, t.total]))
                  const conflict = new Set(r.assignments.filter(a => a.company_id === x.company_id && a.conflict).map(a => a.judge_id))
                  return (
                    <tr key={x.company_id}>
                      <td className="num font-bold">{x.rank ?? '-'}</td>
                      <td className="font-semibold">{name(x.company_id)}</td>
                      {judges.map(j => <td key={j.id} className="num">{conflict.has(j.id) ? '제외' : fmtScore(tot.get(j.id) ?? null)}</td>)}
                      <td className="num">{fmtScore(x.raw, 2)}</td>
                      {hasBonus && <td className="num">{x.bonus ? fmtScore(x.bonus) : '-'}</td>}
                      <td className="num font-black">{fmtScore(x.final, 2)}</td>
                      {passScore != null && <td className="num">{verdict(x)}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {perCompany && r.results.map(x => {
              const rows = r.assignments.filter(a => a.company_id === x.company_id)
              const scoreOf = (aid: string, cid: string) => r.scores.find(s => s.assignment_id === aid && s.criterion_id === cid)?.score ?? null
              return (
                <section key={x.company_id} className="page-break mt-8">
                  <h2 className="mb-2 text-lg font-black">{x.rank != null && `${x.rank}위 · `}{name(x.company_id)} <span className="text-sm font-normal">최종 {fmtScore(x.final, 2)}점</span></h2>
                  <table>
                    <CriteriaHead criteria={criteria}
                      lead={n => <th rowSpan={n}>심사위원</th>}
                      cell={c => <th key={c.id} style={{ whiteSpace: 'normal' }}>{c.name}<div className="text-xs font-normal">{fmtScore(Number(c.max_score))}</div></th>}
                      tail={n => <th rowSpan={n}>합계</th>} />
                    <tbody>
                      {judges.map((j, i) => {
                        const a = rows.find(a => a.judge_id === j.id)
                        if (!a) return null
                        if (a.conflict) return <tr key={j.id}><td>{judgeLabel(i)}</td><td colSpan={criteria.length + 1} className="num">이해충돌 제외</td></tr>
                        const total = x.judge_totals.find(t => t.judge_id === j.id)?.total ?? null
                        return (
                          <tr key={j.id}>
                            <td className="font-semibold">{judgeLabel(i)}</td>
                            {criteria.map(c => { const v = scoreOf(a.id, c.id); return <td key={c.id} className="num">{fmtScore(v == null ? null : Number(v))}</td> })}
                            <td className="num font-bold">{fmtScore(total)}</td>
                          </tr>
                        )
                      })}
                      <tr>
                        <td className="font-bold">평균</td>
                        {criteria.map(c => <td key={c.id} className="num font-semibold">{fmtScore(x.criterion_avgs[c.id], 2)}</td>)}
                        <td className="num font-black">{fmtScore(x.raw, 2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </section>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

// 동점 기준 문구: 우선순위 숫자별로 대항목(없으면 항목명)
function tieText(criteria: { name: string; group_name?: string | null; tie_priority: number | null }[]) {
  const levels = [...new Set(criteria.filter(c => c.tie_priority != null).map(c => c.tie_priority!))].sort((a, b) => a - b)
  return levels.map(p => [...new Set(criteria.filter(c => c.tie_priority === p).map(c => c.group_name || c.name))].join('·')).join(' → ')
}
