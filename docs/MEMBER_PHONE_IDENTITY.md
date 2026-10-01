# 휴대폰 인증과 대표 계정 선택

2026-10-01 사용자 정정: **이메일 필수, 기존 이메일/비밀번호·카카오/구글 가입 흐름 유지.** 전화번호 단독 가입은 의도하지 않은 구현이므로 폐지한다. 가입에 번호 인증을 추가하며 1번호 1계정·기존 회원 강제 인증·회원 선택 통합은 유지한다. 운영 검증·복구 절차는 Backend `docs/PHONE_IDENTITY_ROLLOUT.md`를 따른다.

정정 배포 완료: Frontend `1e827cb`, Backend `54cf3a0`, production `dpl_J3Hxbf9ctyyehfVTcMVA2tYdx9uU` — READY. 운영 `/signup`에서 이메일/비밀번호·카카오/Google·번호 인증 필드를 확인했고, 실제 Auth API가 번호 증명 없는 이메일 가입 및 이메일 없는 번호 가입을 계정 생성 전에 거부함을 확인했다. 이 검증으로 문자·이메일 발송이나 테스트 계정 생성은 발생하지 않았다.

후속 확정: 신규 이메일/구글/카카오 가입에서 인증 번호가 기존 계정과 겹치면 `existing_account`로 안내하고 기존 계정 로그인으로 이동한다. 신규 중복 가입을 계정 통합으로 보내지 않는다. 이메일 중복도 기존 로그인 안내를 유지한다. `ExistingAccountNotice`는 [Notion 로그인](https://www.notion.com/login)을 브라우저에서 시각 확인하고 제목·인증 완료 표식·주 행동 버튼 위계를 참고했으며 수북 공통 색상 토큰과 기존 책 이미지를 사용한다.

후속 배포 완료: Frontend `1f037d9`, Backend `6b07239`, production `dpl_41yLYP2sYnEhZQpG54KPV4SkzBFj` — READY / production. 배포된 번들에서도 모의 API를 사용한 가입/중복/카카오 세 분기/모바일 검증 통과. 실제 운영 DB에 설치된 함수의 중복 차단도 트랜잭션에서 실행하고 전부 롤백했다. frontend 273개, backend 관련 27개, lint/public/admin build 통과. 카카오 실계정 로그인은 아직 미확인이다.

- `/signup`: 기존 이메일/비밀번호·소셜 가입 화면. 이메일 입력 → 가입 전 SMS 확인 → 기존 이메일 OTP → 이름/비밀번호/약관 → 완료. SMS 증명 없이 Auth 계정을 만들 수 없도록 Before User Created hook으로 검증한다.
- 카카오/구글은 OAuth 인증 레코드와 회원 등록을 분리한다. 이메일이 필수이며 회원 프로필은 번호 확인 후 생성한다. 카카오는 서버가 provider token으로 UserInfo를 조회하고 JWT identity와 sub 일치 및 `phone_number_verified=true`를 확인하면 SMS를 생략한다. 번호 미제공·조회 실패는 SMS로 진행한다. 클라이언트 metadata의 번호는 인증 근거가 아니다.
- `/auth/phone`: 이미 생긴 전화번호 단독 계정의 복구 로그인만 허용(`shouldCreateUser=false`). `/auth/required-email`에서 이메일 확인·비밀번호 등록 전 이용을 막는다. 기존 계정/자산은 삭제하지 않는다. 2026-10-01 사용자 요청으로 로그인 화면의 ‘이메일을 등록하지 않은 기존 계정 찾기’ 링크는 제거했다.
- `/auth/verify-phone`: 기존 회원 번호 인증. 2026-10-01 사용자 요청으로 마이페이지의 ‘다른 계정의 이용 내역 통합’ 항목은 제거했다.
- `/auth/merge`: 로그인 소유 확인, 대표 선택, 명시적 통합 동의.
- 통합은 최초 전화번호 정책 전환 전부터 존재한 계정 정리에만 허용한다. 신규 중복 가입은 UI 및 DB RPC 모두 통합 진입을 거부하며 회원 프로필/쿠폰도 만들지 않는다.
- `/auth/oauth-consent`: 소셜 회원 이름·약관 동의, 이메일 가입 미완료 사용자의 비밀번호 설정 유지.
- `/api/auth/signup-phone`: Auth 생성 전 SMS 발송/검증. 이메일·번호에 묶인 1회 증명, 5회 오입력 제한, 번호/IP 해시별 발송 제한.
- `/api/auth/kakao-phone`: 카카오 서버 검증 번호만 서비스 전용 RPC로 연결. 공급자 토큰이나 인증번호는 로그에 기록하지 않는다.
- `/api/auth/phone-sms-hook`: Supabase의 서명을 검증하고 기존 Solapi로 SMS 전달. 원문 payload 필요하므로 Web Request handler 사용.
- `/api/auth/member-identity`: 현재 JWT 사용자와 DB의 번호 소유권 검증 후 Auth에 연결. 통합 데이터와 Auth 연결 사이 실패 시 대표 계정에서 재시도.

디자인은 [Airbnb 로그인](https://www.airbnb.co.kr/login)의 집중된 인증 폼과 이미지 배경 구성을 시각 확인하여 참고했다. 수북 남색·하늘색과 책 정물 이미지를 사용했다. 이미지는 built-in image_gen으로 생성했고 `src/assets/member-auth-books.webp`(약 78KB), 최종 프롬프트는 `member-auth-books.prompt.txt`에 보존했다.

검증: `npm run lint`, `npm run test:public` 273개, public/admin build. `scripts/verify-email-phone-signup.mjs`와 `scripts/verify-member-identity.mjs`는 실제 문자/DB 요청을 모두 가로채는 브라우저 테스트다. 개발 서버(기본 4173, QA_ORIGIN으로 변경)와 Playwright/Chrome이 필요하다. 이메일 가입, 잘못된 OTP, 이메일 필수 게이트, 기존 회원 인증/통합, 모바일 넘침을 검증한다. 서버 API 테스트는 카카오 sub·번호 인증 여부·위조 입력을 검증한다. 실제 카카오 로그인 계정으로 SMS 생략까지 재현한 것은 아니다.

이전 전화번호 전환 배포는 `dpl_jm6j4PTfiDSqsCxY7XyrFdyEx1Vq`. 그때 실제 SMS 수신/OTP를 확인했고 테스트 계정을 정리했다. 이번 정정은 새로운 번호 단독 계정을 만들지 않는다. SMS hook의 void RPC는 204/빈 본문을 허용해야 하며, JSON이 없다는 이유로 성공한 발송을 실패로 처리하지 않는다.
