import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/** 서버 컴포넌트·Route Handler용 클라이언트 — 로그인 사용자 권한(RLS) 그대로 */
export function supabaseServer() {
  const cookieStore = cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: list => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // 서버 컴포넌트에서는 쿠키 쓰기 불가 — middleware 가 세션을 갱신한다
        }
      },
    },
  })
}

/**
 * 서비스 롤 클라이언트 — RLS 우회. 권한 상승이 꼭 필요한 서버 작업(초대, 서명 URL 발급, 검증 후 기록)에만 쓴다.
 * 호출 전에 반드시 requireApi() 등으로 호출자 권한을 확인할 것.
 */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다.')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
