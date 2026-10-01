# 휴대폰 인증과 대표 계정 선택

2026-10-01 사용자 요청 및 운영 전환 승인으로 적용 완료. 신규 가입은 휴대폰 인증, 기존 회원은 로그인 후 인증 번호 필수. 같은 번호의 계정은 각 계정 로그인 확인 후 회원이 대표 계정을 선택한다. 운영 검증·복구 절차는 Backend `docs/PHONE_IDENTITY_ROLLOUT.md`를 따른다.

- `/signup`: 정책 활성화 시 휴대폰 가입. `/auth/phone`: 휴대폰 로그인/가입.
- `/auth/verify-phone`: 기존 회원 번호 인증. 마이페이지의 계정 통합 진입점에서도 사용.
- `/auth/merge`: 로그인 소유 확인, 대표 선택, 명시적 통합 동의.
- `/auth/oauth-consent`: 휴대폰 신규 사용자는 이름·약관만 입력. 이메일 가입 미완료 사용자의 비밀번호 설정은 유지.
- `/api/auth/phone-sms-hook`: Supabase의 서명을 검증하고 기존 Solapi로 SMS 전달. 원문 payload 필요하므로 Web Request handler 사용.
- `/api/auth/member-identity`: 현재 JWT 사용자와 DB의 번호 소유권 검증 후 Auth에 연결. 통합 데이터와 Auth 연결 사이 실패 시 대표 계정에서 재시도.

디자인은 [Airbnb 로그인](https://www.airbnb.co.kr/login)의 집중된 인증 폼과 이미지 배경 구성을 시각 확인하여 참고했다. 수북 남색·하늘색과 책 정물 이미지를 사용했다. 이미지는 built-in image_gen으로 생성했고 `src/assets/member-auth-books.webp`(약 78KB), 최종 프롬프트는 `member-auth-books.prompt.txt`에 보존했다.

검증: `npm run lint`, `npm run test:public` 271개, public/admin build. 별도 `scripts/verify-member-identity.mjs`는 실제 문자/DB 요청을 모두 가로채는 브라우저 테스트다. 로컬 개발 서버(5183)와 Playwright/Chrome이 필요하다. 운영에서는 별도로 사용자가 제공한 번호의 SMS 수신·OTP 인증·계정 통합 후보 화면·미인증 Data API 차단까지 확인했다. 실제 고객 계정 통합은 실행하지 않았으며 임시 계정은 정리했다.

최종 운영 배포 `dpl_jm6j4PTfiDSqsCxY7XyrFdyEx1Vq` (READY). SMS hook의 void RPC는 204/빈 본문을 허용해야 하며, JSON이 없다는 이유로 성공한 발송을 실패로 처리하지 않는다.
