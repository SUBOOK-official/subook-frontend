# 배너 20자 AI 문구 자동 생성

홈 추천 상위 최대 13개 교재의 제목·과목·브랜드·유형·기존 AI 요약에서 한국어 문구를 만든다. 상품 AI 요약과 같은 Gemini 3.8 Flash(LOW)를 사용한다. 기존 상품·가격·재고·상세 AI 요약은 수정하지 않는다.

## 운영 흐름

- Vercel production cron이 10분마다 `/api/banner-copy?refresh=1` 호출. 기존 `CRON_SECRET`의 Bearer 인증을 검증한다.
- Supabase `banner_copy_cache`의 5분 잠금으로 중복 실행을 방지한다. 같은 원문은 다시 생성하지 않고, 실패한 교재는 1시간 뒤 재시도한다. 한 실행 최대 13개, 동시 생성 최대 3개다.
- 20자 제한, 한 줄 출력, 완료 응답을 검증한다. 요청 타임아웃 12초, 일시 오류 또는 출력 검증 실패에 한 번 재시도한다.
- 생성 중 원문이 바뀌면 저장을 거절한다. 공개 RPC는 현재 추천 목록 중 원문 해시가 같은 문구만 반환한다. 가격·재고·순위만 바뀌어도 기존 문구를 재사용한다.
- 방문자 GET은 읽기 전용이다. 프런트는 저장된 문구를 우선 표시하고, 실패·빈 결과는 기존 편집 문구로 대체한다. 느린 문구 조회가 최초 배너 표시를 막지 않는다.

## 배포

1. backend 정식 migration `20260930031759_banner_copy_cache.sql`을 dry-run 후 적용한다. frontend의 SQL 초안은 제거했다.
2. public Vercel 프로젝트에 서버 전용 `GEMINI_API_KEY`가 필요하다. 기존 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_PUBLIC_ANON_KEY`, `CRON_SECRET`을 재사용한다. **Gemini/service/cron 키는 VITE 변수에 넣지 않는다.**
3. 루트 `npm run deploy:public`로 cron과 최대 실행시간 180초 설정을 함께 배포한다. 원격 빌더가 cron을 읽도록 배포 설정은 스테이징 루트의 `vercel.json`으로 복사한다. `banner-copy.entry.cjs`가 원래 ESM 의존성 경로를 보존한다.
4. 인증된 초기 refresh를 실행하고 GET 결과 및 홈 문구를 확인한다. 같은 원문으로 재실행 시 `generated: 0`이어야 한다.

검증: frontend `npm run test:public`, `npm run test:deploy`; backend `node scripts/test-banner-copy.mjs`. 롤백은 cron 설정 제거 및 기존 문구로 복귀하며 캐시는 보존할 수 있다.

공식 근거: [Gemini 모델·thinking 설정](https://ai.google.dev/gemini-api/docs/generate-content/latest-model), [Vercel cron 인증·실행](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Supabase 함수 권한](https://supabase.com/docs/guides/database/functions).
