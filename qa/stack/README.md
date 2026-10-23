# 수북 Selenium Postman JMeter 실행 가이드

실제 public-web React 화면과 서버리스 핸들러를 로컬에서 실행한다. Supabase·PG·알림 응답은 합성 fixture다. [6주 업무 시나리오](../portfolio/README.md)의 회차 결과와 이 자동화 실행 결과는 서로 다른 모집단이다.

## 준비와 실행

Windows PowerShell 기준, **frontend 저장소 디렉터리**에서 실행한다. Node22 이상, Chrome, JMeter 실행용 Java17과 tar가 필요하다. Selenium Manager가 설치된 Chrome에 맞는 드라이버를 준비하므로 첫 실행에는 다운로드가 발생할 수 있다.

```powershell
npm ci
npm --prefix qa ci
npm --prefix qa run jmeter:setup
npm --prefix qa run test:stack
npm --prefix qa run report:portfolio
```

개별 실행:

```powershell
npm --prefix qa run test:selenium
npm --prefix qa run test:api
npm --prefix qa run test:load -- smoke
npm --prefix qa run test:load -- baseline
npm --prefix qa run test:load -- peak
```

`test:stack`는 Selenium → API → JMeter 순서이며 실패 시 종료 코드1을 반환한다. UI 서버는127.0.0.1:5198, API는 자동 할당 포트를 사용하고 종료 시 정리한다. Chrome 비표준 위치는 `CHROME_BINARY`, 이미 설치된 JMeter는 `JMETER_HOME`으로 지정한다. 서버는 환경 파일을 사용하지 않고 합성 키만 사용한다.

## Selenium

| 파일 | 역할 |
|---|---|
| selenium/pages.mjs | Page Object: 화면 탐색·선택자·명시적 대기 |
| selenium/fixture.mjs | 실제 Vite 앱 실행, 합성 상품·회원·장바구니 응답 |
| selenium/run.mjs | 독립 Chrome 세션10개, TC별 assertion·화면·요청 기록 |

SEL-01~05는 품절·수량·개별 교재ID·주문 금액·480px 옵션 목록, SEL-06~08은 인증 분기와30초 복구, SEL-09~10은 B2B 폼의 실제 API 접수와 미동의 차단이다. 스크롤은 즉시 이동 후 실제 WebDriver 클릭을 사용하며 JS click으로 통과시키지 않는다.

브라우저의 외부 요청은 사용하지 않는 로컬 프록시로 차단한다. 테스트의 fake session은 실제 OAuth 제공자 검증을 대체하지 않는다. 알 수 없는 보조 RPC가 생기면 fixture 목록을 검토해야 하며 무조건 통과시키지 않는다. 480px 창은 실기기 시험이 아니다.

## Postman과 Newman

Postman에서 `postman/subook.postman_collection.json`과 `postman/local.postman_environment.json`을 Import한다. 다른 터미널에서 다음 명령으로 서버를 켜고 Collection Runner를 실행한다.

```powershell
npm --prefix qa run api:serve
```

환경 baseUrl은 `http://127.0.0.1:5199`다. 결제 복귀 응답은303 Location 자체가 검증 대상이므로 Collection의 redirect 비활성 설정을 유지한다. 로컬 주소 가드는 수동으로 운영 주소를 넣는 실수를 차단한다.

| 구분 | 요청 수 | 검증 |
|---|---:|---|
| B2B | 20 | 수량·문자열 경계, 동의, cross-site, 봇 필드, 재시도·연속 실패 |
| 회원 연결 | 5 | 미인증, 메서드, action, 요청 번호 대신 DB 검증 번호 |
| Nicepay 복귀 | 11 | 인증 중단, 0원, 변조·가맹점 불일치, 정상·중복·만료·재고·보상 실패 |

`api-server.mjs`는 제품 핸들러를 import하며, HTTP request/response 형태만 연결한다. 업스트림은 AsyncLocalStorage로 요청별 분리한다. 테스트는 응답뿐 아니라 호출 횟수·순서·요청 원문을 확인한다. 실제 DB의 원자성·멱등성·RLS, PG 승인, Slack 발송은 이 테스트의 통과 주장에 포함하지 않는다.

수정 원본은 `postman/cases.mjs`다. 변경 후 `npm --prefix qa run postman:export` 또는 `test:api`로 Import용 JSON을 갱신한다. Fixture용 키·전화번호만 포함한다.

## JMeter

`jmeter/subook-local.jmx`는 JMeter GUI에서 열어 Thread Group, HTTP Request, Response Assertion, Timer를 확인할 수 있다. 부하는 CLI 모드로 실행한다. 다운로드는 공식 Apache 배포본5.6.3과 SHA-512를 비교하며 버전·검증 기록은 `qa/.tools/jmeter-install.json`에 남긴다.

| 프로필 | VU | ramp-up | 실행 | 제외 워밍업 |
|---|---:|---:|---:|---:|
| smoke | 1 | 1초 | 15초 | 5초 |
| baseline | 10 | 5초 | 30초 | 10초 |
| peak | 25 | 5초 | 30초 | 10초 |

문의 정상50% / 토큰 없는 계정 연결25% / 카드 인증 중단25%, 요청마다100ms pacing이다. 거절 응답401 및 리다이렉트303은 기대 상태와 응답 내용을 assertion으로 검사한다. 워밍업 제외 표본20개 이상, p95<500ms, assertion 오류율<1%를 **이 로컬 실험의 회귀 기준**으로 삼았다. 실제 서비스 SLO가 아니다.

JTL은 전체 구간, `*-dashboard/index.html`은 전체 구간 통계, `summary.json`의 actual은 워밍업 제외 통계다. 이 둘의 숫자가 다를 수 있다. 생성기와 대상 서버가 같은 PC이며 DB·PG가 즉시 응답 fixture이므로 운영 수용량·최대 동시 접속자·실사용자 응답시간으로 해석하지 않는다.

## 결과와 CI

각 도구는 `qa/results/stack/<도구>/<UTC시각-PID>/`에 새 폴더를 만든다. 기존 실패 이력을 지우지 않는다. `latest.json`이 마지막 실행을 가리킨다.

- 공통: summary.json, report.html, 시작·종료 시각, Git SHA, dirty 상태, 제품 소스 SHA-256, 실행 환경.
- Selenium: TC별 PNG와 fixture 요청 기록.
- Postman: newman.json, junit.xml, upstream-evidence.json.
- JMeter: 프로필별 JTL·콘솔·JMeter 로그·HTML dashboard.
- CI: push/PR에서 기존 회귀 + Selenium/Postman; workflow_dispatch에서 JMeter도 실행. 결과30일 보관.

결과·설치 도구·node_modules는 Git에서 제외한다. 다른 PC에서는 재실행해 증거를 생성한다. 제품 앱 코드는 변경하지 않았고 QA 파일은 앱 배포 대상이 아니다.

## 도구 의존성 관리

Newman6.2.3 의존성 중 호환 가능한 handlebars·lodash·flatted·qs·underscore·jose 패치는 `qa/package.json` overrides로 고정했다. 2026-10-24 로컬 npm audit에는 여전히 QA 개발 의존성10건(High6·Moderate4)이 남았다. 원문은 `qa/results/dependency-audit.json`에 보관한다. 외부 Collection이나 스크립트를 실행하는 일반 실행기로 사용하지 않고 이 저장소의 합성 로컬 Collection만 실행한다. 제품 런타임 의존성에는 추가하지 않았다. 상위 Newman 릴리스에서 수정 여부를 다시 확인하고, 호환성 검증 없는 major 강제 교체는 하지 않는다.

## 공식 도구 문서

- [Selenium JavaScript API](https://www.selenium.dev/selenium/docs/api/javascript/index.html), [명시적 대기](https://www.selenium.dev/documentation/webdriver/waits/), [Page Object](https://www.selenium.dev/documentation/test_practices/encouraged/page_object_models/)
- [Postman Newman 설치·실행](https://learning.postman.com/docs/collections/using-newman-cli/installing-running-newman), [Newman 공식 저장소와 reporter 옵션](https://github.com/postmanlabs/newman)
- [JMeter 다운로드](https://jmeter.apache.org/download_jmeter.cgi), [CLI 실행](https://jmeter.apache.org/usermanual/get-started.html)
- [Appium 및 UiAutomator2 시작](https://appium.io/docs/en/latest/) — 향후 네이티브 앱 확장 참고
- [GitHub setup-java](https://github.com/actions/setup-java)
