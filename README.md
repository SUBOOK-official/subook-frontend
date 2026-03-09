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
```

- `apps/seller-lookup` -> `seller.subook.kr`
- `apps/admin-web` -> `admin.subook.kr`
- `apps/public-web` -> 향후 `subook.kr`
