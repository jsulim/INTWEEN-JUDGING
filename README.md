# INTWEEN 심사 관리 플랫폼

해커톤·기업심사를 한 플랫폼에서 운영한다. 기업은 단계별 자료를 제출하고, 심사위원은 동의서 서명 후
자료 열람·평가를 하며, 관리자는 전 과정을 실시간으로 본다.

- 운영 사이트: https://intween-judging.vercel.app Vello·입찰 대응 센터와 분리된 **독립 사이트**.

- 요구사항 원문: [`docs/SPEC.md`](docs/SPEC.md) (사이트맵·개발 가이드)
- 구현 규약·URL↔화면 ID 대응: [`docs/DEV_NOTES.md`](docs/DEV_NOTES.md)
- 개발 인수인계서(운영 상태·코드 구조·남은 작업): [`docs/HANDOVER.md`](docs/HANDOVER.md)

## 기술 스택

| 영역 | 선택 |
|---|---|
| 프론트·서버 | Next.js 14 (App Router), TypeScript |
| UI | Tailwind + shadcn 스타일 컴포넌트(`components/ui`), Pretendard, 브랜드 컬러 테마 변수 |
| 백엔드 | Supabase — Auth(초대·비밀번호·TOTP), Postgres(RLS), Storage(비공개 버킷), Realtime, Cron |
| 문서 | PDF.js(열람·워터마크), pdf-lib(서명 PDF·평가표·심사평), exceljs(결과표), jszip(서명본·증빙 패키지) |
| 서명 | signature_pad (모두싸인 등으로 교체 가능하도록 서버 API 분리) |
| 알림 | n8n 웹훅 (`N8N_WEBHOOK_URL`) — 메일·카카오·슬랙 발송은 n8n에서 |

## 시작하기

### 1. Supabase 프로젝트

1. Supabase 프로젝트 생성 (무료 플랜으로 시범 운영 가능)
2. 마이그레이션 적용 — CLI: `npx supabase link --project-ref <ref> && npx supabase db push`
   또는 SQL Editor에서 `supabase/migrations/*.sql` 을 파일명 순서대로 실행
3. **Authentication 설정**
   - Sign-ups: **비활성화** (계정은 관리자 초대로만 생성)
   - MFA: TOTP 활성화 (관리자 2단계 인증)
   - URL Configuration: Site URL = 배포 주소, Redirect URLs 에 `https://<도메인>/auth/confirm` 추가
   - Email Templates: Invite / Reset Password 링크를 아래로 변경 (`supabase/templates/*.html` 참고)
     - 초대: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/invite`
     - 재설정: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password/update`
4. Cron: `pg_cron` 확장이 켜져 있으면 마이그레이션이 5분 주기 단계 자동 전환 작업을 등록한다
   (Database → Extensions 에서 pg_cron 활성화 후 3번 마이그레이션 재실행)

### 2. 환경변수

`.env.example` 을 `.env.local` 로 복사해 채운다. Vercel 은 Project Settings → Environment Variables.

| 변수 | 설명 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase API |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 (초대, 서명 URL 발급) |
| `NEXT_PUBLIC_SITE_URL` | 초대·재설정 메일 리다이렉트 기준 주소 |
| `PAYMENT_ENC_KEY` | 정산 정보 암호화 키 (`openssl rand -base64 32`) — 분실 시 복호화 불가 |
| `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET` | 이벤트 웹훅 (비우면 전송 생략) |
| `PPTX_CONVERT_URL` | PPTX→PDF 변환 서비스 (Gotenberg `/forms/libreoffice/convert` 호환, 선택) |
| `CRON_SECRET` | `/api/cron/*` 호출 인증 (Vercel Cron 이 자동 전송) |
| `REQUIRE_ADMIN_MFA` | 관리자 OTP 강제 (기본 true. 모의 심사 테스트 때만 false) |

### 3. 실행

```bash
npm install
npm run dev            # http://localhost:3000
npm run seed           # 모의 심사 데이터: 가상 기업 5, 심사위원 3, 관리자 1
```

시드 계정: `admin@mock.intween.test`, `company1~5@…`, `judge1~3@…` / 비밀번호 `Intween!2026`
(`SEED_PASSWORD`, `SEED_EMAIL_DOMAIN` 으로 변경 가능).

### 4. Vercel 배포

Vercel → Add New → Project → `mindleader9/intween-judging` import → 환경변수 입력 → Deploy. (Root Directory 는 기본값 그대로)
`vercel.json` 의 Cron(일일 리마인드, 보유기간 경과 자동 파기)이 함께 등록된다.

## 테스트

```bash
npm test          # 점수 산정 단위 테스트 (과락·정규화·최고/최저 제외·가감점 상한·동점)
npm run test:db   # 로컬 Postgres 16 으로 마이그레이션 적용 + RLS·트리거 QA 시나리오 검증
npm run typecheck
```

`test:db` 가 확인하는 QA 항목: Q1(타 기업 파일 차단), Q2(접수기간 외 업로드 거부), Q3/Q4(미서명·미배정 열람 차단),
Q6(배점 초과 차단), Q7(확정 후 수정 거부), Q12(블라인드 마스킹), Q16(이의신청 기간), 감사로그 이전→새 값 기록,
이해충돌 신고 즉시 제외, 프로그램 복제, Cron 자동 전환.

## 보안 설계 요약

- 권한은 화면이 아니라 **DB(RLS)** 에서 강제. 관리자 판별 `is_admin()`, 서명 여부 `has_signed_all()`.
- 심사위원은 기업·파일을 마스킹 뷰(`v_companies_blind`, `v_judge_submissions`)로만 조회. 타 심사위원 점수 비노출.
- 파일은 비공개 버킷 + 서버 발급 서명 URL(10분). 열람 시 감사로그 기록, 뷰어 워터마크(이름·시각), 다운로드 버튼 없음.
- 모든 변경은 트리거로 `audit_logs` 에 기록 (누가·언제·이전→새 값·IP). 감사로그는 수정·삭제 불가.
- 동의서·평가표 서명 PDF 는 SHA-256 해시 저장, 재서명 불가(양식 버전 변경 시 재서명 요청).
- 정산 정보(계좌·주민번호)는 AES-256-GCM 으로 암호화 저장, 정산 권한자(`profiles.can_pay`)만 복호화 + 열람 로그.
- 관리자 TOTP 2단계 인증, 30분 무동작 자동 로그아웃, 공개 회원가입 차단.

## 알려진 제약

- **PDF 용량**: pdf-lib(fontkit)의 폰트 서브셋이 Pretendard 한글 글리프를 누락시켜 전체 폰트를 임베드한다 → 서명·평가표·심사평 PDF 1건당 약 1.2MB. 서명본 ZIP·증빙 패키지는 그만큼 커진다.
- **PPTX→PDF 변환**: `PPTX_CONVERT_URL`(Gotenberg 등)이 없으면 변환하지 않으며, 심사위원 뷰어에는 'PDF 변환본 없음' 안내가 표시된다.
- **Realtime**: 관리자 대시보드·발표 현장 모드는 Supabase Realtime 으로 갱신되며, 연결이 안 되면 발표 모드는 10초 폴링으로 대체된다.
- **모두싸인 연동**: 서명 API(`/api/consent/sign`, `/api/eval/submit`)가 분리돼 있어 교체 가능하지만 연동 자체는 미구현.
