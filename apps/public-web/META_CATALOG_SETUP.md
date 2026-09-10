# Meta 카탈로그 자동 연동

2026-09-11 구축. 기존 카탈로그 `1603666397994237`, 픽셀 `27962792746720705` 기준.

## 운영 방식

- 현재 연결할 URL: `https://subook.kr/api/meta-catalog?scope=jeonil`
  - 전일학원 현재 광고 3종(2370, 2371, 2437)만 포함. 신상품이 생겨도 자동으로 광고 범위가 넓어지지 않는다.
- 전체 교재용 URL: `https://subook.kr/api/meta-catalog?scope=all`
  - 공개 판매 교재를 자동으로 포함한다. 현재 카탈로그에는 이 URL을 연결하지 않는다.
- 커머스 관리자 → 카탈로그 → 제품 피드 연동에서 URL 데이터 파일을 **매시간** 가져오도록 설정한다.
- 제목·대표 이미지·정가·판매가·재고 상태는 수북 데이터에서 갱신한다. 운영자는 수북에서 수정한다.
- 옵션이 여러 개면 현재 공개 판매 옵션의 최저가와 해당 옵션의 정가를 보낸다. 모든 옵션은 기존 픽셀과 같은 상품 ID 하나로 묶인다.
- 매시간 수집 방식이므로 즉시 반영은 아니며, 예약 시각까지의 지연과 Meta 처리 시간이 생긴다. API 캐시는 최대 60초다.

## ID와 상품 선택

기존 상품을 삭제/재등록하지 않는다. 기존 Meta 콘텐츠 ID를 유지한다.

| 수북 상품 ID | Meta 콘텐츠 ID |
| --- | --- |
| 2370 | gxav9zwrza |
| 2371 | 417vdy5t1z |
| 2437 | n7llsz4qrh |

새 일반 교재는 수북 상품 ID 문자열을 그대로 사용한다. `/store/2500`의 ID는 `2500`이다.
`custom_label_0=jeonil/general`, `custom_label_1=과목명`으로 상품 세트를 나눌 수 있다.

전체 교재 광고를 시작할 때:

1. 현재 광고가 `모든 제품`을 쓰는지 확인한다. 전일학원만 유지할 광고는 위 3종의 고정 상품 세트를 선택한다.
2. 같은 데이터 피드의 URL을 `scope=all`로 변경한다. 같은 상품 ID가 여러 기본 피드에 중복되지 않게 한다.
3. 필요한 과목·브랜드·상품으로 상품 세트를 만들고 해당 광고에서 선택한다.
4. 피드 처리 오류, 이미지·가격, 광고 미리보기, 픽셀의 상품 ID 매칭을 확인한다.

## 품절·숨김·장애

- 수북은 판매 후 `books.is_public=false`, 최종 재고 소진 후 상품 `hidden`으로 전환한다.
- 이미 피드에 공급했던 상품은 서버 전용 `meta_catalog_snapshots`에 **마지막 공개 상품 필드만** 보존한다. 현재 공개 목록에서 빠지면 기존 ID와 필드를 유지하고 `out of stock`으로 갱신한다. 재입고되면 다시 `in stock`이 된다.
- 처음부터 숨김이거나 출시 전인 상품은 새로 공급하지 않는다. 이전에 공개됐다가 숨겨진 상품의 새 비공개 정보도 공급하지 않는다.
- 회원·주문·정산·배송 정보와 재고의 권별 수량은 피드에 포함하지 않는다.
- 공개 상품의 가격·브랜드·표지·제목이 없거나 DB 조회가 실패하면 **503**을 반환한다. 정상처럼 보이는 부분/빈 파일로 기존 카탈로그를 덮지 않는다.
- `X-Catalog-Products` 응답 헤더가 공급 상품 수다. 오류 시 Vercel의 `[meta-catalog] feed unavailable` 로그와 Meta 업로드 진단을 확인한다.

## 구현·배포

- public-web `/api/meta-catalog.js` → shared-supabase 읽기/저장 경계 → shared-domain CSV 생성.
- 공개 판매 재고를 명시된 열만 읽고, 정확한 count와 ID 커서로 페이지 누락을 방지한다.
- backend migration `20260910173143_meta_catalog_snapshots.sql`: 전용 캐시 테이블과 service_role 전용 RPC. RLS 활성화, anon/authenticated 권한 없음. 기존 상품/결제 테이블을 바꾸지 않는다.
- 늦게 끝난 이전 요청은 관측 시각 비교로 최신 가격·재고를 덮지 못한다.
- 새 환경 변수를 추가하지 않는다. 기존 프리렌더의 Supabase URL과 `SUPABASE_SERVICE_ROLE_KEY` 또는 `SUPABASE_SERVICE_KEY`를 사용한다.
- public 배포 스크립트는 API 진입점에서 원래 frontend 경로를 재수출해 shared 모듈의 상대 import를 보존한다.
- API 연결 전에 backend migration을 적용한다. 중지 시 Meta의 해당 피드 예약을 비활성화하고 원인을 해결한다. 전용 캐시를 지울 필요는 없다.

## 공식 근거

- [Meta 피드 필드·CSV 형식](https://developers.facebook.com/documentation/ads-commerce/catalog/reference)
- [Meta 예약 피드·시간당 갱신·품절 ID 유지](https://developers.facebook.com/documentation/ads-commerce/catalog/guides/scheduled-feeds)
- [Meta 카탈로그와 피드의 관계](https://developers.facebook.com/documentation/ads-commerce/catalog/overview)
- [PostgREST pagination/count](https://docs.postgrest.org/en/stable/references/api/pagination_count.html)
