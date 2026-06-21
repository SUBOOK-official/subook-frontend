# 토스페이먼츠 PG 결제 — 셋업 / 고라이브 가이드

> 작성 2026-06-21. 사업자 등록 완료 후 PG(토스 결제위젯) 연동.
> **현재 상태: 코드 완성 + 프로덕션은 OFF(플래그). 라이브 키·env 들어오면 켜기만 하면 됨.**

## 구조

```
주문서(/order)  결제위젯(renderPaymentMethods/Agreement) ── requestPayment
   │ create_order(pending)                                      │
   │                                          successUrl: /order/payment/success?paymentKey&orderId&amount
   ▼                                                            ▼
[토스 결제창] ───────────────────────────────────────▶  /order/payment/success
                                                              │ POST /api/payments/confirm
                                                              ▼
                              ① 토스 POST /v1/payments/confirm (secretKey 검증)
                              ② confirm_pg_payment RPC → pending→paid + books=reserved
                              ③ order_confirmed 알림톡(best-effort)
                                                              ▼
                                                   /order/complete/:id (결제완료)
```

- 계좌이체(무통장) 흐름은 **그대로**. PG는 나란히 추가됨.
- `order_number`(예: `ORD-2606-0042`)를 토스 `orderId`로 사용.
- 환불(PG cancel)은 **Phase 2 미구현** — 현재 admin 환불은 DB만 처리(계좌이체 기준). PG 주문 환불은 토스 cancel API 연동 후 가능.

## 활성 플래그

`VITE_TOSS_ENABLED`(빌드타임). `"true"` + `VITE_TOSS_CLIENT_KEY` 둘 다 있어야 PG UI 노출.
**미설정/false면 기존 계좌이체 UI 그대로** (현재 프로덕션 상태).

## 필요한 환경변수 (Vercel · public-web 프로젝트)

| 변수 | 범위 | 값 | 비고 |
|------|------|----|------|
| `VITE_TOSS_ENABLED` | 빌드(VITE) | `true` | preview 먼저, 검증 후 production |
| `VITE_TOSS_CLIENT_KEY` | 빌드(VITE) | `test_gck_…` → 라이브 `live_gck_…` | **결제위젯** 클라이언트 키(gck) |
| `TOSS_SECRET_KEY` | 서버리스 | `test_gsk_…` → `live_gsk_…` | **결제위젯** 시크릿 키(gsk). client와 **세트** 필수 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버리스 | service_role 키 | confirm_pg_payment 호출용 |
| `SUPABASE_URL` | 서버리스 | `https://affeayqergefwudytfop.supabase.co` | (또는 `SUPABASE_PUBLIC_URL`) |
| `CRON_SECRET` | 서버리스 | admin 프로젝트와 동일 값 | order_confirmed 알림(없으면 알림만 skip, 결제는 정상) |

> ⚠ 키 세트 규칙: 결제위젯 키는 client=`gck`/secret=`gsk`가 **한 세트**. API개별연동 키(`ck`/`sk`)와 섞으면 `INVALID_API_KEY`. 테스트/라이브도 섞으면 안 됨.
> 테스트 키는 토스 개발자센터(developers.tosspayments.com) → 내 개발정보 → 결제위젯 연동 키, 또는 "문서용 테스트 키"에서 복사.

## 검증 절차 (프로덕션 켜기 전 — 반드시 preview에서)

1. 위 env를 **Preview 범위**로 추가(`VITE_TOSS_ENABLED=true`, 테스트 키). Production 범위는 아직 건드리지 않음.
2. `npm run deploy:public:preview` → preview URL에서 로그인 → 장바구니 → 주문 → "간편결제·카드".
3. 토스 테스트 카드로 결제 → `/order/payment/success` → `/order/complete`에서 "결제 완료" 확인.
4. 체크: ① storefront에서 해당 책 사라짐(reserved) ② mypage 주문이 결제완료 ③ 중복 새로고침 시 멱등(에러 안 남) ④ 결제창 닫기 → /fail → 주문은 pending(24h 자동취소).
5. ⚠ **Permissions-Policy 헤더** — `vercel.json`/`vercel.deploy.json`에 `payment=()`가 있음. 결제위젯 카드/간편결제가 권한 에러로 막히면 `payment=(self "https://*.tosspayments.com")`로 완화 필요(테스트에서 확인).

## 고라이브 (라이브 키 확보 후)

1. 토스 가맹 심사 통과 → 라이브 결제위젯 키(`live_gck_`/`live_gsk_`) 발급.
2. Production env에 라이브 키 + `VITE_TOSS_ENABLED=true` 설정.
3. `npm run deploy:public` (production).
4. 실결제 1건 소액 테스트 후 환불(현 시점 환불은 토스 콘솔에서 수동 — Phase 2 전까지).

## Phase 2 — PG 환불 (완료)

- `admin-web/api/admin/payment-cancel.js`: admin 인증 → 주문 조회 → **PG주문이면 토스 `POST /v1/payments/{paymentKey}/cancel`(멱등키) 먼저** → `admin_refund_order`(정산취소/재고복원/쿠폰복구). 계좌이체(payment_key 없음)는 토스 취소 건너뛰고 DB 환불만.
- 토스 취소 우선 순서 — 실패 시 DB 안 건드려 "환불됐다는데 돈 안 옴"(구매자 불리) 방지. RECOVERY_REQUIRED_ACK 재호출 시 토스 취소는 멱등이라 안전.
- 프론트 `AdminOrdersPage.submitRefund`가 RPC 직접호출 대신 이 엔드포인트 호출(반환 `{data,error}` 계약·손실확인 모달 흐름 유지).
- **admin-web Vercel 프로젝트에 `TOSS_SECRET_KEY` env 필요**(public-web와 동일 키).
- 검증: 토스 cancel API 인증·엔드포인트 정상 확인(2026-06-21).

## ⚠ 결제수단 구성 (중요 — 환불 자동화)

PG 환불은 결제수단에 따라 다름:
- **카드 / 간편결제(토스·카카오·네이버페이)**: `cancelReason`만으로 자동 환불 ✅
- **가상계좌 / (퀵)계좌이체**: 토스 cancel에 `refundReceiveAccount`(환불받을 은행·계좌·예금주)가 필수 — 우리는 구매자 환불계좌를 수집하지 않으므로 이 수단은 자동환불 불가(테스트결제로 400 INVALID_REQUEST 확인).

→ **토스 대시보드에서 결제위젯 결제수단을 카드+간편결제로 제한**(가상계좌·(퀵)계좌이체 제외) 권장. 무통장입금은 우리 자체 계좌이체 흐름이 이미 담당.

## 남은 작업

- 통신판매업신고 / 에스크로(구매안전서비스 이용확인증) — subook.kr 도메인 기준 신청. 푸터 `통신판매업신고번호`("정식 등록 진행 중") 업데이트.
- 결제실패로 남는 pending 주문 정리 UX(현재 24h 자동취소에 의존) — 필요 시 mypage "결제 재시도".
