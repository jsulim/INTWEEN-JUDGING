'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import AuthFrame from '@/components/AuthFrame'
import { Alert, Button, Field, Input } from '@/components/ui'

// 관리자 2단계 인증(OTP). 인증 앱(Google Authenticator 등) TOTP 등록 → 6자리 코드 확인
export default function MfaPage() {
  const router = useRouter()
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser()
      const { data } = await supabase.auth.mfa.listFactors()
      const verified = data?.totp?.find(f => f.status === 'verified')
      if (verified) {
        setFactorId(verified.id)
      } else {
        // 미완료 등록 정리 후 새로 등록
        for (const f of data?.all ?? []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
        const { data: en, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'INTWEEN 관리자' })
        if (error) setError('OTP 등록을 시작하지 못했습니다: ' + error.message)
        else {
          setFactorId(en.id)
          setQr(en.totp.qr_code)
          setSecret(en.totp.secret)
        }
      }
      setLoading(false)
    })()
  }, [])

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    if (!factorId) return
    const { error } = await supabaseBrowser().auth.mfa.challengeAndVerify({ factorId, code: code.trim() })
    if (error) return setError('코드가 올바르지 않습니다.')
    await supabaseBrowser().rpc('log_event', { p_action: 'mfa_verified' })
    router.replace('/a')
    router.refresh()
  }

  return (
    <AuthFrame title="관리자 2단계 인증" subtitle={qr ? '인증 앱으로 QR 코드를 스캔한 뒤 6자리 코드를 입력하세요.' : '인증 앱의 6자리 코드를 입력하세요.'}>
      {loading ? <p className="text-muted">불러오는 중…</p> : (
        <form onSubmit={verify} className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          {qr && (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="OTP QR 코드" className="mx-auto h-44 w-44" />
              <p className="mt-2 break-all text-xs text-muted">수동 입력 키: {secret}</p>
            </div>
          )}
          <Field label="인증 코드"><Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value)} required /></Field>
          <Button type="submit" size="lg" className="w-full">확인</Button>
        </form>
      )}
    </AuthFrame>
  )
}
