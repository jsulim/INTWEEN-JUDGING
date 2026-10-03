import 'server-only'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase/server'
import { emitEvent } from '@/lib/server/n8n'
import { ApiError } from '@/lib/server/auth'
import type { Profile, Role } from '@/lib/types'

// A-05·A-06 초대: auth 사용자 생성(서비스 롤) + profiles/companies/judges 행(관리자 사용자 클라이언트 → 감사로그 actor 기록)

export interface InviteCtx {
  supabase: SupabaseClient // 관리자 사용자 클라이언트 (RLS admin_all)
  site: string
}

const ROLE_LABEL: Record<Role, string> = { admin: '관리자', company: '기업', judge: '심사위원' }
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normEmail(v: unknown) {
  return String(v ?? '').trim().toLowerCase()
}

async function findUserByEmail(email: string): Promise<User | null> {
  const admin = supabaseAdmin()
  // 1) profiles.email 로 빠르게 조회
  const { data: prof } = await admin.from('profiles').select('user_id').eq('email', email).maybeSingle()
  if (prof?.user_id) {
    const { data } = await admin.auth.admin.getUserById(prof.user_id)
    if (data?.user) return data.user
  }
  // 2) auth 사용자 목록 페이징
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const hit = data.users.find(u => (u.email ?? '').toLowerCase() === email)
    if (hit) return hit
    if (data.users.length < 1000) break
  }
  return null
}

/** 초대 메일 발송(신규) 또는 기존 사용자 재사용 */
export async function ensureUser(ctx: InviteCtx, email: string, name: string) {
  const admin = supabaseAdmin()
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${ctx.site}/auth/confirm?next=/invite`,
    data: { name },
  })
  if (!error && data?.user) return { userId: data.user.id, existed: false, confirmed: false }
  const existing = await findUserByEmail(email)
  if (!existing) throw new ApiError(400, `초대 메일을 보내지 못했습니다: ${error?.message ?? '알 수 없는 오류'}`)
  return { userId: existing.id, existed: true, confirmed: !!(existing.email_confirmed_at || existing.last_sign_in_at) }
}

/** 역할 검사 후 profiles 행 생성·보완 */
export async function ensureProfile(ctx: InviteCtx, userId: string, role: Role, name: string, email: string, org?: string | null) {
  const { data: cur, error } = await ctx.supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  const p = cur as Profile | null
  if (p) {
    if (p.role !== role) throw new ApiError(409, `이미 ${ROLE_LABEL[p.role]} 계정으로 등록된 이메일입니다.`)
    const patch: Partial<Profile> = {}
    if (!p.name && name) patch.name = name
    if (!p.email) patch.email = email
    if (!p.org && org) patch.org = org
    if (Object.keys(patch).length) await ctx.supabase.from('profiles').update(patch).eq('id', p.id)
    return p
  }
  const { data: created, error: e2 } = await ctx.supabase.from('profiles')
    .insert({ user_id: userId, role, name, email, org: org ?? null }).select('*').single()
  if (e2) throw e2
  return created as Profile
}

async function programInfo(ctx: InviteCtx, programId: string) {
  const [{ data: program }, { data: stages }] = await Promise.all([
    ctx.supabase.from('programs').select('id, title, type').eq('id', programId).maybeSingle(),
    ctx.supabase.from('stages').select('id, order_no, name, submit_start, submit_end, eval_start, eval_end')
      .eq('program_id', programId).order('order_no'),
  ])
  if (!program) throw new ApiError(404, '프로그램을 찾을 수 없습니다.')
  return { program, stages: stages ?? [] }
}

async function ensureFirstStageEntry(ctx: InviteCtx, programId: string, companyId: string) {
  const { data: first } = await ctx.supabase.from('stages').select('id').eq('program_id', programId)
    .order('order_no').limit(1).maybeSingle()
  if (!first) return
  const { error } = await ctx.supabase.from('stage_entries')
    .upsert({ stage_id: first.id, company_id: companyId }, { onConflict: 'stage_id,company_id', ignoreDuplicates: true })
  if (error) throw error
}

export interface CompanyInput {
  name: string
  biz_no?: string | null
  ceo?: string | null
  field?: string | null
}

export type InviteStatus = 'invited' | 'created' | 'exists' | 'error'

/**
 * 기업 등록(+1단계 참가 행) + 선택 시 초대.
 * company_id 를 주면 기존 기업에 대해 (재)초대만 한다.
 */
export async function inviteCompany(ctx: InviteCtx, p: {
  programId: string
  companyId?: string
  company?: CompanyInput
  email?: string
  send: boolean
}): Promise<{ status: InviteStatus; company_id?: string; message: string }> {
  const info = await programInfo(ctx, p.programId)
  let email = normEmail(p.email)
  if (email && !EMAIL_RE.test(email)) throw new ApiError(400, '이메일 형식이 올바르지 않습니다.')

  let companyId = p.companyId
  let companyName = p.company?.name?.trim() ?? ''
  let ceo = p.company?.ceo ?? null
  let status: InviteStatus = 'created'

  if (companyId) {
    const { data: c } = await ctx.supabase.from('companies').select('*').eq('id', companyId).eq('program_id', p.programId).maybeSingle()
    if (!c) throw new ApiError(404, '기업을 찾을 수 없습니다.')
    companyName = c.name
    ceo = c.ceo
    email = email || normEmail(c.contact_email)
    if (email && email !== normEmail(c.contact_email)) await ctx.supabase.from('companies').update({ contact_email: email }).eq('id', c.id)
    status = 'exists'
  } else {
    if (!companyName) throw new ApiError(400, '기업명을 입력해 주세요.')
    const bizNo = p.company?.biz_no?.trim() || null
    // 중복 확인: 같은 프로그램의 사업자번호 또는 이메일
    let dup: { id: string; owner_user_id: string | null } | null = null
    if (bizNo) {
      const { data } = await ctx.supabase.from('companies').select('id, owner_user_id').eq('program_id', p.programId).eq('biz_no', bizNo).maybeSingle()
      dup = data
    }
    if (!dup && email) {
      const { data } = await ctx.supabase.from('companies').select('id, owner_user_id').eq('program_id', p.programId).eq('contact_email', email).limit(1).maybeSingle()
      dup = data
    }
    if (dup) {
      companyId = dup.id
      status = 'exists'
      if (dup.owner_user_id || !p.send || !email) {
        await ensureFirstStageEntry(ctx, p.programId, dup.id)
        return { status: 'exists', company_id: dup.id, message: '이미 등록된 기업입니다.' }
      }
    } else {
      const { data: created, error } = await ctx.supabase.from('companies').insert({
        program_id: p.programId,
        name: companyName,
        biz_no: bizNo,
        ceo: p.company?.ceo?.trim() || null,
        field: p.company?.field?.trim() || null,
        contact_email: email || null,
      }).select('id').single()
      if (error) throw error
      companyId = created.id as string
    }
    await ensureFirstStageEntry(ctx, p.programId, companyId!)
  }

  if (!p.send || !email) {
    return { status, company_id: companyId, message: email ? '등록됨 (초대 미발송)' : '등록됨 (이메일 없음)' }
  }

  const name = ceo || companyName
  const u = await ensureUser(ctx, email, name)
  await ensureProfile(ctx, u.userId, 'company', name, email)
  const { error: e3 } = await ctx.supabase.from('companies').update({ owner_user_id: u.userId, contact_email: email }).eq('id', companyId!)
  if (e3) throw e3
  await emitEvent('invite.created', {
    role: 'company', email, name, company: companyName,
    program: { id: info.program.id, title: info.program.title },
    schedule: info.stages,
    login_url: `${ctx.site}/login`,
    existing_user: u.existed,
  })
  return { status: 'invited', company_id: companyId, message: u.existed ? '기존 계정 연결 · 안내 발송' : '초대 메일 발송' }
}

export interface JudgeInput {
  email: string
  name: string
  affiliation?: string | null
  expertise?: string | null
  is_chair?: boolean
  pool_id?: string | null
}

export async function inviteJudge(ctx: InviteCtx, programId: string, j: JudgeInput) {
  const info = await programInfo(ctx, programId)
  const email = normEmail(j.email)
  if (!EMAIL_RE.test(email)) throw new ApiError(400, '이메일 형식이 올바르지 않습니다.')
  const name = j.name.trim()
  if (!name) throw new ApiError(400, '이름을 입력해 주세요.')
  const u = await ensureUser(ctx, email, name)
  await ensureProfile(ctx, u.userId, 'judge', name, email, j.affiliation)
  const { data: judge, error } = await ctx.supabase.from('judges').upsert({
    program_id: programId,
    user_id: u.userId,
    affiliation: j.affiliation?.trim() || null,
    expertise: j.expertise?.trim() || null,
    is_chair: !!j.is_chair,
  }, { onConflict: 'program_id,user_id' }).select('id').single()
  if (error) throw error
  if (j.is_chair) {
    await ctx.supabase.from('judges').update({ is_chair: false }).eq('program_id', programId).neq('id', judge.id).eq('is_chair', true)
  }
  if (j.pool_id) {
    await ctx.supabase.from('judge_pool').update({ user_id: u.userId }).eq('id', j.pool_id).is('user_id', null)
  }
  await emitEvent('invite.created', {
    role: 'judge', email, name,
    program: { id: info.program.id, title: info.program.title },
    schedule: info.stages,
    login_url: `${ctx.site}/login`,
    existing_user: u.existed,
  })
  return { status: 'invited' as const, judge_id: judge.id as string, message: u.existed ? '기존 계정 연결 · 안내 발송' : '초대 메일 발송' }
}

/** 기존 심사위원 재초대 */
export async function reinviteJudge(ctx: InviteCtx, programId: string, judgeId: string) {
  const { data: judge } = await ctx.supabase.from('judges').select('*').eq('id', judgeId).eq('program_id', programId).maybeSingle()
  if (!judge) throw new ApiError(404, '심사위원을 찾을 수 없습니다.')
  const { data: prof } = await ctx.supabase.from('profiles').select('*').eq('user_id', judge.user_id).maybeSingle()
  if (!prof?.email) throw new ApiError(400, '이메일 정보가 없습니다.')
  return inviteJudge(ctx, programId, {
    email: prof.email, name: prof.name, affiliation: judge.affiliation, expertise: judge.expertise, is_chair: judge.is_chair,
  })
}
