# 수북 모바일 앱

iOS App Store·Google Play 출시를 목표로 하는 React Native·Expo 앱. **1단계(2026-11-10)**: 앱 화면으로 만든 홈·검색·상품 상세·찜·장바구니 + 앱 안 웹 화면으로 여는 주문·결제·판매 신청·마이페이지. 스토어 제출용 완성본은 아니다(아래 "스토어 출시까지").

## 저장소와 기술 선택

`subook-frontend/apps/mobile`에서 웹과 함께 관리한다. 별도 GitHub 저장소·별도 Supabase 프로젝트는 만들지 않는다. 기존 저장소에 npm workspaces 설정은 없으므로 모바일은 **자체 package-lock.json과 node_modules**로 설치한다. 웹 React 18과 모바일 React 19를 분리하며, Metro는 모바일 의존성만 해석한다.

- Expo SDK 58 / React Native 0.88 / React 19.3. 세로 화면 전용, 밝은 화면만.
- 화면: React Navigation native stack + 하단 탭 5개(홈·검색·판매·찜·마이).
- 데이터: 웹과 같은 Supabase 공개 키·RPC·RLS. 새 권한·서버 키 없음.
  - 공개 목록·상세: `packages/shared-supabase/src/publicCatalogClient.js`
  - 회원 데이터(장바구니·찜·재입고 알림): `packages/shared-supabase/src/mobileAppClient.js`
  - 홈 배너·테마·BEST: 웹 홈과 같은 RPC(`src/lib/catalog.js`)
- 웹과 공유하는 규칙(복제 금지): 옵션 묶기·권당 1권 할당 `public-web/src/lib/productOptionGroups.js`, 배송비 `shared-domain/shipping.js`, 출시 전·재고 숨김 상품 `publicFeaturedProducts.js`, 판매 안내 문구 `sellGuideContent.js`, 이미지 크기 `storageImage.js`.
- 디자인: `src/theme.js`의 브랜드 토큰만 사용(웹 `index.css`와 같은 값), LINE Seed KR, Feather 아이콘. 등급 표시 없음, 옵션은 구매 버튼 위 드롭다운(위로 펼침).

## 화면 구성

| 화면 | 방식 | 비고 |
| --- | --- | --- |
| 홈 | 앱 화면 | 배너(추천 교재+어드민 배너)·테마 바로가기·BEST·전체 교재 |
| 검색 | 앱 화면 | 최근 검색어는 기기에만 저장 |
| 상품 상세 | 앱 화면 | 사진·AI 요약·옵션 선택·장바구니·바로구매·찜·재입고 알림·공유 |
| 장바구니·찜 | 앱 화면 | 회원 전용 |
| 판매 | 앱 화면(안내) + 웹 화면(신청서 `/pickup/new`) | |
| 마이 | 앱 화면(메뉴) + 웹 화면(`/mypage#탭`, 알림, 공지, 정책) | |
| 로그인·회원가입 | 웹 화면(`/app/login`) | 2단계에서 앱 로그인으로 교체 |
| 주문·결제 | 웹 화면(`/app/checkout` → `/order`) | 나이스페이 카드·계좌이체 |

## 앱 ↔ 웹 화면 연결

약속은 `packages/shared-domain/src/appBridge.js` 한 곳에 있다. 웹 쪽 구현은 `public-web/src/lib/appBridge.js`, 앱 쪽은 `src/screens/WebScreen.jsx`·`src/lib/webBridge.js`.

- **앱 판별**: 앱이 User-Agent에 `SubookApp/<버전>`을 붙인다. 웹은 이 표식 + `window.ReactNativeWebView`로 앱임을 안다(머리글·바닥글 숨김, 구글 로그인 버튼 숨김).
- **로그인 세션의 주인은 앱**이다. 기기 보안 저장소(SecureStore)에 보관하고, 웹 화면을 열 때 같은 저장 키로 넣어 준다. 웹은 앱 안에서 토큰을 주기 갱신하지 않으며, 웹에서 로그인·갱신·로그아웃이 일어나면 앱에 알려 앱 세션을 맞춘다.
- **준비 신호**: iOS는 페이지가 그려지기 전에 세션이 들어간다. Android는 그 시점이 보장되지 않아 웹이 `ready`를 보내면 앱이 한 번 더 넣고 `subook-app-ready` 이벤트로 알린다. 웹은 그때까지 세션 읽기를 기다린다.
- **메시지(웹 → 앱)**: `ready` · `auth`(세션) · `navigate`(홈·상품·장바구니 등 앱 화면 경로) · `open`(새 창 링크) · `close` · `cart`.
- 세션·주문 정보는 **`https://subook.kr` 화면에만** 넣고, 그 화면이 보낸 메시지만 받는다. 결제창 등 다른 사이트에는 아무것도 넣지 않는다.
- 주소 검색(우편번호 서비스)은 앱 안에서 새 창 대신 화면 위 레이어로 연다(`public-web/src/lib/postcode.js`).

## 카드 결제(나이스페이) 설정

- 결제 요청에 `appScheme: "subook://"`를 넣어 카드사 앱 인증 뒤 수북 앱으로 돌아온다(`public-web/src/lib/nicepay.js`).
- 카드사·은행·간편결제·본인인증 앱 목록: `plugins/withPaymentApps.cjs` → iOS `LSApplicationQueriesSchemes`, Android `<queries>`. 카드사 앱이 추가되면 이 파일만 고친다.
- 웹 화면 설정: 혼합 콘텐츠 허용, 서드파티 쿠키, 새 창을 같은 화면에서 열기, `intent://`·앱 스킴은 앱이 직접 열고 미설치 시 스토어로 보낸다.
- `subook://` 주소 중 `home|search|sell|cart|store/<번호>|themes/<id>`만 화면 이동으로 받는다. 그 밖의 주소(결제 복귀 포함)는 무시해 결제 중인 화면이 초기화되지 않게 한다(`App.js`).

## 실행

저장소 루트(`frontend`)에서:

```sh
npm ci
npm --prefix apps/mobile ci
```

`apps/mobile/.env.example`을 `.env.local`로 복사하고 **기존 공개 Supabase URL과 publishable 키(또는 anon 키)**를 넣는다. 이 값들은 앱 번들에 포함되는 공개 설정이다. service_role·secret 키, 관리자 환경 파일은 사용하지 않는다. 기존 웹 설정을 재사용하려면 `npm --prefix apps/mobile run setup:env`.

```sh
npm run dev:mobile
npm run dev:mobile:web
```

- 웹 화면(주문·로그인 등)은 `react-native-webview`를 쓰므로 **Expo Go나 브라우저 미리보기에서는 열리지 않는다.** 브라우저 미리보기는 앱 화면(홈·검색·상세 등) 확인용이다.
- 로그인·결제까지 확인하려면 개발 빌드나 EAS 내부 배포 빌드(`eas.json`의 `preview`, Android APK)를 기기에 설치한다. `.env.local`은 저장소에 올라가지 않으므로 EAS에는 같은 두 값을 환경 변수로 등록해야 한다.
- Windows에서는 iOS 빌드를 만들 수 없다(macOS/Xcode 또는 EAS Build 필요).

## 검증

```sh
npm run lint
npm run test:mobile
npm --prefix apps/mobile run check
npm run build:mobile
npm run test:public
npm run build:public
```

`build:mobile`은 iOS·Android·web의 **JavaScript/asset 번들 검증**이다. 네이티브 컴파일이나 실기기 테스트를 대신하지 않는다. 네이티브 설정(스킴·결제 앱 목록)은 `npx expo config --type introspect`로 확인한다.

2026-11-10 확인한 것:
- 린트, 단위 테스트(mobile 15·public 317), `expo install --check`, `expo-doctor` 20/20, 3개 플랫폼 번들.
- 브라우저 미리보기(375px): 홈 배너·테마·BEST·교재 목록, 검색, 상품 상세와 옵션 선택(위로 펼침·선택 누적·수량·합계), 비회원 구매 안내, 판매 안내, 찜·장바구니·마이의 비로그인 화면.
- 웹 쪽 앱 연결: User-Agent 판별, `ready` 신호 뒤 주문서 진입(비회원), 머리글·바닥글 숨김, 링크 가로채기, 주소 검색 레이어. 일반 브라우저에서는 `/app/*`가 홈으로 돌아가고 기존 동작이 그대로다.
- 생성된 네이티브 설정: iOS 스킴 33개·ATS 예외·`subook` URL 스킴, Android 패키지 33개·cleartext 허용.

**아직 실기기에서 확인하지 못한 것**(네이티브 빌드 필요): 웹 화면 로그인(이메일·휴대폰 인증·카카오)과 세션 공유, 장바구니·찜(로그인 상태), 카드 결제의 카드사 앱 왕복, 계좌이체 주문, 판매 신청, Android 뒤로 버튼, 키보드와 입력창 겹침, 앱 복귀 시 토큰 갱신.

## 스토어 출시까지

| 단계 | 내용 |
| --- | --- |
| 1 (이번 작업) | 앱 화면 홈·검색·상세·찜·장바구니, 웹 화면 주문·결제·판매 신청·마이페이지, 세션 공유, 결제 앱 연동 설정 |
| 2 | 앱 로그인(카카오·Apple·구글·이메일), 푸시 알림(광고성은 별도 동의), 딥링크(앱 링크·유니버설 링크), 앱 안 계정 삭제 경로 |
| 3 | 앱 전용 기능: 흔들어 여는 포춘쿠키, 수능 D-day 위젯, 앱 첫 구매 3,000원 쿠폰 |
| 4 | 개발자 계정·서명, 내부 테스트·TestFlight, 개인정보/Data safety, 스크린샷·심사 계정·메타데이터, 실기기 회귀 검증 |

보류(다시 제안하지 않음): 표지 찍어 찾기, 팔 책 찍어서 수거 신청.

- 앱 식별자는 `kr.subook.app`(iOS bundleIdentifier·Android package)으로 넣어 두었다. 스토어에 등록하면 바꿀 수 없으니 등록 전에 확정한다.
- 현재 아이콘은 180px 웹 아이콘을 개발용으로 재사용한다. 제출 전 1024px 아이콘·Android adaptive icon을 브랜드 원본으로 준비한다.
- 글꼴 파일(OTF 2종, 각 3.2MB)은 번들에 포함된다. 용량이 문제 되면 서브셋을 검토한다.
- 웹 배포 명령을 모바일 스토어 배포에 사용하지 않는다.

## 공식 근거

- [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/) · [모노레포 구성](https://docs.expo.dev/guides/monorepos/) · [EAS 첫 빌드](https://docs.expo.dev/build/setup/)
- [React Navigation](https://reactnavigation.org/docs/getting-started/) · [Supabase 공개 API 키](https://supabase.com/docs/guides/getting-started/api-keys)
- [우편번호 서비스 가이드](https://postcode.map.kakao.com/guide): WebView 기반 서비스에는 `embed()` 레이어 방식을 권장.
- 나이스페이 개발자 가이드의 앱(WebView) 연동 문서: `appScheme`, 앱 스킴·패키지 목록, WebView 설정.
- [Apple 심사 지침](https://developer.apple.com/app-store/review/guidelines/): 4.2 앱의 충분한 기능, 4.8 소셜 로그인 대안(Apple 로그인), 5.1.1 계정 삭제. 실물 교재 구매는 3.1.3(e)에 따라 인앱결제 외 수단을 쓰는 범주다.
- [Google Play 결제 정책](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en): 실물 상품은 Play Billing 대상이 아니다.
- [Google Play 계정 삭제](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en): 앱 내부 경로와 앱 외부 삭제 요청 링크를 준비한다.
