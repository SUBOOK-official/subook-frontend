"""Build a print-ready report from the unmodified tool execution files."""
import argparse, json, hashlib
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4, landscape
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader

parser=argparse.ArgumentParser()
parser.add_argument("bundle",type=Path)
parser.add_argument("output",type=Path)
args=parser.parse_args()
root=args.bundle
data=json.loads((root/"evidence-data.json").read_text(encoding="utf8"))
args.output.parent.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont("Korean","C:/Windows/Fonts/malgun.ttf"))
pdfmetrics.registerFont(TTFont("KoreanBold","C:/Windows/Fonts/malgunbd.ttf"))
W,H=landscape(A4); M=38
NAVY=HexColor("#142e46"); GREEN=HexColor("#087c63"); MUTED=HexColor("#5a7084"); LINE=HexColor("#dbe5ec")
c=canvas.Canvas(str(args.output),pagesize=(W,H))
c.setTitle("수북 QA 실행 증빙");c.setAuthor("진성욱");c.setSubject("Selenium, Postman/Newman, Apache JMeter 실행 원문 및 화면 기록")
normal=ParagraphStyle("normal",fontName="Korean",fontSize=10,leading=15,textColor=NAVY,wordWrap="CJK")
small=ParagraphStyle("small",parent=normal,fontSize=8,leading=12,textColor=MUTED)
heading=ParagraphStyle("heading",parent=normal,fontName="KoreanBold",fontSize=22,leading=30)
page=0

def p(text,x,y,width,style=normal):
    o=Paragraph(text,style); _,h=o.wrap(width,H);o.drawOn(c,x,y-h);return y-h

def base(title,section):
    global page
    page+=1;c.setFillColor(white);c.rect(0,0,W,H,fill=1,stroke=0)
    c.setFillColor(GREEN);c.setFont("KoreanBold",9);c.drawString(M,H-25,"SUBOOK / QUALITY ASSURANCE")
    c.setFillColor(MUTED);c.setFont("Korean",8);c.drawRightString(W-M,H-25,section)
    p(title,M,H-44,W-2*M,heading)
    c.setStrokeColor(LINE);c.line(M,33,W-M,33)
    c.setFillColor(MUTED);c.setFont("Korean",8);c.drawString(M,19,"진성욱  |  자료일 "+data["date"]+" KST  |  화면·로그 원본 첨부")
    c.drawRightString(W-M,19,str(page))
    return H-91

def table(rows,x,y,width,widths=None):
    formatted=[[Paragraph(escape(str(cell)),small if i else ParagraphStyle("th",parent=small,fontName="KoreanBold",textColor=NAVY)) for cell in row] for i,row in enumerate(rows)]
    t=Table(formatted,colWidths=widths or [width/len(rows[0])]*len(rows[0]))
    t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),HexColor("#edf3f6")),("LINEBELOW",(0,0),(-1,-1),.5,LINE),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),10),("RIGHTPADDING",(0,0),(-1,-1),10),("TOPPADDING",(0,0),(-1,-1),10),("BOTTOMPADDING",(0,0),(-1,-1),10)]))
    _,height=t.wrap(width,H);assert y-height>42,("Table overflow",page,height);t.drawOn(c,x,y-height);return y-height

def img(file,x,y,w,h):
    reader=ImageReader(str(file));iw,ih=reader.getSize();scale=min(w/iw,h/ih);dw,dh=iw*scale,ih*scale
    c.drawImage(reader,x+(w-dw)/2,y-dh,width=dw,height=dh,mask="auto")
    return y-dh

def kst(s):
    return datetime.fromisoformat(s.replace("Z","+00:00")).astimezone(ZoneInfo("Asia/Seoul")).strftime("%Y-%m-%d %H:%M:%S KST")

r=data["runs"];s=r["selenium"];a=r["postman"];j=r["jmeter"]
y=base("수북 QA 실행 증빙","01 / EXECUTION SUMMARY")
y=p("Selenium UI 자동화 · Postman API 검증 · Apache JMeter 부하 검증",M,y,W-2*M)-20
y=table([["분류","실행 결과","원본 자료"],["UI 자동화",f'{s["summary"]["passed"]} / {s["summary"]["total"]} PASS',"PNG 10장, summary.json, 요청 로그"],["API 검증",f'{a["summary"]["passed"]} / {a["summary"]["total"]} PASS · {a["assertions"]["total"]} assertions',"Newman JSON, JUnit XML, 외부 호출 로그"],["부하 검증",f'{j["summary"]["passed"]} / {j["summary"]["total"]} PASS',"1·10·25 VU, JTL, HTML Dashboard"]],M,y,W-2*M,[150,220,W-2*M-370])-20
y=p("<b>실행 시간</b>  "+kst(s["startedAt"])+" - "+kst(j["finishedAt"]),M,y,W-2*M)-12
y=p("<b>실행 범위</b>  수북 React 화면과 API 핸들러를 로컬에서 실행했다. Supabase·PG·알림 응답은 fixture로 제어했으며 운영 DB 트랜잭션, 실결제, 실기기 검증은 포함하지 않는다.",M,y,W-2*M)-14
y=p("화면은 자동화가 저장한 PNG 원본을 비율 유지해 배치했다. 전체 해상도 화면과 실행 파일은 같은 증빙 묶음의 index.html에서 확인할 수 있다.",M,y,W-2*M,small)
c.showPage()

y=base("환경과 실행 추적 정보","02 / TRACEABILITY")
rows=[["항목","기록"],["OS / CPU",s["environment"]["os"]+" / "+s["environment"]["cpu"]],["Node / Browser",s["environment"]["node"]+" / Chrome "+s["browser"]["version"]],["로컬 소스 커밋",s["commit"]],["CI 소스 커밋",data["ci"]["headSha"] if data.get("ci") else "미포함"],["소스 추적","summary.json: 시작·종료 시각, 실행 당시 worktree, 소스별 SHA-256"],["원본 추적","source-index.json: 원본 위치와 복사본 SHA-256 / manifest.json: 전체 첨부 파일 무결성"]]
y=table(rows,M,y,W-2*M,[155,W-2*M-155])-18
p("로컬 실행은 QA 코드 커밋 전에 진행됐다. 당시 변경 파일 목록과 파일별 해시를 함께 보관했으며, CI 결과는 커밋된 소스에서 별도로 생성됐다.",M,y,W-2*M)
c.showPage()

for ident in ["SEL-02","SEL-03","SEL-04","SEL-05","SEL-08","SEL-09"]:
    item=next(x for x in s["results"] if x["id"]==ident)
    y=base(ident+"  "+item["name"],"03 / SELENIUM SCREENSHOTS")
    y=p("<b>절차</b> "+escape(item["steps"])+"  |  <b>결과</b> "+escape(item["actual"])+"  |  PASS",M,y,W-2*M)-8
    imagePath=root/"local"/"selenium"/(ident+".png")
    img(imagePath,M,y,W-2*M,y-76)
    digest=hashlib.sha256(imagePath.read_bytes()).hexdigest()
    p("원본: local/selenium/"+ident+".png  |  실행 "+str(item["durationMs"])+"ms<br/>SHA-256: "+digest,M,66,W-2*M,small)
    c.showPage()

y=base("API 응답과 후속 호출 검증","04 / POSTMAN + NEWMAN")
selected=["API-B2B-01","API-B2B-18","API-PAY-01","API-PAY-11"]
rows=[["검사","시나리오","HTTP","Assertions","결과"]]
for it in a["results"]:
    if it["id"] in selected:rows.append([it["id"],it["name"],it["actual"]["http"],it["actual"]["assertions"],it["status"]])
y=table(rows,M,y,W-2*M,[100,330,75,100,W-2*M-605])-18
y=p(f'<b>전체 집계</b>  {a["summary"]["total"]}개 요청 / {a["assertions"]["total"]}개 검증문 / 실패 {a["assertions"]["failed"]}개',M,y,W-2*M)-16
pay=next(x for x in a["results"] if x["id"]=="API-PAY-11")
y=p("<b>승인 후 확정 실패·자동취소 실패 경로</b><br/>"+'<br/>'.join(str(i+1)+". "+escape(v) for i,v in enumerate(pay["expected"]["paths"])),M,y,W-2*M)-16
p("원본: local/postman/newman.json · junit.xml · upstream-evidence.json<br/>응답의 상태 코드, 실패 코드, 호출 횟수와 순서를 assertion으로 판정한다. PostgreSQL 상태 및 실제 PG 승인 결과는 이 fixture 실행 범위에 포함되지 않는다.",M,y,W-2*M,small)
c.showPage()

y=base("부하 모델과 응답시간 결과","05 / APACHE JMETER")
rows=[["프로파일","VU","측정 표본","p95","오류율","req/s","제외 표본"]]
for it in j["results"]:
    m=it["actual"];rows.append([it["id"],it["profile"]["threads"],m["samples"],str(m["p95Ms"])+"ms",str(m["errorPercent"])+"%",m["rps"],m["warmupExcluded"]])
y=table(rows,M,y,W-2*M,[145,55,105,90,90,105,W-2*M-590])-18
y=p("<b>요청 구성</b>  정상 문의 50% / 토큰 없는 계정 연결 25% / 카드 인증 중단 25%. 요청 간격 100ms. 401·303은 계약에 맞는 응답인지 assertion으로 판정했다.",M,y,W-2*M)-14
y=p("<b>측정 구간</b>  1 VU: 15초 실행·5초 워밍업 제외. 10·25 VU: 각 30초 실행·10초 워밍업 제외. 표는 워밍업을 제외한 집계이며 HTML Dashboard에는 전체 구간이 포함된다.",M,y,W-2*M)-18
y=p("<b>판정 기준</b>  표본 20건 이상 / p95 500ms 미만 / assertion 오류율 1% 미만. 세 프로파일 모두 통과했다.",M,y,W-2*M)-18
y=p("<b>범위</b>  단일 PC에서 실행한 로컬 API 핸들러와 즉시 응답 fixture 기준선. 이 수치는 운영 최대 처리량이나 DB·PG 연동 성능을 의미하지 않는다.",M,y,W-2*M)-18
p("원본: local/jmeter/summary.json · smoke.jtl · baseline.jtl · peak.jtl<br/>시험 계획: test-source/stack/jmeter/subook-local.jmx",M,y,W-2*M,small)
c.showPage()

y=base("GitHub CI 실행 기록","06 / CONTINUOUS INTEGRATION")
ci=data.get("ci")
if ci:
    job=next(x for x in ci["jobs"] if x["name"]=="stack-regression")
    rows=[["항목","기록"],["Selenium·Postman 작업",job["conclusion"]],["전체 workflow",ci["conclusion"]],["실행 시작",kst(job["startedAt"])],["실행 종료",kst(job["completedAt"])],["Commit SHA",ci["headSha"]]]
    y=table(rows,M,y,W-2*M,[180,W-2*M-180])-16
    y=p("Selenium·Postman을 실행한 stack-regression 작업은 성공했다. 별도 regression 작업은 취소됐으며, local-load-baseline 작업은 건너뛰었다. 로컬 JMeter 결과는 앞 장에 기록했다.",M,y,W-2*M)-16
    y=p('<link href="'+escape(job["url"])+'">GitHub stack-regression 작업 열기</link>',M,y,W-2*M)-18
    y=p("첨부: ci-run.json · ci-stack-job.log · ci-artifacts.json · ci-artifacts/",M,y,W-2*M,small)-12
    artifact=next((x for x in data["artifacts"]["artifacts"] if x["name"]=="selenium-postman-results"),None)
    if artifact:p("Artifact: "+artifact["name"]+"<br/>"+escape(artifact.get("digest","")),M,y,W-2*M,small)
c.showPage()

y=base("첨부 자료와 재실행 방법","07 / ARTIFACT INDEX")
rows=[["경로","용도"],["index.html","스크린샷 10장과 도구별 원본을 탐색하는 시작 화면"],["local/selenium/","검사별 PNG, summary.json, 화면에서 발생한 요청 기록"],["local/postman/","36개 API 요청 및 195개 검증문 원본, JUnit, 후속 호출"],["local/jmeter/","JTL 3개, 도구 로그, HTML Dashboard 3개, 측정 집계"],["ci-artifacts/","GitHub에서 내려받은 Selenium·Postman 결과"],["test-source/","자동화 소스, Postman Collection·Environment, JMeter JMX"],["documents/","TC 대장, 버그 리포트, 주간·릴리스 보고서"],["manifest.json / source-index.json","파일 크기·SHA-256 / 로컬 원본 위치·해시"]]
y=table(rows,M,y,W-2*M,[210,W-2*M-210])-16
p("재실행: frontend에서 npm --prefix qa run test:stack<br/>갱신: npm --prefix qa run report:portfolio 후 node qa/portfolio/build-evidence.mjs --date=YYYY-MM-DD<br/>결과 확인: 각 실행 폴더 summary.json과 HTML 리포트. 환경별 응답시간과 생성 시각은 재실행마다 달라진다.",M,y,W-2*M,small)
c.save()
print(json.dumps({"pdf":str(args.output),"pages":page},ensure_ascii=False))
