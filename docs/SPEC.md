<!-- 원본: 인트윈 심사 관리 플랫폼 사이트맵·개발 가이드 (docx). 다이어그램은 텍스트로 옮기지 않음 -->
## 인트윈 심사 관리 플랫폼 사이트맵 · 개발 가이드
Oct 2, 2026 · @인트윈
### 1. 개요
해커톤·기업심사를 한 플랫폼에서 운영한다. 기업은 단계별 자료를 제출하고, 심사위원은 동의서 서명 후 자료 열람·평가를 하며, 관리자는 전 과정을 실시간으로 본다. 1차 MVP는 4주 개발을 목표로 하며, 4-1의 MVP 요소를 포함하면 5주로 잡는다.
| 역할 | 핵심 행동 | 접근 범위 |
|---|---|---|
| 참가 기업 | 로그인, 사업계획서·발표자료 업로드, 결과 확인 | 본인 기업 데이터만 |
| 심사위원 | 동의서 서명, 배정 기업 자료 열람, 항목별 점수·심사평 입력·수정 | 배정된 기업 + 본인 평가만 |
| 관리자 | 프로그램·단계·평가항목 설정, 배정, 실시간 모니터링, 확정·내보내기 | 전체 |

핵심 원칙
- 하나의 프로그램(해커톤, 지원사업 심사 등)에 여러 단계(1차 서류, 2차 발표, 필요 시 3차)를 둔다. 단계 수는 고정하지 않는다.
- 평가항목·배점은 단계별로 관리자가 지정한다.
- 심사위원 간 점수는 서로 보이지 않는다(블라인드). 관리자만 전체를 본다.
- 점수·심사평은 단계 마감 전까지 실시간 수정 가능하며, 관리자 확정 시 잠긴다.
- 모든 수정은 감사로그로 남긴다(누가, 언제, 이전 값 → 새 값).
### 2. 사이트맵

사이트맵 · 4개 영역 35개 화면
로그인 후 profiles.role에 따라 /c, /j, /a 홈으로 보낸다. 관리자 경로의 /a/p/[id]는 프로그램 단위 하위 화면이며, 화면 ID는 3장 기능 명세와 1:1로 대응한다.
### 3. 화면별 기능 명세
화면 ID는 사이트맵의 URL과 1:1로 대응한다. 권한 열의 C=기업, J=심사위원, A=관리자.
#### 3-1. 공통
| ID | 화면 | 주요 기능 | 권한 |
|---|---|---|---|
| P-01 | 로그인 | 이메일+비밀번호 로그인, 역할에 따라 각 홈으로 리다이렉트 | 전체 |
| P-02 | 초대 수락·비밀번호 설정 | 관리자가 보낸 초대 링크로 최초 비밀번호 설정 | 전체 |
| P-03 | 비밀번호 재설정 | 메일 링크 발송 | 전체 |
| P-04 | 내 정보 | 이름·연락처·소속 수정 | 전체 |

#### 3-2. 참가 기업
| ID | 화면 | 주요 기능 | 권한 |
|---|---|---|---|
| C-01 | 대시보드 | 참여 프로그램, 현재 단계, 마감 D-day, 제출 상태(미제출/제출완료) | C |
| C-02 | 기업 정보 | 기업명, 사업자번호, 대표자, 팀원, 분야 입력 | C |
| C-03 | 단계별 제출 | 단계가 '접수중'일 때만 업로드 가능. 단계별 요구 파일(사업계획서 PDF, 발표자료 PDF/PPTX) 슬롯, 재업로드 시 버전 보관, 제출 확인 메일 | C |
| C-04 | 결과 확인 | 관리자가 '결과 공개'한 단계만 통과/탈락 표시. 점수 공개 여부는 관리자 옵션 | C |
| C-05 | 공지사항 | 프로그램별 공지 열람 | C |
| C-06 | 신청서 작성 | 관리자가 정의한 신청 항목 입력, 자격요건 자가 체크, 가점 증빙 업로드, 보완 요청 시 재제출 | C |
| C-07 | 이의신청 | 결과 공개 후 정해진 기간 내 1회 신청, 처리 상태·회신 확인 | C |

#### 3-3. 심사위원
| ID | 화면 | 주요 기능 | 권한 |
|---|---|---|---|
| J-01 | 동의서 서명 | 개인정보 수집·이용 동의, 보안서약, 이해충돌 확인을 화면에서 손서명. 미서명 시 J-02 이하 접근 차단 | J |
| J-02 | 대시보드 | 배정 프로그램·단계, 평가 진행률(완료/전체), 마감 D-day | J |
| J-03 | 배정 기업 목록 | 기업별 평가 상태(미평가/임시저장/완료), 정렬·검색 | J |
| J-04 | 자료 열람 + 평가 | 좌측 PDF 뷰어(워터마크: 심사위원명·시각), 우측 평가표. 항목별 점수(배점 내), 항목별·종합 심사평, 자동 저장, 마감 전 수정 가능 | J |
| J-05 | 내 평가 요약 | 본인이 매긴 점수 일람(타 심사위원 점수는 비노출) | J |
| J-06 | 발표심사 현장 모드 | 발표 순서·타이머 표시, 현재 발표 기업 자동 전환, 질의응답 메모, 태블릿 최적화 | J |
| J-07 | 평가표 최종 제출 | 배정 기업 전원 평가 완료 시 일괄 제출, 평가표 PDF 서명. 제출 후 수정은 관리자 재오픈 필요 | J |
| J-08 | 수당 지급 정보 | 계좌·주민등록번호 입력(별도 동의, 암호화 저장), 지급 내역 확인 | J |

#### 3-4. 관리자
| ID | 화면 | 주요 기능 | 권한 |
|---|---|---|---|
| A-01 | 통합 대시보드 | 제출률, 심사위원별 진행률, 기업별 실시간 순위, 점수 편차 경고 | A |
| A-02 | 프로그램 관리 | 프로그램 생성·복제(이전 해커톤 템플릿 재사용) | A |
| A-03 | 단계 관리 | 단계 추가, 접수기간·평가기간 설정, 상태 변경 | A |
| A-04 | 평가항목 관리 | 항목명, 설명, 배점, 순서, 심사평 필수 여부. 평가 시작 후 수정 시 경고 | A |
| A-05 | 기업 관리 | 엑셀 일괄 등록, 초대 메일 발송, 제출 현황, 파일 일괄 다운로드 | A |
| A-06 | 심사위원 관리 | 등록·초대, 서명 현황, 서명본 PDF 다운로드 | A |
| A-07 | 배정 관리 | 전원 배정 / 개별 배정 / 이해충돌 제외 | A |
| A-08 | 평가 결과 | 기업×심사위원 점수 매트릭스, 심사평 전체 열람, 집계 방식 선택, 순위 확정(잠금), 통과자 선정 → 다음 단계로 이관 | A |
| A-09 | 내보내기 | 결과표 엑셀, 심사평 PDF, 서명본 일괄 ZIP | A |
| A-10 | 동의서 양식 관리 | 동의서 문구 편집, 버전 관리 | A |
| A-11 | 감사로그 | 점수 수정 이력, 로그인·열람 기록 | A |
| A-12 | 적격 검토 | 자격요건·필수서류 체크, 보완 요청(기한), 부적격 처리, 가점 증빙 승인 | A |
| A-13 | 발표 진행 관리 | 발표 순서 편성·랜덤 추첨, 현재 발표 기업 전환, 타이머 제어, 화상 링크 배포 | A |
| A-14 | 이의신청 처리 | 접수 목록, 검토 의견, 재심 여부 결정·회신 | A |
| A-15 | 심사위원 정산 | 수당 산정, 지급·원천징수 명세 엑셀(정산 권한자만 개인정보 복호화) | A |
| A-16 | 심사위원 풀 | 전문분야·참여 이력 관리, 다음 프로그램 섭외·배정에 재사용 | A |

### 4. 심사 프로세스와 상태 전이

단계 상태 전이 · 5개 상태
단계마다 stages.status가 이 다섯 상태를 순서대로 거친다. 자동 전환은 Supabase Cron이 5분마다 일정을 확인해 처리하고, 관리자는 언제든 수동으로 앞당기거나 되돌릴 수 있다(확정 해제는 감사로그 필수).
#### 4-1. 심사 운영 강화 요소
실제 심사에서 문제가 되는 공정성 시비, 감사 대응, 현장 진행, 수당 정산을 보완하기 위해 19개 요소를 추가한다. MVP는 1차 오픈에 포함하고, 2차는 첫 운영 후 추가한다.
| 구분 | 요소 | 내용 | 화면 | 적용 |
|---|---|---|---|---|
| 공정성 | 블라인드 심사 | 1차 서류심사에서 기업명·대표자명 마스킹(파일명 포함). 업로드 시 '식별 정보 제외' 안내 | J-04, A-03 | MVP |
| 공정성 | 평가 루브릭 | 항목별 점수 구간 설명(예: 기술성 25~30점 = 독자 기술 검증됨)을 평가표 옆에 표시해 심사위원 간 기준 차이 축소 | J-04, A-04 | MVP |
| 공정성 | 과락 기준 | 항목별 최저점(예: 배점의 40%) 미달 시 총점과 무관하게 탈락 | A-04, A-08 | MVP |
| 공정성 | 가점·감점 | 우대 조건 가점(여성·장애인기업, 지역 등), 서류 미비 감점. 증빙 확인 후 관리자 승인 시 반영 | C-06, A-08 | MVP |
| 공정성 | 이해충돌 상시 신고 | 사전 확인서 외에 평가 중에도 '이해관계 있음' 신고 → 해당 배정 자동 제외 | J-04 | MVP |
| 공정성 | 점수 정규화 | 심사위원별 점수 성향(후함/박함) 보정용 표준화 점수 옵션, 원점수와 병기 | A-08 | 2차 |
| 절차 | 0차 적격 검토 | 신청 자격·필수 서류 체크, 기한 지정 보완 요청, 부적격 처리 후 심사 대상 확정 | A-12 | MVP |
| 절차 | 신청서 커스텀 필드 | 프로그램마다 다른 신청 항목(매출, 업력, 인원 등)을 관리자가 폼으로 정의 | C-06, A-02 | MVP |
| 절차 | 평가표 최종 제출·서명 | 자동 저장과 별도로 '최종 제출'. 배정 기업 전원 평가 시에만 가능하고, 평가표 PDF에 심사위원 서명 | J-07 | MVP |
| 절차 | 심사위원장 | 위원장 지정, 종합 심사의견 작성, 결과 확정 시 위원장 확인 서명 | A-06, A-08 | 2차 |
| 절차 | 이의신청 | 결과 공개 후 정해진 기간 내 1회 접수, 관리자 검토·회신, 처리 이력 보관 | C-07, A-14 | 2차 |
| 현장 | 발표 진행 관리 | 발표 순서 랜덤 추첨(결과 로그), 발표·질의 타이머, 현재 발표 기업이 심사위원 화면에 자동 전환 | A-13, J-06 | MVP |
| 현장 | 네트워크 장애 대비 | 현장 와이파이 끊김 시 입력값을 브라우저에 임시 보관, 복구 시 재전송 | J-04 | MVP |
| 현장 | 화상 발표 | 온라인 발표 시 회차별 화상 링크(Zoom·Meet·사수래) 자동 배포 | A-13 | 2차 |
| 운영 | 심사위원 수당 정산 | 계좌·주민등록번호 수집(별도 동의, 암호화), 수당 산정, 원천징수 명세 엑셀 | J-08, A-15 | 2차 |
| 운영 | 심사위원 풀 | 전문분야·참여 이력 DB, 다음 프로그램 섭외·배정에 재사용 | A-16 | 2차 |
| 보안 | 접속 보안 | 관리자 2단계 인증(OTP), 30분 무동작 시 자동 로그아웃 | 전체 | MVP |
| 보안 | 개인정보 보유·파기 | 보유기간 경과 시 신청 자료·정산 정보 자동 파기, 파기 대장 기록 | A-11 | 2차 |
| 감사 | 증빙 패키지 | 단계별 평가표 원본·서명본·심사평·수정 이력을 ZIP 하나로 내려받기(감사·발주처 제출용) | A-09 | MVP |

최종 점수 산정 순서
- 과락 판정: 항목별 최저점 미달 기업은 '과락'으로 표시하고 순위에서 제외.
- 심사위원 점수 집계: 원점수 또는 정규화 점수, 최고·최저 제외 옵션 적용 후 평균.
- 가점·감점 반영: 승인된 항목만, 상한(예: ±5점) 내에서.
- 동점 처리 후 순위 확정.
정규화 옵션을 켜면 심사위원 j가 기업 i에 준 점수를 아래처럼 바꾼다. 심사위원 1인이 평가한 기업이 5개 미만이면 표본이 작아 적용하지 않는다.
\text{정규화 점수}_{ij} = 50 + 10 \cdot \frac{s_{ij} - \bar{s}_j}{\sigma_j}
보유기간·과락 기준·가점 상한·이의신청 기간은 발주처 공고 기준을 따르므로 프로그램별 설정값으로 둔다.
### 5. 기술 스택과 아키텍처

시스템 아키텍처
| 영역 | 선택 | 비고 |
|---|---|---|
| 프론트·서버 | Next.js (App Router), TypeScript | Vercel 또는 Netlify 배포 |
| UI | Tailwind + shadcn/ui, Pretendard | 브랜드 커러는 테마 변수 |
| 백엔드 | Supabase (Auth, Postgres, Storage, Realtime, Cron, Edge Functions) | 별도 서버 운영 불필요 |
| 문서 | PDF.js(열람), pdf-lib(서명 PDF), exceljs(결과표) | PPTX는 업로드 시 PDF 변환 |
| 서명 | signature_pad (기본) / 모두싸인 API (선택) | 인터페이스 분리로 교체 가능 |
| 알림 | n8n 웹훅 | 기존 사내 n8n 재사용 |

예상 운영비: Supabase Pro 월 $25와 Vercel Pro 월 $20 수준(무료 플랜으로 시범 운영 가능, 가격은 도입 시점에 재확인 필요).
### 6. DB 스키마
Supabase Postgres 기준. 모든 테이블에 id uuid PK, created_at, updated_at을 둔다(아래 생략).
| 테이블 | 주요 컬럼 | 관계·비고 |
|---|---|---|
| profiles | user_id(auth.users FK), role(admin/company/judge), name, phone, org | 로그인 사용자 1:1 |
| programs | title, type(hackathon/screening), status, description | 최상위 단위 |
| stages | program_id, order_no, name, submit_start, submit_end, eval_start, eval_end, status, required_files(jsonb), score_visible(bool) | programs 1:N |
| criteria | stage_id, order_no, name, description, max_score, comment_required(bool) | stages 1:N |
| companies | program_id, owner_user_id, name, biz_no, ceo, field, members(jsonb) | programs 1:N |
| stage_entries | stage_id, company_id, result(pending/pass/fail) | 단계 참가 자격(1차 통과자만 2차 행 생성) |
| submissions | entry_id, file_type(plan/deck/etc), storage_path, file_name, version, is_current | stage_entries 1:N, 버전 보관 |
| judges | program_id, user_id, affiliation, expertise | programs N:M users |
| consent_templates | program_id, title, body, version, required(bool) | 동의서 양식 |
| consents | judge_id, template_id, signature_path, signed_pdf_path, signed_at, ip, user_agent, doc_hash | 서명 증빙 |
| assignments | stage_id, judge_id, company_id, conflict(bool) | 배정. 미배정 기업은 열람 불가 |
| scores | assignment_id, criterion_id, score, comment | 항목별 점수. unique(assignment_id, criterion_id) |
| reviews | assignment_id, overall_comment, status(draft/submitted) | 종합 심사평 |
| stage_results | stage_id, company_id, avg_score, rank, locked_at, locked_by | 확정 스냅샷 |
| audit_logs | actor_id, action, table_name, row_id, before(jsonb), after(jsonb), ip | 트리거로 자동 기록 |
| notices | program_id, title, body, target_role | 공지 |
| stages (추가 컬럼) | blind_mode, normalize, bonus_cap, appeal_days, retention_years | 4-1 설정값 |
| criteria (추가 컬럼) | min_pass_score(과락), rubric(jsonb: 점수 구간별 설명), tie_priority | 루브릭·과락·동점 기준 |
| application_fields | program_id, label, type(text/number/select/file/check), required, order_no | 신청서 커스텀 항목 |
| application_answers | company_id, field_id, value(jsonb) | 기업별 응답 |
| eligibility_checks | entry_id, item, result(pass/fail/supplement), due_at, note, checked_by | 0차 적격 검토 |
| bonus_rules / entry_bonuses | stage_id, name, points(±), evidence_required / entry_id, rule_id, evidence_path, approved_by | 가점·감점 규칙과 적용 |
| presentation_slots | stage_id, company_id, order_no, start_at, present_min, qna_min, status, meeting_url, draw_seed | 발표 순서·진행 상태 |
| evaluation_submissions | judge_id, stage_id, submitted_at, signed_pdf_path, doc_hash, reopened_by, reopen_reason | 평가표 최종 제출·서명 |
| appeals | entry_id, reason, attachment_path, status, response, decided_by, decided_at | 이의신청 |
| judge_payments | judge_id, program_id, amount, tax, bank_enc, rrn_enc, paid_at | 정산. 민감정보는 컬럼 암호화(pgsodium/Vault) |
| judge_pool | user_id, expertise(text[]), career, history(jsonb), note | 프로그램 간 재사용 |
| disposal_logs | program_id, target, disposed_at, method, operator | 개인정보 파기 대장 |

집계 뷰 v_stage_ranking: 기업별로 심사위원 합계(항목 점수 합)를 구한 뒤 평균, 순위(rank() over)를 계산한다. 최고·최저 제외 옵션은 stages에 trim_extremes bool을 두고 뷰에서 분기한다.
### 7. 권한(RLS) 정책
권한은 화면이 아니라 DB에서 강제한다. 프론트에서 숨겨도 API로 직접 조회하면 뚫리기 때문이다. 모든 테이블에 RLS를 켜고 아래 규칙만 허용한다.
| 테이블 | 기업(C) | 심사위원(J) | 관리자(A) |
|---|---|---|---|
| companies | 본인 소유 행 읽기·수정 | 배정된 기업만 읽기 | 전체 |
| submissions | 본인 기업 행 읽기, 단계 '접수중'일 때만 쓰기 | 배정된 기업 + 서명 완료 시 읽기 | 전체 |
| criteria | 읽기 불가(선택: 공개) | 배정 단계만 읽기 | 전체 |
| scores / reviews | 접근 불가 | 본인 assignment만 읽기·쓰기, 단계 '평가중' + 미확정일 때만 쓰기 | 전체 읽기 |
| consents | 접근 불가 | 본인 행 생성·읽기(수정 불가) | 전체 읽기 |
| stage_results | 결과 공개된 본인 행만 | 접근 불가 | 전체 |
| audit_logs | 접근 불가 | 접근 불가 | 읽기만 |
| appeals | 본인 기업 행 생성·읽기(기간 내) | 접근 불가 | 전체 |
| judge_payments | 접근 불가 | 본인 행 생성·수정 | 정산 권한자(profiles.can_pay)만 |
| companies (블라인드) | - | blind_mode 단계에서는 마스킹 뷰(v_companies_blind)만 읽기 | 전체 |

예시 정책(심사위원 점수 쓰기):
create policy judge_write_scores on scores for allusing (  exists (select 1 from assignments a    join judges j on j.id = a.judge_id    join stages s on s.id = a.stage_id    where a.id = scores.assignment_id      and j.user_id = auth.uid()      and s.status = 'evaluating'      and not a.conflict));
- 서명 완료 여부는 has_signed_all(judge_id) 함수로 만들어 submissions 읽기 정책에 포함한다.
- 관리자 판별은 is_admin() 함수(profiles.role 조회)로 통일한다.
- 파일 다운로드는 Storage 정책 + 서버에서 발급하는 서명 URL(유효 10분)로만 허용한다.
### 8. 주요 로직
#### 8-1. 점수 집계·순위
- 심사위원 1인 점수 = 해당 기업에 매긴 항목 점수 합(100점 만점 기준 권장).
- 기업 점수 = 심사위원 점수의 평균. trim_extremes가 켜져 있고 심사위원 5명 이상이면 최고·최저 1개씩 제외 후 평균.
- 순위 = 평균 내림차순. 동점 시 관리자가 지정한 우선 항목 점수가 높은 순, 그래도 같으면 공동 순위.
- 미평가 심사위원이 있는 기업은 대시보드에 '집계 중' 배지 표시.
\text{기업 점수} = \frac{1}{n}\sum_{j=1}^{n} \sum_{k=1}^{m} s_{jk}
과락·정규화·가감점이 들어간 최종 점수는 4-1의 산정 순서를 따른다. 대시보드와 결과표에는 원점수, 정규화 점수(사용 시), 가감점, 최종 점수를 모두 표시한다.
#### 8-2. 실시간 반영
- 심사위원 입력은 입력 후 1초 디바운스로 자동 저장(upsert).
- 관리자 대시보드는 Supabase Realtime으로 scores 테이블 변경을 구독하고, 변경 시 v_stage_ranking을 다시 조회한다.
- 심사위원 화면은 저장 상태(저장 중 / 자동 저장됨 / 저장 실패 - 재시도)를 항상 표시한다.
#### 8-3. 동의서 서명
- 관리자가 A-10에서 동의서 양식(문구) 등록.
- 심사위원 최초 로그인 시 J-01로 강제 이동, 문구 전체 스크롤 후 서명 패드 활성화.
- 캔버스 서명(signature_pad) → PNG 저장 → 서버에서 문구+서명+서명시각+IP를 합쳐 PDF 생성(pdf-lib) → SHA-256 해시 저장.
- 서명 PDF는 수정 불가. 문구 버전이 바뀌면 재서명 요청.
- 공공 위탁 등 본인인증·감사추적인증서가 필요하면 모두싸인 임베디드 API로 교체(인터페이스만 분리해 둔다).
#### 8-4. 파일 보안
- Storage 버킷은 비공개. 경로 규칙: {program_id}/{stage_id}/{company_id}/{file_type}_v{n}.pdf.
- 업로드 제한: PDF·PPTX, 파일당 50MB. PPTX는 업로드 시 PDF 변환본도 생성(LibreOffice 서버리스 함수)해 뷰어 호환성 확보.
- 심사위원 뷰어는 PDF.js에 워터마크(이름·일시)를 덧그리고 다운로드 버튼 비노출. 완전 차단은 불가하므로 보안서약으로 보완.
#### 8-5. 단계 이관
관리자가 A-08에서 1차 통과 기업 선택 → '다음 단계로 이관' 클릭 → 2차 stage_entries 행 생성 + 해당 기업에 제출 안내 메일 발송.
### 9. API·서버 액션 목록
단순 조회·저장은 Supabase 클라이언트 + RLS로 직접 처리하고, 권한 상승이나 외부 연동이 필요한 것만 서버(Next.js Route Handler 또는 Edge Function)로 둔다.
| 엔드포인트 | 메서드 | 호출자 | 기능 |
|---|---|---|---|
| /api/invite | POST | A | 기업·심사위원 계정 생성 + 초대 메일 |
| /api/invite/bulk | POST | A | 엑셀 업로드로 일괄 초대 |
| /api/files/upload-url | POST | C | 업로드용 서명 URL 발급(단계 상태 검증) |
| /api/files/view-url | POST | J, A | 열람용 서명 URL 발급(배정·서명 검증, 열람 로그 기록) |
| /api/consent/sign | POST | J | 서명 PNG 수신 → PDF 생성·해시 저장 |
| /api/stages/:id/status | PATCH | A | 단계 상태 변경(접수중 → 평가중 → 확정 → 결과공개) |
| /api/stages/:id/lock | POST | A | 점수 확정, stage_results 스냅샷 생성 |
| /api/stages/:id/advance | POST | A | 통과 기업 다음 단계 이관 |
| /api/export/:stageId | GET | A | 결과 엑셀(exceljs) / 심사평 PDF / 서명본 ZIP |
| /api/webhooks/n8n | POST | 시스템 | n8n으로 이벤트 전달(제출 완료, 평가 완료 등) |
| /api/eligibility/:entryId | PATCH | A | 적격 판정, 보완 요청 메일 발송 |
| /api/eval/submit | POST | J | 평가 완료 검증 → 평가표 PDF 생성·서명·해시 저장 |
| /api/eval/reopen | POST | A | 특정 심사위원 평가 재오픈(사유 필수, 감사로그) |
| /api/presentations/:stageId/draw | POST | A | 발표 순서 랜덤 추첨(시드·결과 기록) |
| /api/presentations/:slotId/state | PATCH | A | 현재 발표 기업 전환 → Realtime 브로드캐스트 |
| /api/appeals | POST | C | 이의신청 접수(기간·횟수 검증) |
| /api/payments/export | GET | A | 수당 지급·원천징수 명세 엑셀 |
| /api/export/:stageId/audit-pack | GET | A | 평가표 원본·서명본·심사평·수정 이력 ZIP |

### 10. 자동화 연동 (n8n)
플랫폼은 이벤트만 웹훅으로 보내고, 메일·슬랙·카카오 발송과 리마인드 스케줄은 기존 n8n에서 처리한다. 플랫폼 코드에 알림 로직을 넣지 않아 운영팀이 직접 문구·시점을 바꿀 수 있다.
| 트리거 | 대상 | 채널 | 내용 |
|---|---|---|---|
| 초대 생성 | 기업·심사위원 | 메일 | 로그인 링크, 일정 안내 |
| 접수 마감 D-3, D-1 | 미제출 기업 | 메일·카카오 | 제출 리마인드 |
| 제출 완료 | 기업 | 메일 | 접수 확인증 |
| 평가 시작 | 심사위원 | 메일·카카오 | 배정 기업 수, 마감일 |
| 평가 마감 D-1 | 미완료 심사위원 | 카카오 | 남은 기업 수 |
| 점수 편차 경고 | 관리자 | Slack | 동일 기업 심사위원 간 20점 이상 차이 |
| 단계 확정 | 관리자 | Slack | 순위 요약 + 결과 엑셀 링크 |
| 보완 요청 | 해당 기업 | 메일·카카오 | 보완 항목, 기한 |
| 발표 순서 확정, 발표 10분 전 | 발표 기업 | 카카오 | 발표 시각, 장소 또는 화상 링크 |
| 이의신청 접수 | 관리자 | Slack | 기업명, 사유 요약, 처리 기한 |
| 파기 예정 D-30 | 관리자 | 메일 | 파기 대상 프로그램·항목 |

확장: 확정 데이터를 INTWEEN AI Framework의 E(Evaluate) 에이전트로 넘겨 결과보고서 초안 자동 생성, N(Network) 에이전트의 실적DB에 프로그램 이력 적재.
### 11. 디자인 가이드
인트윈 브랜드 3색을 기준으로 하되, 심사 화면은 장시간 열람하므로 색 사용을 최소화한다.
| 용도 | 색상 | 적용 |
|---|---|---|
| Primary | #578C76 | 헤더, 주요 버튼, 선택 상태 |
| Accent | #35AF8B | 완료·통과 배지, 진행률 바, 실시간 반영 표시 |
| Highlight | #F1B853 | 마감 임박, 미평가 경고, 1위 강조 |
| 배경·텍스트 | #F7F8F7 / #1F2A25 | 본문 영역 |

- 폰트: Pretendard. 본문 15px, 점수 숫자는 tabular-nums.
- 컴포넌트: shadcn/ui(Tailwind) 사용. 표·폼·다이얼로그를 그대로 쓰고 브랜드 컬러만 테마 변수로 교체.
- 심사위원 J-04는 데스크톱 기준 좌 65%(뷰어) / 우 35%(평가표) 분할, 태블릿은 상하 전환.
- 기업 화면은 모바일에서도 업로드 가능해야 한다(반응형 필수).
- 문구는 짧고 객관적으로. 예: '제출 완료', '자동 저장됨', '마감 2일 전'.
### 12. 개발 일정·체크리스트·QA

개발 로드맵 · 4주 + 모의 심사 게이트
실운영 투입 전 내부 직원으로 가상 기업 5개, 심사위원 3명을 만들어 1차→2차 전 과정을 모의 심사로 돌린다. 시작일은 미정이다. 4-1의 MVP 요소(적격 검토, 발표 진행, 최종 제출·서명 등)를 1차 오픈에 넣으면 3주차와 4주차 사이에 1주를 더해 총 5주로 잡는 것을 권장한다.
#### 개발 체크리스트
- ☐ Supabase 프로젝트 생성, 테이블·뷰·트리거 마이그레이션
- ☐ 전 테이블 RLS 활성화 + 역할별 정책 테스트
- ☐ 초대 메일·비밀번호 설정 플로우
- ☐ 관리자: 프로그램·단계·평가항목 CRUD, 프로그램 복제
- ☐ 기업: 단계별 업로드(서명 URL), 버전 보관, PPTX→PDF 변환
- ☐ 심사위원: 동의서 서명 → PDF·해시 저장, 미서명 차단
- ☐ 심사위원: 뷰어 + 평가표 분할 화면, 1초 디바운스 자동 저장
- ☐ 관리자 대시보드 Realtime 구독, 점수 편차 경고
- ☐ 확정(잠금)·다음 단계 이관·결과 공개
- ☐ 엑셀·심사평 PDF·서명본 ZIP 내보내기
- ☐ n8n 웹훅 7종 연결
- ☐ 감사로그 트리거·조회 화면
추가 요소(4-1) 체크리스트
- ☐ 블라인드 마스킹 뷰 + 업로드 안내 문구
- ☐ 루브릭·과락 기준 입력 UI와 평가표 표시
- ☐ 가점·감점 규칙, 증빙 승인, 상한 적용
- ☐ 0차 적격 검토·보완 요청 플로우
- ☐ 신청서 커스텀 필드 빌더
- ☐ 평가표 최종 제출·서명, 관리자 재오픈
- ☐ 발표 순서 추첨·타이머·현재 기업 브로드캐스트
- ☐ 오프라인 임시 보관·재전송
- ☐ 관리자 OTP·세션 타임아웃
- ☐ 감사 증빙 패키지 ZIP
- ☐ (2차) 정규화 점수, 심사위원장, 이의신청, 화상 발표, 정산, 심사위원 풀, 자동 파기
#### QA 시나리오
| 번호 | 시나리오 | 기대 결과 |
|---|---|---|
| Q1 | 기업 A가 API로 기업 B의 파일 조회 시도 | RLS로 차단, 빈 결과 |
| Q2 | 접수 마감 1분 후 업로드 시도 | 업로드 URL 발급 거부, 안내 문구 |
| Q3 | 심사위원이 서명 전 평가 URL 직접 접속 | /j/consent로 리다이렉트 |
| Q4 | 미배정 기업의 파일 열람 시도 | 열람 URL 발급 거부 |
| Q5 | 심사위원 2명이 동시에 점수 수정 | 관리자 순위 3초 안에 갱신 |
| Q6 | 배점 초과 점수(30점 항목에 35) 입력 | 입력 차단 + DB check 제약 |
| Q7 | 확정 후 심사위원 점수 수정 | 저장 거부, '확정됨' 표시 |
| Q8 | 동점 기업 2개 | 우선 항목 기준 정렬, 그래도 같으면 공동 순위 |
| Q9 | 네트워크 끊김 중 점수 입력 | '저장 실패 - 재시도' 표시, 복구 시 재전송 |
| Q10 | 결과 엑셀 내보내기 | 대시보드 순위·점수와 일치 |
| Q11 | 총점 1위지만 한 항목이 과락 기준 미달 | '과락' 표시, 순위 산정에서 제외 |
| Q12 | 블라인드 단계에서 심사위원 화면·파일명 확인 | 기업명·대표자명이 'A-03'처럼 코드로만 표시 |
| Q13 | 미평가 기업이 남은 상태에서 최종 제출 | 제출 거부, 미평가 기업 목록 안내 |
| Q14 | 가점 증빙 미승인 상태로 확정 | 확정 전 경고, 미승인 가점은 0점 처리 |
| Q15 | 발표 중 관리자가 다음 기업으로 전환 | 모든 심사위원 화면 3초 안에 전환, 이전 기업 입력값 유지 |
| Q16 | 이의신청 기간 경과 후 신청 | 접수 거부, 기간 안내 |
| Q17 | 일반 관리자가 정산 정보 조회 | 주민번호·계좌 마스킹, 정산 권한자만 복호화 + 열람 로그 |
