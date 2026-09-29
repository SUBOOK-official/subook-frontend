# 배너 20자 AI 문구: 백엔드 연결 대기

현재 운영 연결은 하지 않았다. 프런트는 직접 작성한 교재별 문구를 사용하며 방문 중 AI 호출은 없다.

준비한 초안:
- `docs/migrations/20261001_banner_copy.sql`: 문구 캐시 + 서버 간 원자적 생성 잠금. DB 적용 전.
- `packages/shared-domain/src/bannerCopyGeneration.js`: GPT-4.1 mini로 기존 상품 정보/AI 요약을 20자 이내 문구로 생성, 길이 검증.
- `apps/public-web/api/banner-copy.js`: GET은 추천 상위 최대 13개의 저장된 문구만 반환. `?refresh=1`은 CRON_SECRET 인증 후 변경된 원문만 생성. 아직 스케줄 등록 전.

백엔드에서 할 일:
1. SQL 적용 및 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `CRON_SECRET` 서버 환경변수 설정. 키는 VITE 변수로 노출하지 않는다.
2. 추천 상위 최대 13개 조회 RPC가 실제 반환하는 `id`와 products 테이블 권한을 검증한다.
3. 인증된 스케줄러가 10분마다 `/api/banner-copy?refresh=1`을 호출하도록 등록한다. 방문자 GET은 AI 생성 경로로 들어가지 않는다.
4. 초기 생성 실행 후 프런트 `useAutomaticBookBanners`에서 `/api/banner-copy`의 `{copies:[{product_id,copy}]}`를 읽어 직접 작성 문구보다 우선 적용한다. 실패/빈 결과는 기존 문구 유지.
5. 운영에서 중복 실행 잠금, 20자 제한, 원문 변경 후 재생성, 실패 후 1시간 재시도 대기, 순위 변경을 확인한다.

같은 원문 해시는 재생성하지 않는다. 순위에서 빠졌다 다시 들어온 교재도 기존 저장 문구를 재사용한다. 가격/재고 변화만으로는 생성하지 않는다. API 원문 또는 서버 키는 응답·로그에 노출하지 않는다.
