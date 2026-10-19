import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/server/auth'
import { loadStageReport } from '@/lib/server/export'
import { DetailSheet, SHEET_CSS, SheetTitle, SummarySheet } from '@/components/ResultSheets'
import PrintBar from './PrintBar'

export const dynamic = 'force-dynamic'

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
  const perCompany = searchParams.per === '1' // 기본: 심사위원별 합계만
  const href = (p: Partial<{ mode: string; names: string; per: string }>) => {
    const q = new URLSearchParams({ mode, names: showNames ? '1' : '0', per: perCompany ? '1' : '0', ...p })
    return `/a/print/${params.stageId}?${q}`
  }
  const incomplete = r.results.some(x => x.in_progress || x.final == null)

  return (
    <div className="mx-auto max-w-[1100px] text-[#111]">
      <style>{`@page { size: A4 ${mode === 'detail' ? 'landscape' : 'portrait'}; margin: 12mm; }${SHEET_CSS}`}</style>

      <div className="no-print">
        <PrintBar back={`/a/p/${r.stage.program_id}/results?stage=${r.stage.id}`} options={[
          [{ label: '서명용 총괄표', href: href({ mode: 'sign' }), on: mode === 'sign' }, { label: '상세 채점표', href: href({ mode: 'detail' }), on: mode === 'detail' }],
          [{ label: '심사위원 이름 표시', href: href({ names: '1' }), on: showNames }, { label: mode === 'sign' ? '이름 칸 비움' : '이름 가림 (A·B·C)', href: href({ names: '0' }), on: !showNames }],
          ...(mode === 'detail' ? [[{ label: '기업별 세부 점수 포함', href: href({ per: '1' }), on: perCompany }, { label: '합계만', href: href({ per: '0' }), on: !perCompany }]] : []),
        ]} />
        {incomplete && (
          <p className="mb-4 rounded-md bg-[#fff4d6] px-4 py-2 text-sm text-[#8a5a00]">아직 평가가 끝나지 않은 기업이 있습니다. 모든 심사위원이 제출한 뒤 출력하세요.</p>
        )}
      </div>

      <div className="sheet bg-white p-2">
        <SheetTitle r={r} subtitle={mode === 'sign' ? '심사 결과 총괄표' : '심사위원별 상세 채점표'} />
        {mode === 'sign'
          ? <SummarySheet r={r} showNames={showNames} signature />
          : <DetailSheet r={r} showNames={showNames} perCompany={perCompany} />}
      </div>
    </div>
  )
}
