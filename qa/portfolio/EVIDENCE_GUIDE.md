# 수북 QA 증빙 자료 안내

담당: 진성욱 · 자료일: 2026-10-24

## 바로 열기

- [화면 캡처와 실행 결과](../evidence/2026-10-24/index.html)
- [TC·버그·주간 기록 통합 보기](index.html)
- [실행 환경과 소스 해시](RUN_EVIDENCE.md)
- PDF: 프로젝트 루트 `output/pdf/SUBOOK_QA_실행증빙_2026-10-24.pdf`
- ZIP: 프로젝트 루트 `output/SUBOOK_QA_증빙자료_2026-10-24.zip`

## 증빙 구성

| 분류 | 파일 | 확인할 내용 |
|---|---|---|
| Selenium | PNG 10장, summary.json, 검사별 calls.json | 재고 상한, 개별 교재 ID, 주문 금액, 모바일 웹, 인증 복구, 문의 접수 |
| Postman / Newman | newman.json, junit.xml, upstream-evidence.json | 36개 요청·195개 assertion, 오류 코드·호출 횟수·재시도·보상 처리 |
| JMeter | JTL 3개, 도구 로그, HTML Dashboard | 1·10·25 VU 측정, p95·오류율·처리량, 워밍업 제외 집계 |
| GitHub Actions | ci-run.json, ci-stack-job.log, ci-artifacts/ | 실행 커밋, 작업 상태, 시간, 다운로드한 artifact |
| 원본 검증 | manifest.json, source-index.json | 파일별 SHA-256·크기와 로컬 원본 위치 |
| 실행 코드 | test-source/ | Selenium 코드, Postman Collection·Environment, JMeter JMX |

`report-screenshots/`의 Newman·JMeter 이미지는 생성된 HTML 보고서를 브라우저에서 열어 캡처한 화면이다. Postman 데스크톱 앱이나 JMeter 편집기의 화면은 아니다. `local/selenium/`의 PNG는 UI 검사 실행 중 저장된 화면이다.

로컬 React UI와 API 핸들러를 실행했으며 Supabase·PG·알림 응답은 fixture로 제어했다. 부하 수치는 로컬 핸들러 기준선이다. 운영 DB·실결제·외부 OAuth·실기기 시험은 해당하지 않는다.

GitHub 실행 `39997083415`의 `stack-regression`은 성공했다. 별도 `regression` 작업은 취소됐고 `local-load-baseline`은 건너뛰어 전체 workflow 상태는 `cancelled`다.

## 재생성

frontend에서 실행한다. 도구 실행 결과를 먼저 만든 뒤 문서와 증빙을 생성한다.

```powershell
npm --prefix qa run test:stack
npm --prefix qa run report:portfolio
node qa/portfolio/build-evidence.mjs --date=2026-10-24 --ci-run=39997083415
node qa/portfolio/render-evidence.mjs 2026-10-24
python qa/portfolio/build-evidence-pdf.py qa/evidence/2026-10-24 ../output/pdf/SUBOOK_QA_실행증빙_2026-10-24.pdf
node qa/portfolio/build-evidence.mjs --date=2026-10-24 --manifest
```

새 회차에서는 날짜와 CI 실행 ID를 해당 회차 값으로 바꾼다. CI가 없으면 `--ci-run`을 생략한다. CI artifact는 `gh run download <ID> --repo SUBOOK-official/subook-frontend -n selenium-postman-results -D qa/evidence/<날짜>/ci-artifacts`로 같은 폴더에 내려받는다.

PDF 생성은 Python의 reportlab과 Windows 맑은 고딕 글꼴을 사용한다. PDF·캡처·추가 로그를 증빙 폴더에 넣은 후 `--manifest`를 마지막으로 실행하면 전체 파일 목록을 갱신한다. 결과 폴더는 Git에서 제외하고 원문을 유지한다.
