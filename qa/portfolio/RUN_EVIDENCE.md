# 실제 자동화 실행 증거

생성 시각: 2026-10-23T17:57:30.705Z. 이 문서는 로컬 실행 원본에서 생성했다.

## selenium

- 시각: 2026-10-23T17:37:30.567Z ~ 2026-10-23T17:38:37.948Z
- 소스 커밋: 642d06c666ad27f7b87b78b36c78e172ba5dfa97
- 결과: 10 Pass / 0 Fail / 0 Blocked
- 범위: 실제 React UI + 합성 Supabase 응답. B2B는 실제 서버 핸들러 경유. Chrome 데스크톱 및 480px 창; 실기기·OAuth 제공자·운영 DB 제외.
- 증거: [summary.json](../results/stack/selenium/2026-10-23T17-37-30-567Z-13816/summary.json) / [HTML](../results/stack/selenium/2026-10-23T17-37-30-567Z-13816/report.html)
- summary SHA-256: 24cdb194f461d958cc240bd22c77f9dbed4f77ba0ba43b282d43722938b62e03
- 실행 환경: {"node":"v26.7.0","platform":"win32","os":"10.0.26200","cpu":"Intel(R) Core(TM) Ultra 5 115U"} / {"name":"chrome","version":"156.0.8078.47"}

## postman

- 시각: 2026-10-23T17:37:30.954Z ~ 2026-10-23T17:37:35.198Z
- 소스 커밋: 642d06c666ad27f7b87b78b36c78e172ba5dfa97
- 결과: 36 Pass / 0 Fail / 0 Blocked
- 범위: 실제 public-web 서버리스 핸들러 + 요청별 Supabase/Nicepay fixture. 실제 DB 트랜잭션·PG·알림 발송 검증 제외.
- 증거: [summary.json](../results/stack/postman/2026-10-23T17-37-30-954Z-22560/summary.json) / [HTML](../results/stack/postman/2026-10-23T17-37-30-954Z-22560/report.html)
- summary SHA-256: 9140e4ec2506397622aad064271db27493094d3a1d12d52c5c5efa9b11db26cf
- 실행 환경: {"node":"v26.7.0","platform":"win32","os":"10.0.26200","cpu":"Intel(R) Core(TM) Ultra 5 115U"}
- Assertion: {"total":195,"pending":0,"failed":0}; Newman failures: 0

## jmeter

- 시각: 2026-10-23T17:37:30.178Z ~ 2026-10-23T17:39:06.362Z
- 소스 커밋: 642d06c666ad27f7b87b78b36c78e172ba5dfa97
- 결과: 3 Pass / 0 Fail / 0 Blocked
- 범위: 로컬 Node 실제 API 핸들러 + 즉시 응답 fixture. 단일 PC 부하 생성. Vercel/DB/PG/네트워크 용량·운영 최대 TPS 측정 아님.
- 증거: [summary.json](../results/stack/jmeter/2026-10-23T17-37-30-178Z-29236/summary.json) / [HTML](../results/stack/jmeter/2026-10-23T17-37-30-178Z-29236/report.html)
- summary SHA-256: 57d6b6d8f41a26689fa6c50692f5ac1067e28c37553fc2095f6ea5ca328e366a
- 실행 환경: {"node":"v26.7.0","platform":"win32","os":"10.0.26200","cpu":"Intel(R) Core(TM) Ultra 5 115U"}
- LOAD-SMOKE: 측정 87건 / p95 7ms / 오류 0% / 9.04req/s / 워밍업 제외45건
- LOAD-BASELINE: 측정 1781건 / p95 4ms / 오류 0% / 90.23req/s / 워밍업 제외731건
- LOAD-PEAK: 측정 4190건 / p95 67ms / 오류 0% / 211.94req/s / 워밍업 제외1716건

원문 결과는 qa/results 아래에 보관하고 Git에서는 제외한다. clone 후 재실행하면 새 시각의 결과가 생성된다. 실행 시 dirty 상태와 파일별 해시는 각 summary.json에 있으며 SHA만으로 미커밋 QA 코드를 식별하지 않는다.
