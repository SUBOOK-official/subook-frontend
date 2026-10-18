# 상품 사진 사전 생성 (2026-10-19)

Supabase Pro의 이미지 변환 포함량을 초과해 상품 사진 조회 시 `render/image`를 호출하지 않도록 변경했다. 원본과 DB의 URL은 유지하고, 업로드 시 브라우저에서 축소본을 생성하여 같은 공개 버킷에 저장한다.

## 파일 계약

- 대상: `product-covers`, `inspection-images`.
- 원본 `register/book.png` → `__variants/v1/register/book.png.400.jpg`, `.900.jpg`, `.1600.jpg`.
- 가로 크기 400/900/1600px, JPEG 품질 82/88/93. 비율·EXIF 방향 유지, 원본보다 확대하지 않음. 투명 배경은 흰색, GIF 축소본은 첫 프레임. 원본은 변경하지 않는다.
- 새 원본과 축소본은 `cacheControl: 31536000`. 업로드마다 새 경로를 사용하고 덮어쓰지 않는다. 기존 파일을 수정해야 하면 반드시 새 원본 경로를 사용한다.
- 축소본 세 개 저장 후 원본을 저장하고 URL을 반환한다. 실패 시 새 파일 정리를 시도하고 등록을 중단한다. Storage HTTP 요청에는 30초 제한과 최대 3회 재시도가 적용된다.
- 등록·수정·일괄 스튜디오·검수·스캐너는 공통 `adminImageUpload.js`를 사용한다. 스캐너 삭제는 원본·축소본을 함께 정리한다.
- `storageImage.js`가 카드/상세/확대용 URL을 매핑한다. 누락 축소본은 브라우저에서 원본으로 한 번만 복구하며, 유료 변환 API로 돌아가지 않는다.
- 후기 사진은 기존 업로드 전 1600px 최적화 파일을 직접 제공한다. 다른 버킷·외부·비공개 URL은 사전 생성 대상이 아니다.
- 검색봇/공유 미리보기는 `api/prerender-product.js`의 동일 경로 규칙을 사용한다. API 패키징 제약 때문에 최소 구현을 복제하며 계약 테스트로 동기화를 검증한다.

## 기존 파일 적용

저장소 루트에서 실행한다. 서비스 키는 루트 `.env.local`, 프로젝트 URL은 `frontend/.env`에서 읽고 프로젝트 ref 일치를 검사한다. 키는 출력하지 않는다. DB·RLS·버킷 설정 변경은 없다.

```powershell
node frontend/scripts/backfill-product-images.mjs
node frontend/scripts/backfill-product-images.mjs --write --concurrency=8
node frontend/scripts/backfill-product-images.mjs --verify
```

첫 명령은 파일 목록만 검사한다. `--write`는 미생성/빈 축소본만 생성하며 원본은 건드리지 않는다. 완료 로그는 루트 `.tmp/product-image-backfill.jsonl`에 남는다. 중단 후 같은 명령으로 재개할 수 있다. `--limit=10`으로 표본 처리도 가능하다. `--verify`는 전 파일 목록의 3종 축소본 존재/크기와 버킷·폴더별 표본의 공개 HTTP 응답, JPEG 형식, 가로 크기, 캐시 헤더를 확인한다. `--write`와 `--verify`는 별도 실행한다.

처음 확인한 원본은 표지 1,506장 + 상세·검수 1,707장 = 3,213장(약 2,970MiB). 판매중뿐 아니라 숨김/품절·과거 주문에서 참조하는 파일도 포함해 버킷 전체를 처리한다.

관리자 배포 후 열려 있던 이전 관리자 탭은 새로고침한다. 전환 중 이전 코드가 올린 원본은 마지막에 backfill을 한 번 더 실행해 보완한다. 공개 웹 배포는 backfill 전체 검증 후 진행한다.

## 검증 및 되돌리기

- `npm --prefix frontend run lint`, `test:public`, `test:admin`, public/admin build.
- `node frontend/scripts/verify-product-images.mjs` → `http://localhost:4187`의 검증 버튼으로 실제 브라우저 JPEG 인코딩, 세로 비율, EXIF 회전, 축소본 우선 업로드를 확인한다. 이 페이지는 모의 저장소만 사용한다.
- 실제 공개 목록·상세에서 이미지 `src`가 `/object/public/.../__variants/v1/`이며 정상 로드되는지 확인한다. `/render/image/` 요청은 없어야 한다.
- 롤백 시 이전 프론트 커밋을 배포하면 기존 원본 URL을 계속 사용할 수 있다. 추가 파일은 복구를 방해하지 않으므로 운영 중 일괄 삭제하지 않는다. 이전 코드 복귀는 이미지 변환 사용량을 다시 발생시킨다.
- 이미 집계된 결제 주기 사용량은 이 변경으로 취소되지 않는다. 이후 새 프론트의 이미지 조회에서 변환 호출을 제거하는 변경이다. Storage 저장 용량·파일 전송량 과금은 계속 적용된다.

공식 근거(2026-10-19 확인): [이미지 변환 과금/사전 생성 권장](https://supabase.com/docs/guides/platform/manage-your-usage/storage-image-transformations), [표준 업로드](https://supabase.com/docs/guides/storage/uploads/standard-uploads), [캐시와 파일 교체](https://supabase.com/docs/guides/storage/cdn/smart-cdn), [custom fetch](https://supabase.com/docs/reference/javascript/initializing), [sharp resize](https://sharp.pixelplumbing.com/api-resize/).
