# 친구 초대 이벤트

2026-10-01 사용자 결정: 친구가 초대 링크로 가입을 완료하면 초대한 회원과 신규 회원에게 각각 4,000원 쿠폰을 동시에 지급한다. 구매/구매확정 조건은 없다.

- 동봉지 공통 QR 주소: https://subook.kr/event/invite
- 로그인한 회원이 자기 전용 초대 링크를 복사하거나 기기의 공유 기능으로 보낸다.
- 신규 회원은 링크에서 회원가입으로 이동한다. 이메일은 OTP 인증과 가입 정보 저장 완료, 카카오/구글은 필수 동의와 가입 정보 저장 완료 시 지급한다.
- 두 쿠폰 모두 배송비 제외·쿠폰/포인트 차감 전 교재 금액 30,000원 이상, 주문당 쿠폰 1장. 포인트는 기존 정책을 따른다.
- 유효기간은 발급일부터 30일이다. 친구 한 명이 가입하여 양쪽에 한 장씩 지급되면 초대 링크는 만료된다. 이후 추가 초대는 보상하지 않는다.
- 쿠폰함에 친구 초대 페이지 진입 링크가 있다. 초대 페이지에서는 완료 건수와 쿠폰함을 확인한다. 친구 개인정보/구매 정보는 표시하지 않는다.

## 서버 처리

`20261001042015_signup_referral_coupons.sql`이 캠페인 두 개와 초대 원장을 생성한다. 기존 회원은 초대할 수 있고, 신규 가입 혜택은 마이그레이션 적용 이후 생성된 계정에만 적용한다. 기존 미완료 계정으로는 신규 초대 혜택을 소급 신청할 수 없다.

회원가입 마지막 제출 전에 `attach_signup_referral`이 초대자를 고정한다. 가입 완료 트리거가 두 장 발급과 원장 갱신을 단일 트랜잭션으로 처리하며, 오류 시 쿠폰 처리를 전부 롤백하고 가입 자체는 보존한다. `complete_signup_referral`은 본인 가입 건만 재시도한다. 반복 호출/새로고침/인증 상태 갱신으로 추가 발급되지 않는다.

`member_referral_codes`와 `member_referral_signups`는 RLS를 켜고 클라이언트 직접 접근을 막는다. 공개 RPC는 이벤트 조건과 링크 유효/만료 여부만 반환한다. 회원 RPC는 본인 링크·집계·본인 수령 여부·추가 초대 가능 여부만 반환한다. 캠페인은 `signup_referral_inviter`와 `signup_referral_friend`이며 가입 자동 지급 옵션을 별도로 켜면 안 된다.

`20261001053820_single_use_signup_referrals.sql`에서 초대자별 발급 원장에 유일 인덱스를 두고 링크 행 잠금으로 동시 가입을 직렬 처리한다. 먼저 연결해 둔 친구가 여럿이어도 첫 가입 완료만 두 장을 받는다. 발급 실패는 링크를 소진하지 않는다. 초대받은 회원이 자신의 새 링크로 다른 친구를 초대하는 것은 별도의 1회 참여다.

## 검증 및 참고

- Backend: `node --test tests/signup-referral.test.js` — 이메일/소셜 가입 완료, 동시 발급 시각, 재시도, 기존 회원 거부, 직접 접근 거부, 한쪽 INSERT 실패 시 전체 롤백, 수량/차단 검증.
- Frontend: `npm run test:public`, `npm run lint`, public/admin 빌드.
- [Supabase 사용자 데이터 및 트리거](https://supabase.com/docs/guides/auth/managing-user-data)
- [Supabase DB 함수와 권한](https://supabase.com/docs/guides/database/functions)
- [Supabase 이메일 OTP](https://supabase.com/docs/reference/javascript/auth-signinwithotp)
