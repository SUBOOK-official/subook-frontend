# 2028 수능 자료실

- 경로: `/admin/study-materials`. 기존 관리자 계정 누구나 업로드·열람·다운로드 가능.
- `admin_study_materials`와 비공개 `admin-study-materials` Storage 버킷 사용. 일반 회원/익명 접근 불가.
- PDF만 파일당 1GiB까지, 6MiB TUS 청크로 전송. 진행률·중지·실패 재시도 제공.
- 업로드 후 `admin_register_study_material`이 객체 존재·크기·MIME을 확인해야 목록에 표시.
- 미리보기와 다운로드는 1시간 서명 URL. PDF.js는 범위 요청으로 필요한 페이지 데이터만 읽음.
- Storage가 CORS에서 `Accept-Ranges`를 노출하지 않으므로 `PDFDataRangeTransport`에 등록된 파일 크기를 전달.
- PDF.js의 worker/CMap/폰트/WASM은 같은 패키지 버전으로 앱에서 제공. 외부 뷰어에 PDF를 전달하지 않음.

## 초기 자료 가져오기

워크스페이스 루트에서 실행한다. 인증 값은 기존 `.env`/`.env.local`에서 읽으며 출력하지 않는다.

```powershell
node frontend/scripts/import-study-materials.mjs "C:\Users\진성욱\Desktop\2028-subook\학습 교재"
node frontend/scripts/import-study-materials.mjs "C:\Users\진성욱\Desktop\2028-subook\학습 교재" --upload
```

첫 명령은 형식·용량·PDF 헤더와 분류만 검사한다. 업로드 시 파일 경로+내용 해시로 ID를 고정해 재실행해도 중복하지 않는다. 업로드가 끝난 파일은 크기/MIME 대조 후 등록한다. `--register-only`는 이미 업로드된 객체만 등록한다. `.codex/study-material-import-resume.json`에 미완료 TUS 주소를 임시 보관한다. 완료 후 제거할 수 있다.

원본의 분류를 유지한다. 특히 `통합사회` 폴더 안에 있던 `EBS 50일 통합과학2` 본문/해설도 폴더 기준으로 가져온다.

## 운영 설정

2026-10-10 전체 Storage 파일 한도를 50MiB에서 1GiB로 조정했다. 기존 공개 이미지 버킷의 5MiB/15MiB 제한은 유지한다. 자료실 버킷은 비공개이며 PDF MIME만 허용한다. 새 버킷을 만들 때도 개별 파일 한도를 명시한다.

공식 근거: [Supabase 재개 업로드](https://supabase.com/docs/guides/storage/uploads/resumable-uploads), [Storage 권한](https://supabase.com/docs/guides/storage/security/access-control), [파일 한도](https://supabase.com/docs/guides/storage/uploads/file-limits), [PDF.js 범위 전송](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDataRangeTransport.html).

## 검증

```powershell
node --test backend/tests/admin-study-materials.test.js
node --test frontend/packages/shared-supabase/src/adminStudyMaterialsClient.test.js
npm --prefix frontend run lint
npm --prefix frontend run test:admin
npm --prefix frontend run build:admin
```

DB 테스트는 실제 migration을 PGlite에서 실행해 일반 회원 차단, 모든 관리자 열람, 객체/크기 검증, 재등록 멱등성을 확인한다.
