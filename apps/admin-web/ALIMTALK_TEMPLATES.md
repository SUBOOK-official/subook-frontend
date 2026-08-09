# 카카오 알림톡 템플릿 v2 — 재등록용 (수북)

> v2 개정 2026-08-01. 전 템플릿 문안 교체 + OTP 신규 + 판매완료·입고완료 폐지.
> 발송 대행사 = **솔라피(SOLAPI)** ([send-notification.js](api/admin/send-notification.js)).
> v1 문안(2026-06-22)은 git 이력 참조.

## 진행 상태 (2026-08-09)

9종 전부 검수 승인 → 코드·env 전환 완료. 남은 것: 전환 검증 후 솔라피 콘솔에서 **구 템플릿 삭제**.

| 템플릿 (솔라피 등록명) | 내부 타입 | templateId |
|---|---|---|
| 수북수거접수 v2 | `pickup_accepted` | `KA01TP260803071212434hOu8puNWGcW` |
| 수북검수완료 v2 | `inspection_done` | `KA01TP2608030711454204wq2CxbPeKg` |
| 수북정산완료 v2 | `settlement_done` | `KA01TP260803071126329xtAcEms3i1d` |
| 수북주문확인 v2 | `order_confirmed` | `KA01TP260803043617677LpBdwZp04Hm` |
| 수북배송시작 v2 | `shipping_started` | `KA01TP260803043550044gCZuIUU3abK` |
| 수북배송완료 v2 | `delivery_done` | `KA01TP260803043043300wR9PTzmZNjh` |
| 수북재입고 v2 | `restock` | `KA01TP260803043011253EN21EHyakeo` |
| 수북환불완료 v2 | `refund_completed` | `KA01TP260801164841664xjNKTh4surF` |
| 수북본인인증 v2 | (public-web OTP) | `KA01TP260801164657253JGX9omE8pKv` |

- admin-web env `SOLAPI_TEMPLATE_IDS` = 위 8종(JSON), public-web env `SOLAPI_PFID` + `SOLAPI_OTP_TEMPLATE_ID` = OTP.
- OTP 발송 함수는 알림톡 우선·SMS 폴백으로 전환됨. 단, OTP UI 연동 자체는 보류 상태(2026-07-28 결정) — 함수만 대기.

## 왜 "수정"이 아니라 "신규 등록"인가

- 카카오 알림톡은 **검수 요청된 템플릿의 본문 수정이 불가** — 문안을 바꾸려면 새 템플릿으로
  등록해 재검수를 받아야 한다. (출처: [솔라피 알림톡 가이드](https://solapi.com/guides/kakao-ata-guide))
- **삭제한 템플릿과 동일한 템플릿명·코드는 재사용 불가** — 신규 등록 시 이름을 기존과 다르게.
  (출처: [솔라피 템플릿 등록 방법](https://support.solapi.com/hc/ko/articles/360021019954))
- 검수 소요: 솔라피 안내 기준 1~3일, 카카오 공식 기준 영업일 2일 이내 순차 처리.
  (출처: [카카오 알림톡 심사 가이드](https://kakaobusiness.gitbook.io/main/ad/infotalk/audit))

## 진행 순서 (무중단 전환)

1. **[운영자]** 솔라피 [템플릿 등록 페이지](https://solapi.com/kakao/templates) → "새 템플릿 등록"으로
   아래 **9종을 신규 등록** 후 검수 요청. ⚠️ **기존 템플릿은 삭제·수정하지 말 것** —
   승인 전까지 운영 발송은 전부 기존 템플릿으로 나간다.
2. **[대기]** 카카오 검수 1~3영업일. 반려 시 사유 확인 → 문안 수정 → 재검수 (반려 상태에선 수정 가능).
3. **[개발]** 전 건 승인되면 각 템플릿의 **templateId(KA01TP…)** 를 전달받아 코드·env 전환
   (아래 "승인 후 개발 전환 체크리스트").
4. **[운영자]** 전환·테스트 발송 확인 후 솔라피 콘솔에서 **구 템플릿 10종 삭제**.
   판매완료(sold)·입고완료(arrived)는 이 시점부터 완전 폐지.

## 등록 시 공통 규칙

- 변수는 `#{변수명}` 그대로 입력. **변수마다 예시값 입력 필수.** 변수명이 코드의
  `templateVariables` 키와 정확히 일치해야 치환된다 — 아래 문안에서 철자 바꾸지 말 것.
- 문안은 아래 내용을 **줄바꿈까지 그대로** 붙여넣는다. 콘솔에서 문구를 다듬게 되면
  개발에 공유 (코드의 로그·인앱 알림 본문을 동일하게 맞춰야 함).
- 템플릿 이름은 기존과 겹치지 않게 — 아래 제안 이름(`… v2`) 사용 권장.

---

## 신규 템플릿 9종

### 1. 본인인증 OTP — 신규 (제안 이름: `수북 본인인증 v2`)

```
[수북(SUBOOK) 본인인증 안내]
안녕하세요, 수북(SUBOOK)입니다.
본인인증을 위한 인증번호를 안내드립니다.
► 인증번호 : #{code}
위 인증번호를 5분 이내에 입력해 주세요.
본인인증을 위해 발송된 인증번호이므로 타인에게 절대 알려주지 마세요.
```

- 변수: `code` (예: 482913)
- 등록 화면에 **보안 템플릿** 설정이 보이면 체크 권장 — 카카오는 인증번호류를 보안 템플릿으로
  분류할 수 있고(심사 중 전환되기도 함), 보안 템플릿은 메시지 미리보기가 노출되지 않는다.
- 현재 OTP는 SMS 단문 발송 — 승인 후 알림톡 전환하며, **실패 시 SMS 대체발송 필수**
  (카카오톡 미사용자·채널 차단 시 인증이 막히면 안 됨).

### 2. 환불 완료 (구매자) — 제안 이름: `수북 환불완료 v2`

```
[수북(SUBOOK) 환불 완료 안내]
안녕하세요, 수북(SUBOOK)입니다.
고객님의 주문에 대한 환불 처리가 완료되었습니다.
► 주문번호 : #{orderNumber}
► 환불 금액 : #{totalAmount}원
► 환불 사유 : #{reason}
환불 금액은 결제 수단에 따라 영업일 기준 1~5일 이내 카드사 또는 은행을 통해 환불될 예정입니다.
카드사 및 은행의 사정에 따라 실제 환불 완료 시점은 다소 차이가 있을 수 있습니다.
환불 관련 문의사항이 있으신 경우 수북(SUBOOK) 고객센터로 문의해 주세요.
```

- 변수: `orderNumber`(예: ORD-2608-0042), `totalAmount`(예: 23,500), `reason`(예: 단순 변심)

### 3. 재입고 알림 (구매자) — 제안 이름: `수북 재입고 v2`

```
[수북(SUBOOK) 재입고 안내]
안녕하세요, 수북(SUBOOK)입니다.
회원님께서 재입고 알림을 신청하신 교재가 재입고되어 안내드립니다.
► 상품명 : #{productTitle}
재입고된 상품은 상품 페이지에서 바로 구매하실 수 있습니다.
※ 본 메시지는 회원님의 재입고 알림 신청에 의해 발송되는 정보성 메시지입니다.
```

- 변수: `productTitle` (예: 2026 수능특강 수학영역 수학Ⅰ)
- 버튼(웹링크, 선택): 명 `상품 보기` / URL `https://subook.kr/store/#{productId}`
  (버튼 URL에는 변수 사용 가능. 발송 코드가 `productId`를 이미 전달하고 있음.)
- 과거 반려 이력 참고: "찜하신 교재" 문구가 광고성으로 반려됨 → 이번 문안은
  "재입고 알림을 신청하신" + 정보성 고지 포함이라 같은 문제 없음.

### 4. 배송 완료 (구매자) — 제안 이름: `수북 배송완료 v2`

```
[수북(SUBOOK) 교재 도착 안내]
안녕하세요, 수북(SUBOOK)입니다.
주문하신 교재의 배송이 완료되었습니다.
교재를 수령하신 후 상품 상태를 확인하시고 구매확정을 부탁드립니다.
구매확정을 완료하지 않으신 경우 배송완료일로부터 7일 후 자동으로 구매확정 처리됩니다.
```

- 변수: 없음 (고정 정보성 메시지 — 변수 없는 템플릿도 등록 가능, v1 배송완료도 동일)

### 5. 배송 시작 (구매자) — 제안 이름: `수북 배송시작 v2`

```
[수북(SUBOOK) 배송 시작 안내]
안녕하세요, 수북(SUBOOK)입니다.
주문하신 교재가 발송되어 배송이 시작되었습니다.
► 운송장 번호 : CJ대한통운 #{trackingNumber}
택배사 사정 및 날씨, 도로 상황 등에 따라 배송 예정일은 변경될 수 있습니다.
배송 현황은 운송장 번호를 통해 확인하실 수 있습니다.
교재가 안전하게 도착할 수 있도록 최선을 다하겠습니다.
```

- 변수: `trackingNumber` (예: 123456789012)
- 버튼(웹링크) 권장: 명 `배송 조회` / URL `https://www.cjlogistics.com/ko/tool/parcel/tracking`

### 6. 주문 확인 (구매자) — 제안 이름: `수북 주문확인 v2`

```
[수북(SUBOOK) 주문 확인 안내]
안녕하세요, 수북(SUBOOK)입니다.
고객님의 주문이 정상적으로 확인되었습니다.
► 주문번호 : #{orderNumber}
► 상품명 : #{itemSummary}
► 결제 금액 : #{totalAmount}원
► 예상 배송 소요기간 : 2~3일
배송은 결제 및 주문 확인 후 순차적으로 진행됩니다.
택배사 사정 및 날씨, 도로 상황 등에 따라 배송 예정일은 변경될 수 있습니다.
주문해 주셔서 감사합니다.
```

- 변수: `orderNumber`(예: ORD-2608-0042), `itemSummary`(예: 수학의 정석 외 2건),
  `totalAmount`(예: 23,500)

### 7. 정산 완료 (셀러) — 제안 이름: `수북 정산완료 v2`

```
[수북(SUBOOK) 정산 완료 안내]
안녕하세요, 수북(SUBOOK)입니다.
판매하신 교재에 대한 정산이 완료되어 안내드립니다.
► 정산 금액 : #{amount}원
► 입금 계좌 : #{bankName} ****#{accountLast4}
정산 금액은 위 계좌로 입금 처리되었습니다.
정산 내역은 수북(SUBOOK) 마이페이지에서 자세히 확인하실 수 있습니다.
정산 관련 문의사항이 있으신 경우 수북(SUBOOK) 고객센터로 문의해 주세요.
```

- 변수: `amount`(예: 24,000), `bankName`(예: 카카오뱅크), `accountLast4`(예: 6506)

### 8. 검수 완료 (셀러) — 제안 이름: `수북 검수완료 v2`

```
[수북(SUBOOK) 검수 완료 안내]
안녕하세요, 수북(SUBOOK)입니다.
보내주신 교재의 검수가 완료되었습니다.
검수 결과 및 상세 내역은 수북(SUBOOK) 마이페이지에서 확인하실 수 있습니다.
검수 결과에 대한 문의사항이 있으신 경우 고객센터를 통해 문의해 주세요.
```

- 변수: 없음 — v1의 `#{inspectionResult}`(등급·가격 상세) 제거됨.
- ⚠️ 문안이 "마이페이지에서 확인"을 전제하므로, 전환 전에 **셀러 마이페이지에서 검수
  결과(등급·가격)가 실제로 노출되는지 확인** 필요.

### 9. 수거 접수 완료 (셀러) — 제안 이름: `수북 수거접수 v2`

```
[수북(SUBOOK) 교재 수거 접수 안내]
안녕하세요, 수북(SUBOOK)입니다.
교재 수거 신청이 정상적으로 접수되었습니다.
► 요청번호 : #{requestNumber}
► 수거 교재 : #{itemCount}권
► 운송장 : #{trackingNumber}
택배기사가 접수일로부터 1~2일 이내에 방문하여 교재를 수거할 예정입니다.
택배기사 방문 전까지 교재가 훼손되지 않도록 안전하게 포장해 주시고, 빠른 시일 내에 택배기사가 수거할 수 있는 장소에 준비해 주세요.
택배사 사정 및 방문 일정에 따라 수거 시간이 다소 변경될 수 있습니다.
```

- 변수: `requestNumber`(예: PU-2608-0001), `itemCount`(예: 5), `trackingNumber`(예: 123456789012)
- 마지막 문장 끝 마침표는 원안에 없어 추가함 — 원안 그대로 원하면 빼고 등록.

---

## 폐지 2종 (신규 등록하지 않음)

| v1 템플릿 | 내부 타입 | 폐지 후 처리 |
|---|---|---|
| 판매 완료 (셀러) | `sold` | D+7 자동 구매확정 크론의 셀러 알림 발송 제거 |
| 교재 입고 완료 (셀러) | `arrived` | 어드민 입고(검수 시작) 전환 시 알림 발송 제거 |

구 템플릿 삭제는 **신규 승인 → 코드 전환 → 테스트 확인 후** 마지막에.

---

## 승인 후 개발 전환 체크리스트

1. **env** — admin-web Vercel의 `SOLAPI_TEMPLATE_IDS` JSON을 새 templateId로 교체
   (`sold`·`arrived` 키 제거, 나머지 8종 교체). public-web Vercel에 OTP용 templateId env 신설.
2. **[send-notification.js](api/admin/send-notification.js)** — `buildMessageBody` 문안을 위
   신규 문안과 동일하게 교체(알림 로그·인앱 알림 본문이 실제 발송 내용과 일치해야 함),
   `sold`/`arrived` 타입 제거(허용 목록·본문·인앱 타이틀·arrived 0권 가드),
   `inspection_done` 변수 제거.
3. **[adminNotification.js](src/lib/adminNotification.js)** — `notifySold`/`notifyArrived` 제거,
   `notifyInspectionDone`의 `inspectionResult` 조립 제거.
4. **[auto-confirm-orders.js](api/admin/auto-confirm-orders.js)** — `notifySellerSold` 호출 제거.
5. **[AdminShipmentDetailPage.jsx](src/pages/AdminShipmentDetailPage.jsx)** — `inspecting` 전환 시
   `notifyArrived` 호출 제거.
6. **[send-phone-otp.js](../public-web/api/auth/send-phone-otp.js)** — SMS 단문 → 알림톡
   (`kakaoOptions` + 실패 시 SMS 대체발송). 구현 시 솔라피 kakaoOptions 명세 재확인.
7. **shared-domain [notification.js](../../packages/shared-domain/src/notification.js)** — 레거시
   정리(과거 알림 이력 라벨은 유지 검토).
8. **backend/api 미러** — admin api 수정분을 `backend/api/admin/`에 복사·커밋.
9. 타입별 **테스트 발송 1건씩** + 알림 로그·인앱 알림 확인.
10. 인앱(사이트 내) 알림에서도 `sold`/`arrived`를 함께 중단할지 최종 확인 (기본: 함께 중단).

## 솔라피 계정·연동 재사용 (변경 없음)

카카오 채널(@subook)·발신프로필(pfId)·발신번호·API 키는 그대로 재사용 —
템플릿만 교체하므로 `SOLAPI_API_KEY`/`SOLAPI_API_SECRET`/`SOLAPI_PFID`/`SOLAPI_FROM`은 건드리지 않는다.
