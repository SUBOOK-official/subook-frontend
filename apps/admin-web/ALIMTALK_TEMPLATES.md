# 카카오 알림톡 템플릿 — 검수 제출용 (수북)

> 작성 2026-06-22. 발송 대행사 = **솔라피(SOLAPI)** ([send-notification.js](api/admin/send-notification.js)).
> 카카오 알림톡은 **정보성 메시지만** 허용 — 광고·구매유도·쿠폰/포인트 사용유도는 반려.
> 규칙 출처: [카카오 심사 가이드](https://kakaobusiness.gitbook.io/main/ad/infotalk/audit), [NHN Cloud 콘솔 가이드](https://docs.nhncloud.com/ko/Notification/KakaoTalk%20Bizmessage/ko/alimtalk-console-guide/)

## 작성 규칙 (검수 통과용)
- 변수는 `#{변수명}`. **모든 변수에 예시 텍스트 필수**, 변수로만 구성 금지, 버튼명에 변수 금지, 전체 1,000자 이내.
- 본문은 거래/계약 관계에서 **반드시 전달되는 정보**로만. "무료/할인/바로 구매/이벤트" 등 금지.
- 링크는 본문보다 **버튼(웹링크)**으로 빼는 게 권장. 버튼 URL에는 변수 사용 가능.
- 코드의 `templateVariables` 키 === 카카오 템플릿 `#{변수}` 키 (정확히 일치해야 치환됨).

---

## 1. 수거 접수 완료 (셀러) — `SB_PICKUP_ACCEPTED`
```
[수북] 수거 접수 완료
요청번호: #{requestNumber}
교재: #{itemCount}권
운송장: #{trackingNumber}

택배기사가 1~2일 내에 방문 수거합니다.
```
- 변수: `requestNumber`(예: PU-2606-0001), `itemCount`(예: 5), `trackingNumber`(예: 123456789012)

## 2. 교재 입고 완료 (셀러) — `SB_ARRIVED`
```
[수북] 교재 입고 완료
교재 #{itemCount}권이 도착했습니다.
검수를 시작하며, 결과는 1~3일 내에 안내드립니다.
```
- 변수: `itemCount`(예: 5)

## 3. 검수 완료 (셀러) — `SB_INSPECTION_DONE`
```
[수북] 검수 완료
#{inspectionResult}
마이페이지에서 상세 내역을 확인하실 수 있습니다.
```
- 변수: `inspectionResult`(예: `▸ 2026 수능특강 수학: A+ / 8,000원\n▸ 자이스토리 수학: A / 6,000원`)
- ⚠️ 코드 정렬 필요: 기존 `items` 배열 → `inspectionResult` 문자열 1개로 합쳐 전달.

## 4. 판매 완료 (셀러) — `SB_SOLD`
```
[수북] 교재 판매 완료
#{bookTitle}이(가) 판매되었습니다.
정산 예정일: #{settlementDate}
```
- 변수: `bookTitle`(예: 2026 수능특강 수학), `settlementDate`(예: 2026-06-25)

## 5. 정산 완료 (셀러) — `SB_SETTLEMENT_DONE`
```
[수북] 정산 완료
정산 금액: #{amount}원
입금 계좌: #{bankName} ****#{accountLast4}
마이페이지에서 확인하실 수 있습니다.
```
- 변수: `amount`(예: 24,000), `bankName`(예: 카카오뱅크), `accountLast4`(예: 6506)

## 6. 주문 확인 (구매자) — `SB_ORDER_CONFIRMED`
```
[수북] 주문 확인
주문번호: #{orderNumber}
#{itemSummary}
결제 금액: #{totalAmount}원
배송 예상: 2~3일
```
- 변수: `orderNumber`(예: ORD-2606-0042), `itemSummary`(예: 수학의 정석 외 2건), `totalAmount`(예: 23,500)
- ⚠️ 코드 정렬 필요: 기존 `firstItemTitle`+`extraCount` 조건부 → `itemSummary` 문자열 1개로 전달.

## 7. 배송 시작 (구매자) — `SB_SHIPPING_STARTED`
```
[수북] 배송 시작
주문하신 교재가 발송되었습니다.
운송장: CJ대한통운 #{trackingNumber}
```
- 변수: `trackingNumber`(예: 123456789012)
- 버튼(웹링크): 명 `배송 조회` / URL `https://www.cjlogistics.com/ko/tool/parcel/tracking` (배송추적 URL은 본문 변수 대신 버튼 권장)

## 8. 배송 완료 (구매자) — `SB_DELIVERY_DONE`
```
[수북] 교재 도착
주문하신 교재가 도착했습니다.
확인 후 구매확정을 부탁드립니다.
배송완료 7일 후 자동으로 구매확정됩니다.
```
- 변수: 없음 (고정 정보성 메시지 — 허용)

## 9. 재입고 알림 (구매자) — `SB_RESTOCK`
```
[수북] 재입고 알림
찜하신 교재 "#{productTitle}"이(가) 재입고되었습니다.
마이페이지 찜 목록에서 확인하실 수 있습니다.
```
- 변수: `productTitle`(예: 2026 자이스토리 수학)
- 버튼(웹링크, 선택): 명 `상품 보기` / URL `https://subook.kr/store/#{productId}`
- ⚠️ 코드 정렬 필요: 기존 "바로 구매하실 수 있어요"(구매유도→반려) 제거. 찜=이용자의 적극적 행위라 재입고 사실 전달은 정보성으로 인정.

## 10. 환불 완료 (구매자) — `SB_REFUND_COMPLETED`
```
[수북] 환불 완료
주문번호: #{orderNumber}
환불 금액: #{totalAmount}원
사유: #{reason}
영업일 기준 2~5일 내 카드사·은행을 통해 환불됩니다.
```
- 변수: `orderNumber`(예: ORD-2606-0042), `totalAmount`(예: 23,500), `reason`(예: 단순 변심)

> ※ 정산 회수(SB_SETTLEMENT_RECOVERY)는 제거됨 — 정산완료 후 환불은 회사 손실로만 처리(셀러 정산 유지, 회수 알림 없음). 등록하지 않습니다.

---

## 외부 설정 절차 (솔라피 / SOLAPI)

> 발송 대행사 = 솔라피. 선불 충전식·즉시 가입(NHN의 사업자회원/계좌이체 장벽 없음). 가입·발신프로필·템플릿 검수 모두 솔라피 콘솔에서.

1. **카카오톡 채널** — 수북 `@subook` 비즈니스 채널 전환 완료(사업자 인증). 그대로 재사용.
2. **솔라피 가입** — [solapi.com](https://solapi.com) 회원가입. 세금계산서 받으려면 사업자 정보 입력.
3. **카카오 채널 연동(발신프로필)** — 콘솔에서 채널 검색용 아이디(`@subook`) + 담당자 휴대폰 입력 → 인증 → **pfId 발급**.
4. **발신번호 등록** — SMS 발신번호(휴대폰) 등록·인증 (알림톡 `from` + 실패 시 문자 대체용).
5. **템플릿 10종 등록 + 검수** — 위 10종을 알림톡 템플릿으로 등록(본문 `#{변수}`, 변수 예시, 버튼) → 검수 요청 → 카카오 심사(영업일 2일). 승인되면 각 **templateId** 확보. ⚠️ 등록 후 수정 불가 — 제출 전 확인.
6. **API 키 발급** — 콘솔 개발/API 설정에서 **API Key + API Secret** 발급.
7. **env 설정** (admin-web Vercel 프로젝트):
   - `SOLAPI_API_KEY` / `SOLAPI_API_SECRET` — 콘솔 API 키
   - `SOLAPI_PFID` — 연동한 카카오 채널의 pfId
   - `SOLAPI_FROM` — 등록한 발신번호 (예: `01012345678`)
   - `SOLAPI_TEMPLATE_IDS` — 타입→templateId JSON. 예:
     ```json
     {"pickup_accepted":"KA01TP...","arrived":"...","inspection_done":"...","sold":"...","settlement_done":"...","order_confirmed":"...","shipping_started":"...","delivery_done":"...","restock":"...","refund_completed":"..."}
     ```
   - (선택) `SOLAPI_ENABLE_SMS_FALLBACK=true` — 알림톡 실패 시 문자 대체발송(추가 과금, 8.4원/건)

> 검수 반려되면 사유 캡처 → 본문만 고쳐 재제출. 키·templateId·pfId 다 나오면 개발자에게 전달 → env 연결 + 테스트 발송 1건으로 확인.
