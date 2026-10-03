// 모의 심사용 시드 (12장): 가상 기업 5개, 심사위원 3명, 관리자 1명 + 2단계 프로그램
// 사용: .env.local 에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 설정 후 `npm run seed`
// 계정 비밀번호: SEED_PASSWORD (기본 Intween!2026). 이미 있는 계정·프로그램은 재사용한다.
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })
const PASSWORD = process.env.SEED_PASSWORD || 'Intween!2026'
const DOMAIN = process.env.SEED_EMAIL_DOMAIN || 'mock.intween.test'
const PROGRAM_TITLE = '[모의 심사] 2026 인트윈 해커톤'

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

async function ensureUser(email, name, role, extra = {}) {
  let userId
  const created = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { name } })
  if (created.error) {
    const { data } = await db.from('profiles').select('user_id').eq('email', email).maybeSingle()
    if (data) userId = data.user_id
    else {
      const list = must(await db.auth.admin.listUsers({ perPage: 1000 }), 'listUsers')
      userId = list.users.find(u => u.email === email)?.id
    }
    if (!userId) throw new Error(`사용자 생성 실패: ${email} ${created.error.message}`)
  } else userId = created.data.user.id
  must(await db.from('profiles').upsert({ user_id: userId, role, name, email, ...extra }, { onConflict: 'user_id' }), 'profile')
  return userId
}

const day = 86_400_000
const iso = ms => new Date(Date.now() + ms).toISOString()

async function main() {
  const adminId = await ensureUser(`admin@${DOMAIN}`, '운영 관리자', 'admin', { can_pay: true, org: '인트윈' })

  const existing = must(await db.from('programs').select('id').eq('title', PROGRAM_TITLE).maybeSingle(), 'program lookup')
  if (existing) {
    console.log('이미 시드된 프로그램이 있습니다:', existing.id)
    return
  }
  const program = must(await db.from('programs').insert({
    title: PROGRAM_TITLE, type: 'hackathon', status: 'active', application_open: true,
    application_due: iso(5 * day), description: '1차 서류(블라인드) → 2차 발표 전 과정 모의 운영', payment_per_session: 150000,
  }).select().single(), 'program')

  const plan = { type: 'plan', label: '사업계획서', accept: ['pdf'], required: true }
  const deck = { type: 'deck', label: '발표자료', accept: ['pdf', 'pptx'], required: true }
  const [s1, s2] = must(await db.from('stages').insert([
    { program_id: program.id, order_no: 1, name: '1차 서류심사', status: 'submitting', blind_mode: true,
      submit_start: iso(-1 * day), submit_end: iso(3 * day), eval_start: iso(4 * day), eval_end: iso(7 * day),
      required_files: [plan], bonus_cap: 5, appeal_days: 3 },
    { program_id: program.id, order_no: 2, name: '2차 발표심사', status: 'ready', is_presentation: true,
      submit_start: iso(8 * day), submit_end: iso(10 * day), eval_start: iso(11 * day), eval_end: iso(11 * day + 8 * 3600_000),
      required_files: [deck], trim_extremes: false },
  ], { defaultToNull: false }).select().order('order_no'), 'stages')

  const band = (max, labels) => {
    const step = max / labels.length
    return labels.map((label, i) => ({ min: Math.round(max - step * (i + 1)), max: Math.round(max - step * i), label }))
  }
  must(await db.from('criteria').insert([
    { stage_id: s1.id, order_no: 1, name: '기술성', description: '기술의 독창성·완성도', max_score: 30, min_pass_score: 12, tie_priority: 1,
      rubric: band(30, ['독자 기술 검증됨', '핵심 기술 확보, 일부 검증', '아이디어 단계', '근거 부족']) },
    { stage_id: s1.id, order_no: 2, name: '사업성', description: '시장 규모·수익 모델', max_score: 30, min_pass_score: 12, tie_priority: 2,
      rubric: band(30, ['매출·계약 실적 있음', '검증된 수요', '가설 수준', '근거 부족']) },
    { stage_id: s1.id, order_no: 3, name: '팀 역량', description: '팀 구성·실행력', max_score: 20, min_pass_score: 8,
      rubric: band(20, ['핵심 역량 모두 보유', '일부 보완 필요', '역량 부족']) },
    { stage_id: s1.id, order_no: 4, name: '사회적 가치', description: '파급효과', max_score: 20, comment_required: true,
      rubric: band(20, ['구체적 성과 지표', '방향성 명확', '불명확']) },
    { stage_id: s2.id, order_no: 1, name: '발표 전달력', max_score: 40 },
    { stage_id: s2.id, order_no: 2, name: '질의 대응', max_score: 30 },
    { stage_id: s2.id, order_no: 3, name: '실현 가능성', max_score: 30, tie_priority: 1 },
  ], { defaultToNull: false }), 'criteria')

  must(await db.from('bonus_rules').insert([
    { stage_id: s1.id, name: '여성기업', points: 2, evidence_required: true },
    { stage_id: s1.id, name: '지역 소재 기업', points: 1, evidence_required: true },
    { stage_id: s1.id, name: '서류 미비', points: -2, evidence_required: false },
  ], { defaultToNull: false }), 'bonus_rules')

  must(await db.from('application_fields').insert([
    { program_id: program.id, order_no: 1, label: '설립연도', type: 'number', required: true },
    { program_id: program.id, order_no: 2, label: '최근 연매출(백만원)', type: 'number' },
    { program_id: program.id, order_no: 3, label: '상시 인원', type: 'number', required: true },
    { program_id: program.id, order_no: 4, label: '창업 7년 이내 기업입니다', type: 'check', required: true, is_eligibility: true },
    { program_id: program.id, order_no: 5, label: '국세·지방세 체납이 없습니다', type: 'check', required: true, is_eligibility: true },
    { program_id: program.id, order_no: 6, label: '사업자등록증 사본', type: 'file', required: true },
  ], { defaultToNull: false }), 'application_fields')

  must(await db.from('consent_templates').insert([
    { program_id: program.id, kind: 'privacy', title: '개인정보 수집·이용 동의',
      body: '1. 수집 항목: 성명, 소속, 연락처, 이메일, 서명\n2. 이용 목적: 심사위원 위촉, 심사 운영 및 결과 관리\n3. 보유 기간: 프로그램 종료 후 3년 (이후 지체 없이 파기)\n4. 동의를 거부할 수 있으며, 거부 시 심사 참여가 제한됩니다.' },
    { program_id: program.id, kind: 'security', title: '보안서약서',
      body: '본인은 심사 과정에서 알게 된 참가 기업의 사업계획, 기술 정보, 심사 결과 등 일체의 정보를 외부에 누설하거나 심사 외 목적으로 이용하지 않으며, 자료를 복제·저장·촬영하지 않을 것을 서약합니다. 위반 시 관련 법령에 따른 책임을 집니다.' },
    { program_id: program.id, kind: 'conflict', title: '이해충돌 확인서',
      body: '본인은 배정된 참가 기업과 다음 각 호의 관계가 없음을 확인합니다.\n- 최근 3년 이내 임직원·자문·투자 관계\n- 친족 관계\n- 공동 연구·사업 수행 관계\n이해관계가 있거나 심사 중 알게 된 경우 즉시 신고합니다.' },
  ], { defaultToNull: false }), 'consent_templates')

  const companies = [
    ['알파테크', '김알파', 'AI'], ['베타랩스', '이베타', '헬스케어'], ['감마로보틱스', '박감마', '로보틱스'],
    ['델타에너지', '최델타', '에너지'], ['엡실론푸드', '정엡실론', '푸드테크'],
  ]
  for (const [i, [name, ceo, field]] of companies.entries()) {
    const ownerId = await ensureUser(`company${i + 1}@${DOMAIN}`, `${ceo}`, 'company', { org: name })
    const c = must(await db.from('companies').insert({
      program_id: program.id, owner_user_id: ownerId, name, ceo, field, biz_no: `123-45-6789${i}`,
      contact_email: `company${i + 1}@${DOMAIN}`, members: [{ name: ceo, role: '대표' }],
    }).select().single(), 'company')
    must(await db.from('stage_entries').insert({ stage_id: s1.id, company_id: c.id }), 'entry')
  }

  const judges = [['한심사', '인트윈대학교', 'AI·데이터'], ['오평가', '벤처캐피탈 A', '투자·사업성'], ['윤위원', '기술보증기관', '기술평가']]
  for (const [i, [name, affiliation, expertise]] of judges.entries()) {
    const uid = await ensureUser(`judge${i + 1}@${DOMAIN}`, name, 'judge', { org: affiliation })
    must(await db.from('judges').insert({ program_id: program.id, user_id: uid, affiliation, expertise, is_chair: i === 0 }), 'judge')
    must(await db.from('judge_pool').upsert({ user_id: uid, name, email: `judge${i + 1}@${DOMAIN}`, affiliation,
      expertise: expertise.split('·') }, { onConflict: 'user_id' }), 'pool')
  }

  // 1차 전원 배정
  const js = must(await db.from('judges').select('id').eq('program_id', program.id), 'judges')
  const es = must(await db.from('stage_entries').select('company_id').eq('stage_id', s1.id), 'entries')
  must(await db.from('assignments').insert(js.flatMap(j => es.map(e => ({ stage_id: s1.id, judge_id: j.id, company_id: e.company_id })))), 'assignments')

  must(await db.from('notices').insert({ program_id: program.id, title: '1차 서류 접수 안내',
    body: '사업계획서(PDF)를 마감일까지 제출해 주세요. 블라인드 심사이므로 기업명·대표자명을 제외하고 작성합니다.' }), 'notice')

  console.log('시드 완료')
  console.log(`  관리자   admin@${DOMAIN}`)
  console.log(`  기업     company1~5@${DOMAIN}`)
  console.log(`  심사위원 judge1~3@${DOMAIN} (judge1 = 위원장)`)
  console.log(`  비밀번호 ${PASSWORD}`)
  console.log(`  관리자 id ${adminId}, 프로그램 id ${program.id}`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
