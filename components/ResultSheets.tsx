import { belowPass, type CompanyResult } from '@/lib/scoring'
import { fmtScore } from '@/lib/format'
import { groupSpans } from '@/lib/criteria-groups'
import CriteriaHead from '@/components/CriteriaHead'
import type { StageReport } from '@/lib/server/export'

// 심사 결과표 (출력 화면 /a/print 와 기관 열람 링크 /r 공용, 서버 컴포넌트)
//  · SummarySheet  종합 평가표: 팀별 대항목 평균·심사위원 평균·최종 점수·순위 (심사위원별 점수 없음) + 선택: 서명란
//  · JudgeSheets   심사위원별 채점표: 심사위원 한 명당 한 장 (세부 항목 점수·합계·종합 심사평·결과)

export const SHEET_CSS = `
@media screen { .screen-hide { display: none; } }
.sheet table { width: 100%; border-collapse: collapse; }
.sheet th, .sheet td { border: 1px solid #555; padding: 6px 8px; }
.sheet th { background: #f1f1f1; font-weight: 700; text-align: center; white-space: nowrap; }
.sheet td.num { text-align: center; font-variant-numeric: tabular-nums; }
.sheet td.comment { white-space: pre-wrap; font-size: 0.9em; line-height: 1.55; padding: 6px 10px 8px; background: #fcfcfc; }
.sheet th.judge-head { text-align: left; font-size: 1.15em; font-weight: 900; background: #fff; border: 0; border-bottom: 1px solid #555; padding: 4px 0 6px; }
.sheet .comment-label { display: inline-block; margin-right: 8px; font-weight: 700; color: #555; }
@media print {
  header, nav, .no-print { display: none !important; }
  main { padding: 0 !important; max-width: none !important; }
  .sheet table { font-size: 10.5pt; }
  .page-break { break-before: page; }
  .screen-hide { display: block !important; }
  tr, td, th, tbody.team { break-inside: avoid; }
}
`

/** 심사위원 기호 A·B·C… (sortedJudges 순서) */
export const judgeLetter = (i: number) => String.fromCharCode(65 + i)

/** 심사위원 순서: 위원장 먼저, 이름순 */
export function sortedJudges(r: StageReport) {
  return [...r.stageJudges].sort((a, b) => Number(b.is_chair) - Number(a.is_chair) || a.name.localeCompare(b.name, 'ko'))
}

function helpers(r: StageReport) {
  const passScore = r.stage.pass_score == null ? null : Number(r.stage.pass_score)
  const name = (id: string) => r.companies.get(id)?.name ?? '(삭제된 기업)'
  const verdict = (x: CompanyResult) =>
    x.cutoff ? '과락' : x.final == null ? '집계 중' : passScore == null ? '' : belowPass(x.final, passScore) ? '미달' : '통과'
  const hasBonus = r.results.some(x => x.bonus)
  return { passScore, name, verdict, hasBonus }
}

export function sheetDate(r: StageReport) {
  const day = r.stage.eval_end ? new Date(r.stage.eval_end) : new Date()
  return day.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' })
}

// 서명란 날짜: 출력(화면을 연) 날
const todayKst = () => new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' })

export function SheetTitle({ r, subtitle }: { r: StageReport; subtitle: string }) {
  const maxTotal = r.criteria.reduce((a, c) => a + Number(c.max_score), 0)
  const passScore = r.stage.pass_score == null ? null : Number(r.stage.pass_score)
  return (
    <>
      <h1 className="text-center text-2xl font-black">{r.program.title} {r.stage.name}</h1>
      <p className="mt-1 text-center text-lg font-bold">{subtitle}</p>
      <div className="mb-2 mt-4 flex flex-wrap justify-between gap-2 text-sm">
        <span>심사일: {sheetDate(r)} · 심사위원 {r.stageJudges.length}명 · 대상 {r.results.length}개 팀</span>
        <span>{passScore != null && `합격선 ${fmtScore(passScore)}점 · `}{maxTotal ? `${fmtScore(maxTotal)}점 만점` : ''}{r.source === 'snapshot' ? ' · 확정 결과' : ' · 실시간 집계'}</span>
      </div>
    </>
  )
}

export function SummarySheet({ r, showNames, signature }: { r: StageReport; showNames: boolean; signature: boolean }) {
  const { passScore, name, verdict, hasBonus } = helpers(r)
  const criteria = r.criteria
  const groups = groupSpans(criteria)
  // 대항목이 있으면 대항목별 평균 합, 없으면 항목별 평균
  const cols = groups
    ? groups.map(g => ({ key: g.name, label: g.name || '기타', max: g.max, ids: criteria.filter(c => (c.group_name ?? '') === g.name).map(c => c.id) }))
    : criteria.map(c => ({ key: c.id, label: c.name, max: Number(c.max_score), ids: [c.id] }))
  const colAvg = (x: CompanyResult, ids: string[]) => {
    const vals = ids.map(id => x.criterion_avgs[id])
    return vals.some(v => v == null) ? null : vals.reduce<number>((a, v) => a + (v ?? 0), 0)
  }
  const judges = sortedJudges(r)
  const fixed2 = (n: number | null | undefined) => (n == null ? '-' : Number(n).toFixed(2))
  const conflictOf = (cid: string) => new Set(r.assignments.filter(a => a.company_id === cid && a.conflict).map(a => a.judge_id))
  return (
    <>
      {/* 팀 × 심사위원 합계(A·B·C 위원) · 평균(소수점 둘째 자리) · 결과 · 순위 */}
      <table>
        <thead>
          <tr>
            <th>기업(팀)명</th>
            {judges.map((j, i) => <th key={j.id}>{judgeLetter(i)}위원</th>)}
            <th>{hasBonus ? '심사위원 평균' : <>최종 점수<div className="text-xs font-normal">(심사위원 평균)</div></>}</th>
            {hasBonus && <th>가감점</th>}
            {hasBonus && <th>최종 점수</th>}
            {passScore != null && <th>결과</th>}
            <th style={{ width: '8%' }}>순위</th>
          </tr>
        </thead>
        <tbody>
          {r.results.map(x => {
            const tot = new Map(x.judge_totals.map(t => [t.judge_id, t.total]))
            const conflict = conflictOf(x.company_id)
            return (
              <tr key={x.company_id}>
                <td className="font-semibold">{name(x.company_id)}</td>
                {judges.map(j => <td key={j.id} className="num">{conflict.has(j.id) ? '제외' : fmtScore(tot.get(j.id) ?? null)}</td>)}
                <td className={hasBonus ? 'num' : 'num text-base font-black'}>{fixed2(x.raw)}</td>
                {hasBonus && <td className="num">{x.bonus ? (x.bonus > 0 ? `+${fmtScore(x.bonus)}` : fmtScore(x.bonus)) : '-'}</td>}
                {hasBonus && <td className="num text-base font-black">{fixed2(x.final)}</td>}
                {passScore != null && <td className="num">{verdict(x)}</td>}
                <td className="num whitespace-nowrap font-bold">{x.rank ?? '-'}{x.tied && <span className="text-xs font-normal"> 공동</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {/* 화면 전용: 대항목별 평균 (인쇄하지 않음) */}
      <details className="no-print mt-3 rounded-md border border-[#ddd] p-3">
        <summary className="cursor-pointer text-sm font-semibold">{groups ? '대항목' : '항목'}별 평균 보기</summary>
        <table className="mt-3">
          <thead>
            <tr>
              <th>기업(팀)명</th>
              {cols.map(c => <th key={c.key}>{c.label}<div className="text-xs font-normal">{fmtScore(c.max)}점</div></th>)}
              <th>평균</th>
            </tr>
          </thead>
          <tbody>
            {r.results.map(x => (
              <tr key={x.company_id}>
                <td className="font-semibold">{name(x.company_id)}</td>
                {cols.map(c => <td key={c.key} className="num">{fixed2(colAvg(x, c.ids))}</td>)}
                <td className="num font-bold">{fixed2(x.raw)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="mt-2 text-xs text-[#444]">
        점수는 심사위원 점수의 평균입니다(이해충돌 제외).{criteria.some(c => c.tie_priority != null) && ` 동점이면 ${tieText(criteria)} 순으로 점수가 높은 팀이 앞섭니다.`}
      </p>

      {signature && (
        <div className="mt-8" style={{ breakInside: 'avoid' }}>
          <p className="text-center">위와 같이 심사 결과를 확인합니다.</p>
          <p className="mt-2 text-center">{todayKst()}</p>
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
      )}
    </>
  )
}

/**
 * 심사위원별 채점표: 심사위원 한 명당 한 장 — 팀 × 세부 항목 점수 · 합계 · 종합 심사평 · 결과(그 심사위원 합계 기준).
 * current 가 있으면 화면에는 그 심사위원만 보이고(나머지는 인쇄 때만), 인쇄는 심사위원마다 새 쪽.
 * nav 를 주면 위에 심사위원 이동(탭·이전/다음)을 붙인다.
 */
export function JudgeSheets({ r, showNames, current = null, nav, comments = false, commentsHref }: {
  r: StageReport; showNames: boolean; current?: number | null
  nav?: (i: number) => string
  /** 팀마다 종합 심사평 행 (기본 접힘). 화면·인쇄 같은 설정 */
  comments?: boolean
  /** 심사평 펼치기/접기 링크 (nav 옆에 표시) */
  commentsHref?: string
}) {
  const { passScore } = helpers(r)
  const criteria = r.criteria
  const judges = sortedJudges(r)
  const judgeLabel = (i: number) => `${judgeLetter(i)}위원${showNames ? ` ${judges[i].name}` : ''}`
  const overall = new Map(r.reviews.map(v => [v.assignment_id, v.overall_comment]))
  const scoreOf = (aid: string, cid: string) => r.scores.find(s => s.assignment_id === aid && s.criterion_id === cid)?.score ?? null
  const totalOf = (aid: string) => {
    const vals = criteria.map(c => scoreOf(aid, c.id))
    return vals.some(v => v == null) ? null : vals.reduce<number>((a, v) => a + Number(v), 0)
  }
  // 팀 순서: 발표 코드 → 이름
  const teamIds = [...new Set(r.assignments.map(a => a.company_id))].sort((a, b) => {
    const ca = r.companies.get(a), cb = r.companies.get(b)
    return (ca?.blind_code ?? '').localeCompare(cb?.blind_code ?? '', 'ko') || (ca?.name ?? '').localeCompare(cb?.name ?? '', 'ko')
  })
  const cur = current == null ? null : Math.min(Math.max(current, 0), judges.length - 1)
  const span = 2 + criteria.length + 1 + (passScore != null ? 1 : 0)

  if (!judges.length) return <p className="text-sm text-[#555]">배정된 심사위원이 없습니다.</p>

  return (
    <>
      {nav && cur != null && (
        <div className="no-print mb-4 flex flex-wrap items-center gap-2">
          <a href={nav(Math.max(cur - 1, 0))} aria-disabled={cur === 0}
            className={`rounded-md border border-[#ccc] px-3 py-1.5 text-sm font-semibold ${cur === 0 ? 'pointer-events-none opacity-40' : 'hover:bg-[#f3f3f3]'}`}>← 이전</a>
          <div className="flex flex-wrap overflow-hidden rounded-md border border-[#ccc] text-sm">
            {judges.map((j, i) => (
              <a key={j.id} href={nav(i)} className={`px-3 py-1.5 font-semibold ${i === cur ? 'bg-[#222] text-white' : 'bg-white text-[#555] hover:bg-[#f3f3f3]'}`}>{judgeLabel(i)}</a>
            ))}
          </div>
          <a href={nav(Math.min(cur + 1, judges.length - 1))} aria-disabled={cur === judges.length - 1}
            className={`rounded-md border border-[#ccc] px-3 py-1.5 text-sm font-semibold ${cur === judges.length - 1 ? 'pointer-events-none opacity-40' : 'hover:bg-[#f3f3f3]'}`}>다음 →</a>
          <span className="tabular text-sm text-[#555]">{cur + 1} / {judges.length}</span>
          {commentsHref && (
            <a href={commentsHref} className="ml-auto rounded-md border border-[#ccc] px-3 py-1.5 text-sm font-semibold hover:bg-[#f3f3f3]">
              {comments ? '▲ 종합 심사평 접기' : '▼ 종합 심사평 펼치기'}
            </a>
          )}
        </div>
      )}
      {judges.map((j, i) => {
        const mine = new Map(r.assignments.filter(a => a.judge_id === j.id).map(a => [a.company_id, a]))
        const hidden = cur != null && i !== cur
        return (
          <section key={j.id} className={`${i > 0 ? 'page-break' : ''} ${hidden ? 'screen-hide' : ''} ${i > 0 && !hidden && cur == null ? 'mt-10' : ''}`}>
            <table>
              <CriteriaHead criteria={criteria}
                top={
                  <tr>
                    <th colSpan={span} className="judge-head">
                      {judgeLabel(i)}{j.is_chair && <span className="ml-2 text-sm">심사위원장</span>}
                      {showNames && j.affiliation && <span className="ml-3 text-sm font-normal">{j.affiliation}</span>}
                    </th>
                  </tr>
                }
                lead={n => <><th rowSpan={n}>번호</th><th rowSpan={n}>기업(팀)명</th></>}
                cell={c => <th key={c.id} style={{ whiteSpace: 'normal' }}>{c.name}<div className="text-xs font-normal">{fmtScore(Number(c.max_score))}</div></th>}
                tail={n => <><th rowSpan={n}>합계</th>{passScore != null && <th rowSpan={n}>결과</th>}</>} />
              {/* 팀마다: 점수 행 + 아래 전체 폭 종합 심사평 행 (심사평이 길어도 표가 깨지지 않게) */}
              {teamIds.filter(id => mine.has(id)).map((id, k) => {
                const a = mine.get(id)!
                const c = r.companies.get(id)
                const label = <><td className="num whitespace-nowrap">{c?.blind_code ?? k + 1}</td><td className="font-semibold">{c?.name ?? '(삭제된 기업)'}</td></>
                if (a.conflict) {
                  return <tbody key={id} className="team"><tr>{label}<td colSpan={span - 2} className="num text-[#777]">이해충돌 제외</td></tr></tbody>
                }
                const total = totalOf(a.id)
                const comment = comments ? overall.get(a.id)?.trim() : null
                return (
                  <tbody key={id} className="team">
                    <tr>
                      {label}
                      {criteria.map(cr => { const v = scoreOf(a.id, cr.id); return <td key={cr.id} className="num">{fmtScore(v == null ? null : Number(v))}</td> })}
                      <td className="num font-bold">{fmtScore(total)}</td>
                      {passScore != null && <td className="num whitespace-nowrap">{total == null ? '미입력' : belowPass(total, passScore) ? '미달' : '통과'}</td>}
                    </tr>
                    {comments && (
                      <tr>
                        <td colSpan={span} className="comment">
                          <span className="comment-label">종합 심사평</span>
                          {comment || <span className="text-[#999]">(작성 안 함)</span>}
                        </td>
                      </tr>
                    )}
                  </tbody>
                )
              })}
            </table>
            <p className="mt-6 text-right">
              {todayKst()} &nbsp;&nbsp; 심사위원 <span className="inline-block min-w-[7em] border-b border-[#555] text-center font-semibold">{showNames ? j.name : ''}</span> &nbsp;(서명)
            </p>
          </section>
        )
      })}
    </>
  )
}

// 동점 기준 문구: 우선순위 숫자별로 대항목(없으면 항목명)
function tieText(criteria: { name: string; group_name?: string | null; tie_priority: number | null }[]) {
  const levels = [...new Set(criteria.filter(c => c.tie_priority != null).map(c => c.tie_priority!))].sort((a, b) => a - b)
  return levels.map(p => [...new Set(criteria.filter(c => c.tie_priority === p).map(c => c.group_name || c.name))].join('·')).join(' → ')
}
