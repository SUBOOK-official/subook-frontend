# subook-frontend

수북 프론트엔드 협업용 저장소입니다.

```text
apps/
  admin-web/
  seller-lookup/
  public-web/
packages/
  shared-domain/
  shared-supabase/
```

## 로컬 실행

```bash
npm install
npm run dev:seller
npm run dev:admin
```

## 환경 변수

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_SELLER_LOOKUP_ORIGIN=https://seller.subook.kr
GEMINI_API_KEY=your-google-ai-studio-api-key
```

## 빌드

```bash
npm run build:seller
npm run build:admin
npm run build:public
```

- `apps/seller-lookup` -> `seller.subook.kr`
- `apps/admin-web` -> `admin.subook.kr`
- `apps/public-web` -> 향후 `subook.kr`

## public-web 배포

`apps/public-web`는 `packages/shared-domain`, `packages/shared-supabase`를 함께 올려야 하므로
`apps/public-web` 디렉터리에서 직접 `vercel deploy` 하지 않습니다.

항상 아래 명령만 사용합니다.

```bash
npm run deploy:public
```

미리보기 배포가 필요하면:

```bash
npm run deploy:public:preview
```

이 스크립트는 아래를 자동으로 처리합니다.

- 로컬 `build:public` 사전 검증
- `frontend` 워크스페이스 전체를 임시 staging 디렉터리로 복사
- `subook-public-web-temp` 전용 `.vercel/project.json`만 적용
- `vercel.deploy.json` 기준으로 Vercel 배포
