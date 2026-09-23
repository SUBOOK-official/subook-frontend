# 교재 표지 가공 API

2026-09-23 사용자 선택에 따라 상품 등록의 자동 표지 변환과 사진 스튜디오는 GPT Image 2.5 Sunburst `medium`을 사용한다.

## 운영 설정

- 관리자 Vercel 프로젝트 `subook-admin-web`에 서버 전용 `OPENAI_API_KEY` 필요. `VITE_` 접두사를 붙이지 않는다.
- 이미지 요청 권한만 있는 운영용 키를 사용한다. 2026-09-30에 만료되는 초기 비교용 키를 운영에 연결하지 않는다.
- 상품 설명(`mode: "summary"`)과 교재 인식(`cover-scan`)은 Gemini를 계속 사용하므로 `GEMINI_API_KEY`를 삭제하지 않는다.
- `api/admin/book-studio.js`와 `api/_lib/studioImage.js`는 backend 저장소의 같은 경로와 동기화한다.

## 변환 계약

- OpenAI `POST /v1/images/edits`, 모델 `gpt-image-2.5-sunburst`, 품질 `medium`, 2048×2048, JPEG 압축값 90, 요청당 한 장.
- 모델·품질은 서버가 고정하며 클라이언트 입력으로 변경할 수 없다.
- 가로가 세로보다 긴 실물 사진은 클라이언트에서 시계 방향 90도만 회전한다. 사용자가 교재 윗부분을 사진 왼쪽에 두고 촬영한다고 확인했다. W×H → H×W이며 특정 목표 비율이 없다. 픽셀 재배치만 수행하고 크롭·늘이기·원본 축소 없이 PNG로 보관한다. 세로·정사각 입력은 원본 File을 그대로 유지한다.
- 상품 등록에서 표지 실물 원본을 AI 호출 전에 별도로 보관한다. 상세 사진이 비어 있으면 이 원본 URL을 `inspection_image_urls`로 전송한다. 직접 첨부한 상세 사진이 있으면 이를 우선한다. 원본 URL은 작성 초안과 옵션 재편집에서도 유지한다. 과거 AI 표지만 남은 상품의 실물 원본은 자동 복구할 수 없다.
- AI 입력은 회전된 원본을 사용한다. 프롬프트는 다시 회전하거나 표지 비율을 재해석하지 말고, 가로·세로에 같은 배율만 적용하도록 지시한다. 정사각 출력 캔버스는 배경 여백이며 표지 자체의 비율이 아니다. 상세페이지 실물 사진은 생성형 AI를 거치지 않으므로 픽셀 비율 보존을 AI 응답에 의존하지 않는다.
- 전송 한도 이내이고 긴 변이 3072px 이하인 JPEG/PNG/WebP는 원본 바이트를 사용한다. 큰 입력만 최대 3072px로 축소·압축한다.
- 서버 요청 base64 한도 3,000,000자, 응답 한도 4,200,000자. PNG 비교 결과는 약 6MB여서 운영 전송에는 JPEG를 사용한다.
- 기존 응답 `{ imageBase64, mimeType }`와 관리자 인증을 유지한다. 업로드 파일 확장자는 `.jpg`다.
- 전체 요청 예산 200초, 시도당 최대 150초. 명시적 429·5xx 응답은 최대 한 번 재시도한다. 크레딧 부족, 인증 오류, 연결 단절, 시간 초과, 완성 응답 검증 실패는 자동 재생성하지 않는다.
- 오류가 나면 운영자에게 안내하고 기존 사진 업로드 완료로 처리하지 않는다. Gemini로 자동 전환하지 않는다.

## 확인 및 관찰

```powershell
node --test frontend/apps/admin-web/tests/studioImage.test.js frontend/apps/admin-web/tests/studioClient.test.js frontend/apps/admin-web/tests/registrationPhotos.test.js
```

개발 서버의 `/tests/photo-orientation.browser.html`에서 실제 브라우저 Canvas를 검증한다. 임의 비율 사진의 모든 픽셀 위치·RGBA 일치, 큰 사진의 정확한 폭/높이 교환, 세로·정사각 원본 유지, 중복 회전 방지 및 AI 입력 방향을 확인한다.

성공 로그 `[book-studio] OpenAI image generated`에 모델, 품질, 크기, requestId, 처리 시간, usage가 남는다. 키·원본 사진·생성 이미지 base64는 로그에 남기지 않는다.

2026-09-23 비교 샘플의 medium 응답은 이미지 입력 1,485토큰, 텍스트 338토큰, 출력 892토큰이었다. 당시 공식 표준 단가를 적용하면 입력 포함 $0.04033/장이며 전체 교재 평균은 아니다. 기존 PNG 비교와 운영 JPEG 출력은 포맷과 일반화한 프롬프트가 달라 결과가 완전히 같다고 보장하지 않는다.

## 근거

- [OpenAI 편집 API](https://developers.openai.com/api/reference/resources/images/methods/edit)
- [OpenAI 이미지 생성·출력 옵션](https://developers.openai.com/api/docs/guides/image-generation)
- [Vercel 요청·응답 제한](https://vercel.com/docs/functions/limitations#request-body-size)
- [Canvas 회전 행렬](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/setTransform)
- [Canvas PNG 저장](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)
