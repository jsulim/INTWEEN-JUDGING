import { Empty, PageHeader } from '@/components/ui'
import CompanyForm from '@/components/company/CompanyForm'
import { requireRole } from '@/lib/server/auth'
import { loadMyCompanies } from '../_lib/server'

// C-02 기업 정보: 기업명, 사업자번호, 대표자, 팀원, 분야, 담당자 이메일
export default async function CompanyInfoPage() {
  const { supabase, user } = await requireRole('company')
  const companies = await loadMyCompanies(supabase, user.id)
  return (
    <>
      <PageHeader title="기업 정보" description="심사에 사용되는 기본 정보입니다. 변경 사항은 저장 즉시 반영됩니다." />
      {companies.length ? (
        <div className="grid max-w-3xl gap-6">
          {companies.map(c => (
            <CompanyForm key={c.id} company={c} programTitle={companies.length > 1 ? c.programs?.title ?? null : null} />
          ))}
        </div>
      ) : (
        <Empty>등록된 기업 정보가 없습니다. 관리자에게 문의해 주세요.</Empty>
      )}
    </>
  )
}
