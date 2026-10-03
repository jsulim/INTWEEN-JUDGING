# 개발 노트 (구현 규약)

원본 요구사항: [SPEC.md](./SPEC.md). 화면 ID(P/C/J/A-xx)는 아래 URL과 1:1로 대응한다.

## 구조

```
judging/
  app/                 Next.js App Router (화면 + app/api Route Handler)
  components/ui        Button·Input·Card·Badge·Table 등 공용 UI (shadcn 스타일, 브랜드 테마 변수)
  components/          AppShell(헤더·내비·30분 자동 로그아웃), StatusBadges, ProgramNav …
  lib/types.ts         DB 행 타입
  lib/scoring.ts       최종 점수 산정 (과락→집계/정규화/최고·최저 제외→가감점→동점) — 순수 함수
  lib/format.ts        날짜(KST)·D-day·상태 라벨
  lib/api.ts           클라이언트 → Route Handler fetch 헬퍼
  lib/supabase/        client.ts(브라우저) · server.ts(supabaseServer=RLS, supabaseAdmin=서비스롤)
  lib/server/          auth(requireRole/requireApi/handle) · n8n(emitEvent) · crypto · storage · pdf · stage-data
  supabase/migrations  스키마·RLS·뷰·트리거 (npm run test:db 로 로컬 PG 검증)
```

## URL ↔ 화면 ID

| 영역 | URL | ID |
|---|---|---|
| 공통 | `/login` `/invite` `/reset-password` `/me` `/mfa`(관리자 OTP) | P-01~04 |
| 기업 | `/c` 대시보드 · `/c/company` · `/c/submit` · `/c/submit/[stageId]` · `/c/results` · `/c/notices` · `/c/apply` · `/c/appeals` | C-01~07 |
| 심사위원 | `/j/consent` · `/j` · `/j/s/[stageId]` 목록 · `/j/s/[stageId]/c/[companyId]` 열람+평가 · `/j/s/[stageId]/summary` · `/j/s/[stageId]/live` · `/j/s/[stageId]/submit` · `/j/payment` | J-01~08 |
| 관리자 | `/a` 통합 · `/a/programs` · `/a/p/[id]` 대시보드 · `/a/p/[id]/stages` · `criteria` · `companies` · `judges` · `assignments` · `results` · `export` · `consents` · `eligibility` · `presentations` · `appeals` · `payments` · `notices` · `settings`(신청서 필드) · `/a/audit` · `/a/pool` | A-01~16 |

심사위원 화면은 `app/j/(signed)/` 아래에 두면 동의서 미서명 시 `/j/consent`로 강제 이동된다(Q3).

## 데이터 접근 규칙 (RLS)

- 단순 조회·저장은 **로그인 사용자 클라이언트**(`supabaseServer()` 서버 컴포넌트 / `supabaseBrowser()` 클라이언트)로. RLS가 권한을 강제한다.
- 권한 상승·외부 연동만 Route Handler에서 `requireApi(role)`로 호출자 확인 **후** `supabaseAdmin()`(서비스 롤) 사용.
- 심사위원은 `companies`·`submissions`를 직접 읽지 않는다 → 뷰 `v_companies_blind`, `v_judge_submissions` (블라인드 마스킹, 배정·서명·이해충돌 반영).
- 기업은 `stage_entries`를 직접 읽지 않는다 → 뷰 `v_my_entries` (결과는 결과공개 단계만).
- 점수 쓰기는 `scores` upsert (`onConflict: 'assignment_id,criterion_id'`). DB가 배점 초과·확정 후 수정·최종 제출 후 수정을 거부한다.
- 이해충돌 신고: `rpc('report_conflict', { p_assignment_id, p_reason })`.
- 앱 이벤트 로그(열람·로그인·재오픈 사유 등): `rpc('log_event', { p_action, p_table, p_row, p_meta })`.
- 모든 테이블 변경은 트리거가 `audit_logs`에 기록한다 (누가·언제·이전→새 값).
- 순위·최종 점수는 `lib/server/stage-data.ts`의 `loadStageResults()` 하나로 계산 (A-01·A-08·확정·엑셀이 일치, Q10).

## Storage

- 비공개 버킷 `program-files`. 직접 접근 정책 없음 → 서버가 발급한 서명 URL(10분)로만 업로드·열람.
- 제출 파일 경로: `{program_id}/{stage_id}/{company_id}/{file_type}_v{n}.{ext}` (`submissionPath()`).
- 업로드: 서버 `signedUploadUrl(path)` → 클라이언트 `supabaseBrowser().storage.from('program-files').uploadToSignedUrl(path, token, file)` → 서버에 완료 통보.

## 단계 상태

`ready(준비) → submitting(접수중) → evaluating(평가중) → locked(확정) → published(결과공개)`.
Cron(`auto_advance_stages`, 5분)이 일정에 따라 준비→접수중→평가중 자동 전환. 확정·공개는 관리자.

## UI 규약 (11장)

- 브랜드: Primary #578C76 / Accent #35AF8B(완료·통과·진행률) / Highlight #F1B853(마감 임박·미평가·1위). Tailwind 토큰 `primary` `accent` `highlight` `danger` `bg` `fg` `muted` `line` `card`.
- 폰트 Pretendard, 본문 15px, 점수 숫자는 `tabular` 클래스.
- 문구는 짧고 객관적으로: '제출 완료', '자동 저장됨', '마감 2일 전'.
- 기업 화면은 모바일 반응형 필수. J-04는 데스크톱 좌 65% 뷰어 / 우 35% 평가표, 태블릿은 상하.
- 페이지 패턴: 서버 컴포넌트(page.tsx)가 데이터 로드 → 클라이언트 컴포넌트가 폼·상호작용 → 저장 후 `router.refresh()`.
