# 나이스페이먼츠 포스타트(카드 결제창) 연동 — 운영 셋업 가이드

2026-07-27 도입. 토스페이먼츠 정식 계약이 늦어져 나이스페이 포스타트를 선도입.
결제창(Server 승인 모델) 방식이며, 임시오픈 기간엔 **카드 결제만** 가능하다
(가상계좌/계좌이체/간편결제는 정식 오픈 후 — 정식 오픈 전 결제분은 정산 보류됨에 유의).

공식 문서: <https://github.com/nicepayments/nicepay-manual> (`api/payment-window-server.md`)

## 구성 요소

| 파일 | 역할 |
|------|------|
| `src/lib/nicepay.js` | JS SDK 로더 + `AUTHNICE.requestPay` 래퍼 (`NICEPAY_READY` 플래그) |
| `src/pages/PublicOrderPage.jsx` | `PG_PROVIDER`(nicepay > toss 우선) 분기, 카드 선택 UI, 제출 시 결제창 호출 |
| `api/payments/nicepay-return.js` | returnUrl POST 수신 → signature 검증 → `finalize_pg_checkout_session` RPC(주문 생성) → 승인 API → `confirm_pg_payment` RPC → `/order/complete/:id` 303 |

결제 흐름(2026-08-03 '선주문 생성' 폐지): `create_pg_checkout_session`(결제 세션 —
주문·재고 선점 없음) → 결제창 인증 → returnUrl POST → `finalize_pg_checkout_session`으로
**그때 주문 생성**(재고·쿠폰·금액 재검증, 실패 시 승인 미진행=청구 없음) → 서버 승인 →
pending→preparing + books=reserved (RPC는 토스와 공용, `p_provider='nicepay'`,
`payment_key` 컬럼에 나이스페이 **TID** 저장 — 취소 API `/v1/payments/{tid}/cancel`에 필요).

결제창을 그냥 닫고 이탈하면 세션만 남는다(24h 뒤 자동 청소) — 과거처럼 '입금대기'
주문이 마이페이지에 남거나 책이 30분간 품절로 잠기거나 장바구니가 비워지지 않는다.

승인 후 RPC 확정이 실패하면(재고 충돌 등) **전액 자동취소**를 시도한다(토스 confirm.js와
다른 점 — 고객 돈이 묶이지 않게 하는 방어). 취소도 실패하면 Vercel 로그에 CRITICAL이
남으니 수동 환불 처리할 것.

## 환경 변수 (Vercel public-web 프로젝트)

| 변수 | 범위 | 값 | 비고 |
|------|------|----|------|
| `VITE_NICEPAY_ENABLED` | 빌드(VITE) | `true` | `VITE_NICEPAY_CLIENT_KEY`와 둘 다 있어야 카드 UI 노출 |
| `VITE_NICEPAY_CLIENT_KEY` | 빌드(VITE) | 클라이언트 키 | 상점관리자 → 개발정보 → +발급 |
| `NICEPAY_CLIENT_KEY` | 서버 | 클라이언트 키 | returnUrl 서버리스의 signature 검증·Basic 인증용 |
| `NICEPAY_SECRET_KEY` | 서버 | 시크릿 키 | **서버 전용 — VITE_ 접두사 금지** |
| `NICEPAY_API_BASE` | 서버(선택) | 미설정 권장 | 미설정 시 클라이언트 키 `S2_` 접두사면 샌드박스, 아니면 운영 API 자동 선택 |

기존 `SUPABASE_*`/`CRON_SECRET`(알림톡)은 토스 연동 때 이미 설정돼 있음.

## 로컬 E2E (샌드박스)

1. `frontend/.env.development.local`에 샌드박스 키(공식 문서 공개 값) — 이미 작성됨.
2. 서버리스 셔틀 실행: `node frontend/scripts/dev-api-server.mjs` (3999)
3. `npm --prefix frontend run dev:public` — vite가 `/api`를 3999로 프록시.
4. 주문 → 카드 선택 → 결제하기 → 샌드박스 결제창(실결제불가) → 승인 → 주문완료 확인.
5. ⚠ 로컬 E2E도 **실제 프로덕션 DB**를 쓴다: 주문·재고 전이가 진짜로 일어나고
   슬랙 주문 알림·구글시트 기록이 발동한다. 테스트 후 주문 취소로 원복할 것.
   (CRON_SECRET이 로컬에 없어 알림톡은 자동으로 스킵된다.)

## 운영 전환 절차

1. 상점관리자(<https://npg.nicepay.co.kr>) → 개발정보 → 클라이언트/시크릿 키 발급.
2. Vercel env 4종을 Production 범위로 설정 (`VITE_NICEPAY_ENABLED=true` + 키 3종).
3. `npm run deploy:public` 재배포(VITE_ 값은 빌드타임이라 재배포 필수).
4. 소액 실결제 → 즉시 어드민에서 결제취소로 검증 (임시오픈 기간이라 승인 즉시 가능).
5. 카드사 심사용 결제경로 PPTX 제출(`forstartups@nicevan.co.kr`)은 별도 트랙.

## 롤백

`VITE_NICEPAY_ENABLED` 제거(또는 `false`) 후 재배포 → 계좌이체 전용 UI로 복귀.
서버리스는 남아 있어도 결제창이 안 열리므로 안전.
