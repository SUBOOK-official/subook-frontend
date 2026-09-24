# 홈 배너·팝업 운영

관리자 메뉴 **콘텐츠 → 배너·팝업** (`/admin/promotions`)에서 관리한다.

1. **새 배너·팝업**에서 홈 상단 배너 / 홈 팝업을 선택한다.
2. 기본 이미지와 필요하면 모바일 이미지를 업로드한다. JPG·PNG·WebP 원본은 각 25MB까지 선택 가능하며, 업로드 전에 브라우저에서 자동 축소·WebP 압축한다. 처리 후 원본/결과 용량, 절감률과 해상도를 표시한다.
3. 이미지 설명과 클릭 시 연결 주소를 입력한다. 내부 경로(`/sell`, `/mypage#coupons`, `/#products`) 또는 HTTPS 주소를 사용한다. 연결 주소를 비우면 클릭 이동하지 않는다.
4. 순서 숫자가 작은 항목이 먼저 표시된다. 같은 숫자는 ID 순서로 고정되므로 원하는 순서를 명확히 하려면 서로 다른 숫자를 쓴다.
5. 시작·종료 시각은 **한국시간**이다. 종료 시각은 입력한 분 전체를 포함한다. `2026-09-28 23:59` → `2026-09-29 00:00`부터 미노출.
6. **노출 사용**을 켜고 저장한다. 체크하지 않으면 초안으로 보관된다. 목록에서 **노출 끄기**로 즉시 내릴 수 있다.

저장 이후 새로 연 홈에 반영된다. 이미 열려 있는 홈은 30초 간격과 창 복귀 시 다시 조회하며, 불러온 항목의 종료 시각에는 열린 팝업도 닫힌다. 통신 장애 시 배너·팝업 영역은 숨기고 상품 탐색을 유지한다.

팝업은 항목별로 닫기 상태를 브라우저 세션에 저장한다. 기존 항목의 이미지만 수정해도 이미 닫은 방문자에게 강제로 다시 표시하지 않는다. 새 캠페인은 새 항목으로 등록한다.

이미지 최적화는 **파일 업로드**에 적용한다. 외부 이미지 주소를 직접 입력한 경우에는 해당 파일을 변경하지 않는다. PC 배너는 최대 폭 3200px, 모바일 배너 1280px, 팝업 1200px이며 공통 최대 높이는 2000px이다. 비율·투명 배경을 유지하고 크롭하거나 확대하지 않는다. 목표 용량은 600KB지만 글자 선명도를 위해 과도하게 해상도를 낮추지 않으며 최종 저장 한도는 5MB다. 이미 작은 WebP 또는 변환으로 더 커지는 파일은 원본을 유지한다. 움직이는 WebP/APNG는 애니메이션을 보존하여 5MB 이하 원본으로만 업로드한다.

변환은 [Canvas toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)과 [createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap)을 사용한다. WebP 인코딩 미지원 브라우저의 PNG 결과도 실제 MIME에 맞춰 저장한다.

## 2026-09-25 이관

- ‘대치동 현강 희귀 모의고사부터…’ 홈 배너는 **비노출**로 보관.
- 전일학원·교재 판매·FAQ 배너는 기존 순서 유지.
- 추석 팝업은 쿠폰함으로 연결하고 **9월 28일 23:59 KST까지** 노출. 쿠폰 자체의 유효기간은 변경하지 않음.
- 과거 종료된 전일학원 출시 알림·카카오 쿠폰 팝업은 등록하지 않음.

## 개발·권한

`site_promotions` 테이블과 `site-promotions` Storage 버킷을 사용한다. 배포 전 backend의 `20260924165808_site_promotions.sql`을 적용한다. 기존 배너 이미지는 공개 `/banners/` 경로를 유지하고, 새 업로드는 UUID별 Storage 경로에 저장한다.

RLS로 관리자만 CRUD/업로드 가능하며, 익명·일반 회원은 노출 기간 내 활성 항목만 읽을 수 있다. 동시 수정은 `updated_at` 비교로 감지한다. 항목 삭제가 업로드 이미지를 삭제하지는 않는다. 다른 항목이 같은 이미지를 사용할 수 있으므로 자산 정리는 별도 확인 후 수행한다.

확인한 공식 문서: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage 권한](https://supabase.com/docs/guides/storage/security/access-control), [이미지 업로드](https://supabase.com/docs/reference/javascript/file-buckets-upload), [조회 타임아웃](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal).

검증: 공개 테스트의 `sitePromotions.test.js`, backend의 `tests/site-promotions.test.js` (격리 PostgreSQL에서 실제 migration·RLS 실행), 관리자 UI 등록/수정/노출 전환, 운영 DB 권한 검증(트랜잭션 롤백), 실제 Storage 업로드·공개 읽기·검증 자산 제거.
