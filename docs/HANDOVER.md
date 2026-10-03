# 개발 인수인계서 — INTWEEN 심사 관리 플랫폼

작성일 2026-10-02 · 저장소 `mindleader9/intween-judging` (`main`)

이 문서는 플랫폼을 이어받는 개발자를 위한 것이다. 요구사항 원문은 [SPEC.md](./SPEC.md), 구현 규약과
URL↔화면 ID 대응은 [DEV_NOTES.md](./DEV_NOTES.md), 설치·배포 절차는 [../README.md](../README.md)에 있다.

## 1. 한눈에 보기

| 항목 | 내용 |
|---|---|
| 목적 | 해커톤·기업심사 운영: 기업 제출 → 심사위원 동의서 서명·블라인드 평가 → 관리자 실시간 집계·확정·내보내기 |
| 스택 | Next.js 14 App Router + TypeScript, Tailwind, Supabase(Auth·Postgres RLS·Storage·Realtime·pg_cron) |
| 규모 | 화면 43개(page.tsx), Route Handler 32개, TS/TSX 160개 파일 약 14,300줄, SQL 마이그레이션 5개 |
| 운영 주소 | https://intween-judging.vercel.app (Vercel Hobby) |
| DB | Supabase 프로젝트 `ddbpacbftccnawntvrif` (Seoul, Free) |
| 계정 정책 | 초대제. 공개 회원가입 꺼짐. 역할은 `profiles.role` (admin / company / judge) |

## 2. 현재 운영 상태 (인계 시점)

완료
- Supabase: 마이그레이션 001~040 적용(SQL Editor로 일괄 실행), 050(grant)은 SQL Editor에서 수동 실행
- Supabase Auth: 회원가입 끔, Site URL·Redirect URL 등록, 초대·재설정 메일 템플릿 변경
- Vercel: 환경변수 7종 등록(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`,
  `REQUIRE_ADMIN_MFA=false`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYMENT_ENC_KEY`, `CRON_SECRET`), main 브랜치 자동 배포
- 수퍼관리자 1명 생성(`profiles.can_pay = true`)

미완료 (운영 전 필요)
1. **메일 발송(SMTP)** — Supabase 기본 메일은 팀원 주소만·시간당 소량 발송. Resend 도입 예정
   (도메인 `intw.co.kr` DNS 인증 → Supabase SMTP: `smtp.resend.com:465`, user `resend`, pw API 키,
   Rate limit 상향). 이것 없이는 기업·심사위원 초대 메일이 나가지 않는다.
2. **관리자 OTP** — Supabase Auth MFA(TOTP) 활성화 후 Vercel `REQUIRE_ADMIN_MFA=true` + 재배포
3. **모의 심사** — 내부 직원으로 1차→2차 전 과정 1회 (SPEC 12장 게이트)
4. 선택: `N8N_WEBHOOK_URL`/`N8N_WEBHOOK_SECRET`(알림), `PPTX_CONVERT_URL`(Gotenberg)

비밀값(키·비밀번호)은 이 문서에 없다. 인계 시 담당자에게 별도 전달할 것. **`PAYMENT_ENC_KEY`를 잃으면
정산 정보(계좌·주민번호) 복호화가 불가능**하다.

## 3. 코드 구조

```
app/
  login, invite, reset-password, me, mfa, auth/confirm    공통 P-01~04 + 관리자 OTP
  c/                참가 기업 C-01~07 (layout 에서 role=company 강제)
  j/consent         J-01 동의서 서명 (게이트 밖)
  j/(signed)/       J-02~08 — layout 이 has_signed_all 검사, 미서명 시 /j/consent 로
  a/                관리자 (layout 에서 role=admin + MFA aal2 강제), a/p/[id]/* 프로그램 하위 화면
  api/              Route Handler (권한 상승·외부 연동만. 단순 CRUD 는 클라이언트+RLS)
components/ui       Button·Card·Table 등 공용 UI (shadcn 스타일), 테마 변수는 app/globals.css
components/{company,judge,admin/setup,admin/results}   영역별 클라이언트 컴포넌트
lib/scoring.ts      최종 점수 산정 순수 함수 (과락→원점수/정규화·최고최저 제외→가감점 상한→동점)
lib/server/         auth(requireRole/requireApi/handle), stage-data(loadStageResults), export, pdf*,
                    storage(서명 URL·경로 규칙), crypto(AES-256-GCM), n8n(emitEvent)
supabase/migrations 001 스키마 · 002 함수·트리거·뷰·RLS · 003 Storage·Realtime·Cron · 040 감사로그 뷰 · 050 grant
scripts/            seed.mjs(모의 데이터), test-db.sh(로컬 PG 로 RLS 검증)
tests/              scoring 단위 테스트, db/rls_test.sql
```

핵심 설계 원칙
- **권한은 DB(RLS)에서 강제**한다. 화면 숨김은 보조. 관리자 판별 `is_admin()`, 서명 여부 `has_signed_all()`.
- 심사위원은 `companies`/`submissions`를 직접 못 읽는다 → 마스킹 뷰 `v_companies_blind`, `v_judge_submissions`.
  기업은 `stage_entries` 대신 `v_my_entries`(결과공개 단계만 결과 노출).
- 점수·순위는 `loadStageResults()` 하나로 계산 → 대시보드·결과·확정 스냅샷·엑셀이 같은 숫자(QA Q10).
- 모든 변경은 트리거 `audit_row()`가 `audit_logs`에 기록. 앱 이벤트(로그인·열람·재오픈)는 `rpc('log_event')`.
- 파일은 비공개 버킷 `program-files` + 서버 발급 서명 URL(10분). 경로 `{program}/{stage}/{company}/{type}_v{n}.ext`.
- 단계 상태 `ready → submitting → evaluating → locked → published`. pg_cron 이 5분마다 앞의 두 전환을 자동 처리.

## 4. 로컬 개발

```bash
npm install
cp .env.example .env.local      # Supabase 개발용 프로젝트 값 입력 (운영 DB 사용 금지)
npm run dev
npm test                        # 점수 산정 단위 테스트 10건
npm run test:db                 # 로컬 Postgres 16 필요. 마이그레이션 + RLS 시나리오 36건
npm run typecheck && npm run build
npm run seed                    # 개발 DB 에 가상 기업 5·심사위원 3·관리자 1
```

개발용 Supabase 프로젝트를 따로 만들어 쓰는 것을 권장한다(무료 플랜 2개). DB 변경은 반드시
`supabase/migrations/`에 새 파일로 추가하고 `npm run test:db`로 검증한 뒤 운영 SQL Editor 에 적용한다.

## 5. 검증 이력

- 단위 테스트 10건, DB RLS 시나리오 36건 통과 (Q1·Q2·Q3·Q4·Q6·Q7·Q8·Q11·Q12·Q14·Q16 포함)
- 로컬 미니 스택(Postgres + GoTrue + PostgREST + 가짜 Storage)에서 Playwright 로 전 과정 E2E:
  기업 5곳 업로드(모바일) → 심사위원 3명 동의서 9건 서명 → 블라인드 평가·자동저장·배점 초과 차단 →
  대시보드 순위·과락 → 확정 경고 → 엑셀·심사평 PDF·서명본 ZIP·증빙 패키지 → 통과 확정 → 결과 공개
- **실제 Supabase 에서 미검증**: Realtime 갱신, 초대·재설정 메일, TOTP, Storage 정책 실제 동작, pg_cron 실행

## 6. 알려진 제약·개선 후보

| 구분 | 내용 | 제안 |
|---|---|---|
| PDF 용량 | fontkit 서브셋이 Pretendard 한글을 누락 → 전체 임베드, PDF 1건 약 1.2MB. 굵게는 덧그리기 | 한글 서브셋 폰트 사전 생성(fonttools)으로 교체 |
| PPTX | 변환 서비스 없으면 PDF 미생성, 뷰어에서 열람 불가 안내. 변환은 요청 안에서 동기 실행(최대 120초) | Gotenberg 배포 또는 업로드 후 비동기 큐 |
| 가점 증빙 | 기업이 `entry_bonuses`를 브라우저에서 직접 insert → `evidence_path` 서버 검증 없음(관리자만 열람) | API 경유로 변경 |
| 위원장 의견 | 확인 서명 후 수정 잠금이 화면에서만 적용 (`chair_rw` 정책은 수정 허용) | RLS 에 `confirmed_at is null` 조건 추가 |
| 초대 상태 표시 | 기업·심사위원 목록에서 사용자별 `auth.admin.getUserById` 호출 | 수백 명 규모면 profiles 에 상태 캐시 |
| Realtime | 대시보드 `scores` 구독에 단계 필터 없음(500ms 배치로 영향 작음) | 필터 추가 |
| 린트 | ESLint 설정 파일 없음(`next lint` 초기 설정 프롬프트) | `.eslintrc.json` 추가 |
| 모두싸인 | 서명 API 를 분리해 두었으나 연동 없음 | 공공 위탁 시 임베디드 API 연동 |
| 운영 비용 | 현재 Supabase Free / Vercel Hobby. Hobby 는 상업적 사용 불가 정책 | 실운영 시 Supabase Pro($25) + Vercel Pro($20) |

## 7. 인계 체크리스트

- [ ] GitHub 저장소 `mindleader9/intween-judging` 협업자 초대 (Settings → Collaborators)
- [ ] Vercel 프로젝트 멤버 추가 또는 팀 이전
- [ ] Supabase 조직 멤버 초대 (Organization → Team)
- [ ] 비밀값 전달: service_role 키, `PAYMENT_ENC_KEY`, `CRON_SECRET`, DB 비밀번호 (안전한 채널로)
- [ ] Resend 계정·도메인 DNS 접근 권한
- [ ] 이 문서 2장의 미완료 항목 담당자 지정
