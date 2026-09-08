# 수북 모바일 앱

iOS App Store·Google Play 출시를 목표로 하는 React Native·Expo 앱. 현재는 **교재 탐색 개발 버전**이며 스토어 제출용 완성본은 아니다.

## 저장소와 기술 선택

`subook-frontend/apps/mobile`에서 웹과 함께 관리한다. 별도 GitHub 저장소·별도 Supabase 프로젝트는 만들지 않는다. 기존 저장소에 npm workspaces 설정은 없으므로 모바일은 **자체 package-lock.json과 node_modules**로 설치한다. 웹 React 18과 모바일 React 19를 분리하며, Metro는 모바일 의존성만 해석한다.

- 공식 blank JavaScript 템플릿: Expo SDK 57 / React Native 0.86 / React 19.2.
- 화면: React Navigation의 native stack·bottom tabs, safe area, 기본 접근성 레이블.
- 데이터: `packages/shared-supabase/src/publicCatalogClient.js` → 기존 공개 RPC 두 개. 세션 저장과 데이터 쓰기 없음.
- 도메인: `shared-domain` 등급·금액 포맷·모바일 카탈로그 모델 공유.
- 로고·배너·이미지 최적화: 기존 public-web 자산과 순수 `storageImage.js`를 참조. 모바일 화면은 React Native 컴포넌트로 작성한다.

## 실행

저장소 루트(`frontend`)에서:

```sh
npm ci
npm --prefix apps/mobile ci
```

`apps/mobile/.env.example`을 `.env.local`로 복사하고 **기존 공개 Supabase URL과 publishable 키(또는 anon 키)**를 넣는다. 이 값들은 앱 번들에 포함되는 공개 설정이다. service_role·secret 키, 관리자 환경 파일은 사용하지 않는다. 새 Supabase 프로젝트나 콘솔 변경은 필요 없다.

현재 수북 체크아웃의 공개 웹 설정을 재사용하려면 `npm --prefix apps/mobile run setup:env`를 실행한다. 공개 설정 두 개만 복사하고 값을 출력하지 않으며, 기존 모바일 `.env.local`은 덮어쓰지 않는다.

```sh
npm run dev:mobile
npm run dev:mobile:web
```

Expo Go에서 개발 서버 QR로 Android·iPhone 미리보기가 가능하다(설치한 Expo Go의 SDK 지원 버전 확인). Windows에서는 iOS Simulator를 실행할 수 없다. 실제 iOS 빌드는 macOS/Xcode 또는 EAS Build가 필요하다. 외부 기기 접속은 같은 네트워크와 Windows 방화벽 허용 상태를 확인한다.

## 구현 범위

- 공개 교재 목록, 서버 검색, 과목별 필터, 인기순·최신순·낮은 가격순, 24개씩 추가 로딩.
- 당겨서 새로고침, 빈 결과·연결 실패·이미지 실패 안내, 재시도, 이전 검색 요청 취소.
- 공개 상세 RPC로 교재 정보·실물 옵션·품절·검수 설명 확인.
- OS 공유창을 통한 기존 수북 상품 URL 공유.
- 판매 안내·마이수북 탭. 수거 신청·내역·구매는 **명시된 버튼으로 기존 웹에서 계속**한다. 브라우저 세션과 앱 세션의 자동 공유는 구현하지 않았다.
- 환경 설정이 없으면 연결 준비 안내를 표시한다. 운영 데이터처럼 보이는 가짜 교재로 대체하지 않는다.

## 검증

```sh
npm run lint
npm run test:mobile
npm --prefix apps/mobile run check
npm run build:mobile
npm run test:public
npm run build:public
npm run build:admin
```

`build:mobile`은 iOS·Android·web의 **JavaScript/asset 번들 검증**이다. IPA/AAB/APK 네이티브 컴파일이나 실기기 테스트를 대신하지 않는다. 검증용 웹 미리보기는 모바일 개발 도구이며 운영 `subook.kr` 배포 대상이 아니다.

GitHub `Mobile checks`는 관련 변경에서 린트·단위 테스트·Expo 호환성·3개 플랫폼 번들을 검증한다. Supabase 설정이나 스토어 서명 키를 CI에 넣지 않는다.

2026-09-08 로컬 검증: 공개 목록·상세 RPC HTTP 200, 443종 표시, 과목 변경·검색·빈 검색 결과, 24→48개 추가 로딩, 상세 옵션 묶음, 하단 탭 이동을 브라우저에서 확인했다. 웹 런타임 오류는 없으며 React Navigation 의존성에서 `pointerEvents` 사용 중단 예정 경고가 있다. OS 공유창·키보드·백그라운드 복귀·실제 네이티브 렌더링은 기기 테스트가 남아 있다.

의존성 보안 점검: 공식 최신 템플릿/내비게이션 조합에서 `npm audit` 중간 심각도 17개(간접 영향 포함)가 남는다. 원인은 `query-string → decode-uri-component`와 Expo 빌드 도구 `xcode → uuid` 두 경로다. 기존 의존 범위에서 호환되는 자동 수정안이 없어 강제 하위 SDK 전환이나 ESM 호환성이 바뀌는 덮어쓰기는 하지 않았다. 외부 딥링크 도입·스토어 제출 전 수정 버전 적용과 재검증이 필요하다. [디코더 권고](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr), [UUID 권고](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

## 스토어 출시까지

2026-09-08 사용자 확인: Apple Developer와 Google Play Console 계정은 모두 아직 없다. 앱 개발 착수는 승인됨.

| 단계 | 완료 기준 |
| --- | --- |
| 1. 탐색 기반 (이번 작업) | 실제 공개 카탈로그·검색·상세, 두 플랫폼 JS 번들, 브라우저 미리보기 확인 |
| 2. 회원 기능 | 기존 계정 연결, 이메일·카카오·구글 로그인 및 iOS 로그인 요구사항 대응, 안전한 세션 보관, 앱 복귀·로그아웃·계정 삭제 검증 |
| 3. 구매·판매 | 찜·장바구니·주문·수거·마이페이지 앱 화면, 결제 취소/실패/복귀·중복 승인 방지 검증 |
| 4. 앱 기능 | 푸시 수신 동의·기기 토큰·로그아웃 해제, 알림 탭과 상품 딥링크, 장애 모니터링 |
| 5. 출시 | 개발자 계정·서명, 내부 테스트·TestFlight, 개인정보/Data safety·계정 삭제 URL, 스크린샷·심사 계정·메타데이터, 실기기 회귀 검증 |

`eas.json`에는 내부 테스트용 Android APK와 production 프로필만 준비했다. EAS 계정·프로젝트 연결, bundleIdentifier/package, signing credentials는 아직 등록하지 않았다. 현재 아이콘은 기존 180px 웹 아이콘을 개발용으로 재사용한다. 제출 전 정식 1024px 아이콘·Android adaptive icon·스플래시를 브랜드 원본으로 준비해야 한다.

웹 배포 명령을 모바일 스토어 배포에 사용하지 않는다. 클라우드 빌드·스토어 업로드는 계정과 앱 식별자 확정 후 수행한다. 개발 초안을 그대로 심사 제출하지 않는다.

## 공식 근거 (2026-09-08 확인)

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) · [모노레포 구성](https://docs.expo.dev/guides/monorepos/) · [EAS 첫 빌드](https://docs.expo.dev/build/setup/)
- [React Navigation](https://reactnavigation.org/docs/getting-started/) · [Supabase 공개 API 키](https://supabase.com/docs/guides/getting-started/api-keys) · [RPC](https://supabase.com/docs/reference/javascript/rpc)
- [Apple 심사 지침](https://developer.apple.com/app-store/review/guidelines/): 4.2 앱의 충분한 기능, 4.8 소셜 로그인 대안, 5.1.1 계정 삭제를 회원 기능 설계에 반영한다. 수북의 실물 교재 구매는 3.1.3(e)에 따라 인앱결제 외 수단을 사용하는 범주다.
- [Google Play 결제 정책](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en): 실물 상품은 Play Billing 대상이 아니다.
- [Google Play 계정 삭제](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en): 계정 생성 기능 제공 시 앱 내부 경로와 앱 외부 삭제 요청 링크를 준비한다.

기존 `docs/FEATURE_SPEC.md`의 4.1(P3) 모바일 앱은 이번 사용자 요청으로 착수했다. 탐색은 1.2의 P1 요구사항을 우선 사용하며, 과거 명세의 색상 대신 현재 확정 브랜드 토큰을 따른다.
