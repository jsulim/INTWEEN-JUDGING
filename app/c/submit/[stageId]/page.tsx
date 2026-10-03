import { notFound } from 'next/navigation'
import { Alert, Empty, PageHeader } from '@/components/ui'
import { DDayBadge, StageStatusBadge } from '@/components/StatusBadges'
import SlotUploader from '@/components/company/SlotUploader'
import { requireRole } from '@/lib/server/auth'
import { fmtDate } from '@/lib/format'
import { submitWindow } from '@/components/company/rules'
import type { MyEntryRow, RequiredFile, Submission } from '@/lib/types'

// C-03 단계별 제출: 요구 파일 슬롯, 재업로드 시 버전 보관, 블라인드 안내
export default async function SubmitStagePage({ params }: { params: { stageId: string } }) {
  const { supabase } = await requireRole('company')
  const { data } = await supabase.from('v_my_entries').select('*').eq('stage_id', params.stageId).limit(1)
  const entry = (data ?? [])[0] as MyEntryRow | undefined
  if (!entry) notFound()
  const slots = (Array.isArray(entry.required_files) ? entry.required_files : []) as RequiredFile[]

  const { data: subs } = await supabase.from('submissions').select('*').eq('entry_id', entry.entry_id).order('version', { ascending: false })
  const submissions = (subs ?? []) as Submission[]
  const win = submitWindow(entry)

  return (
    <>
      <PageHeader
        back={{ href: '/c/submit', label: '자료 제출' }}
        title={<span className="flex flex-wrap items-center gap-2">{entry.stage_name}<StageStatusBadge status={entry.stage_status} />{win.open && <DDayBadge deadline={entry.submit_end} />}</span>}
        description={<span className="tabular">접수 기간 {fmtDate(entry.submit_start)} ~ {fmtDate(entry.submit_end)}</span>}
      />

      <div className="grid max-w-3xl gap-4">
        {!win.open && <Alert tone="neutral">{win.reason}</Alert>}
        {entry.blind_mode && (
          <Alert tone="highlight">
            <b>블라인드 심사 단계</b> · 식별 정보(기업명·대표자명)를 제외하고 작성해 주세요. 파일명에도 기업명을 넣지 마세요.
          </Alert>
        )}
        {win.open && (
          <p className="text-sm text-muted">
            PDF·PPTX, 파일당 최대 50MB. 다시 올리면 새 버전으로 제출되고 이전 버전은 보관됩니다. 제출하면 확인 메일이 발송됩니다.
          </p>
        )}

        {slots.length ? (
          slots.map(slot => (
            <SlotUploader
              key={slot.type}
              stageId={entry.stage_id}
              slot={slot}
              open={win.open}
              versions={submissions.filter(s => s.file_type === slot.type)}
            />
          ))
        ) : (
          <Empty>이 단계는 제출할 자료가 없습니다.</Empty>
        )}
      </div>
    </>
  )
}
