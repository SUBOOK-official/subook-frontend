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
- 가로가 세로보다 긴 입력은 눕혀 촬영한 세로형 교재·모의고사로 간주하고, 표지 글자가 똑바로 읽히는 방향으로 전체를 90도 회전한 뒤 가공하도록 프롬프트에서 지시한다. 회전 방향은 이미지 모델이 판단한다. 긴 모의고사 비율·표지 전체·여백을 보존하며 늘이기·자르기·글자만 회전하기를 금지한다. 세로·정사각 입력은 기존 정방향을 유지한다.
- 전송 한도 이내이고 긴 변이 3072px 이하인 JPEG/PNG/WebP는 원본 바이트를 사용한다. 큰 입력만 최대 3072px로 축소·압축한다.
- 서버 요청 base64 한도 3,000,000자, 응답 한도 4,200,000자. PNG 비교 결과는 약 6MB여서 운영 전송에는 JPEG를 사용한다.
- 기존 응답 `{ imageBase64, mimeType }`와 관리자 인증을 유지한다. 업로드 파일 확장자는 `.jpg`다.
- 전체 요청 예산 200초, 시도당 최대 150초. 명시적 429·5xx 응답은 최대 한 번 재시도한다. 크레딧 부족, 인증 오류, 연결 단절, 시간 초과, 완성 응답 검증 실패는 자동 재생성하지 않는다.
- 오류가 나면 운영자에게 안내하고 기존 사진 업로드 완료로 처리하지 않는다. Gemini로 자동 전환하지 않는다.

## 확인 및 관찰

```powershell
node --test frontend/apps/admin-web/tests/studioImage.test.js frontend/apps/admin-web/tests/studioClient.test.js
```

성공 로그 `[book-studio] OpenAI image generated`에 모델, 품질, 크기, requestId, 처리 시간, usage가 남는다. 키·원본 사진·생성 이미지 base64는 로그에 남기지 않는다.

2026-09-23 비교 샘플의 medium 응답은 이미지 입력 1,485토큰, 텍스트 338토큰, 출력 892토큰이었다. 당시 공식 표준 단가를 적용하면 입력 포함 $0.04033/장이며 전체 교재 평균은 아니다. 기존 PNG 비교와 운영 JPEG 출력은 포맷과 일반화한 프롬프트가 달라 결과가 완전히 같다고 보장하지 않는다.

## 근거

- [OpenAI 편집 API](https://developers.openai.com/api/reference/resources/images/methods/edit)
- [OpenAI 이미지 생성·출력 옵션](https://developers.openai.com/api/docs/guides/image-generation)
- [Vercel 요청·응답 제한](https://vercel.com/docs/functions/limitations#request-body-size)
