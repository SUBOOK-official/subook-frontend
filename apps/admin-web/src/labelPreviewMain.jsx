// [CJ 라벨 개발/검수 도구 — 개발서버 전용 페이지, 프로덕션 빌드 미포함]
// 모드 1) 양식 인쇄: CJ 지급 사전인쇄 양식(120×96)에 데이터만 인쇄 + 스캔 오버레이 검증
// 모드 2) 전체 인쇄: 백지 라벨용 구형 전체 라벨 (표준 가이드 123×100, 검수 샘플 5건)
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { CjWaybillLabel } from "./components/CjWaybillLabel";
import CjWaybillFormLabel, { CjWaybillFormPrintModal } from "./components/CjWaybillFormLabel";
import formBg from "./dev-assets/cj-form-rect.png";
import sampleBg from "./dev-assets/cj-sample-rect.png";

// CJ 정상 출력 샘플(2026-07-13 스캔)과 동일 데이터 — 오버레이 위치 검증용(캘리브레이션 기준점)
const FORM_MOCK = {
  trackingNumber: "699081176613",
  reprint: 2,
  rateGroup: "C1",
  boxTypeName: "극소",
  addr: {
    clsfCd: "3E57",
    subClsfCd: "2h",
    clsfAddr: "연희 61-24",
    clldlvBranNm: "서울연희",
    clldlvEmpNickNm: "G01-7구역",
    rspsDiv: "01",
    p2pCd: "P7",
  },
  sender: {
    name: "수북(SUBOOK)",
    phone: "010-6271-5792",
    zip: "03722",
    addr1: "서울특별시 서대문구 신촌동 연세로 50 연세대학교 경영관 209호",
    addr2: "[신촌동 134]",
  },
  order: {
    shipping_recipient_name: "박언제",
    shipping_recipient_phone: "010-6271-1234",
    shipping_postal_code: "03706",
    shipping_address_line1: "서울 서대문구 성산로 367-15 (연희동)",
    shipping_address_line2: "[연희동 산 61-24]",
    shipping_memo: "",
    item_count: 1,
    order_items: [{ title: "서적", quantity: 1 }],
  },
};

// CJ 개발환경 실등록 테스트 데이터 5건 — 운송장번호·분류코드·배달점소 전부 실값 (검수 제출용)
const FULL_SAMPLES = [
  {
    trackingNumber: "660033105564",
    addr: { clsfCd: "5B21", subClsfCd: "1a", clsfAddr: "래미안101 101동 1903호", clldlvBranNm: "자양우리", clldlvEmpNickNm: "A05-1구역", rspsDiv: "01", p2pCd: null },
    order: { shipping_recipient_name: "진영욱", shipping_recipient_phone: "010-8353-0001", shipping_postal_code: "05026", shipping_address_line1: "서울 광진구 아차산로 345", shipping_address_line2: "101동 1903호", shipping_memo: "개발환경 테스트", item_count: 1, order_items: [{ title: "2026 수능특강 국어영역", quantity: 1 }] },
  },
  {
    trackingNumber: "660033105586",
    addr: { clsfCd: "1R10", subClsfCd: "1c", clsfAddr: "삼평 681 에이치N", clldlvBranNm: "판교", clldlvEmpNickNm: "C21-3구역", rspsDiv: "01", p2pCd: null },
    order: { shipping_recipient_name: "이서연", shipping_recipient_phone: "010-8353-0003", shipping_postal_code: "13494", shipping_address_line1: "경기 성남시 분당구 판교역로 235", shipping_address_line2: "H스퀘어 3층", shipping_memo: "개발환경 테스트", item_count: 2, order_items: [{ title: "2026 수능완성 수학영역", quantity: 2 }] },
  },
  {
    trackingNumber: "660033105590",
    addr: { clsfCd: "9F31", subClsfCd: "1d", clsfAddr: "재송1 1212 큐비e센", clldlvBranNm: "재송", clldlvEmpNickNm: "H06-3구역", rspsDiv: "01", p2pCd: null },
    order: { shipping_recipient_name: "박도윤", shipping_recipient_phone: "010-8353-0004", shipping_postal_code: "48058", shipping_address_line1: "부산 해운대구 센텀중앙로 90", shipping_address_line2: "1201호", shipping_memo: "부재 시 경비실", item_count: 1, order_items: [{ title: "마더텅 수능기출 영어영역", quantity: 1 }] },
  },
  {
    trackingNumber: "660033105623",
    addr: { clsfCd: "0F55", subClsfCd: "1d", clsfAddr: "치평 1216-3 상무트윈", clldlvBranNm: "치평B", clldlvEmpNickNm: "D03-6구역", rspsDiv: "01", p2pCd: null },
    order: { shipping_recipient_name: "강서현", shipping_recipient_phone: "010-8353-0007", shipping_postal_code: "61949", shipping_address_line1: "광주 서구 상무중앙로 84", shipping_address_line2: "7층", shipping_memo: "개발환경 테스트", item_count: 1, order_items: [{ title: "자이스토리 물리학1", quantity: 1 }] },
  },
  {
    trackingNumber: "660033105634",
    addr: { clsfCd: "6K46", subClsfCd: "1f", clsfAddr: "구성 23", clldlvBranNm: "신봉명", clldlvEmpNickNm: "F03-1구역", rspsDiv: "01", p2pCd: null },
    order: { shipping_recipient_name: "조은우", shipping_recipient_phone: "010-8353-0008", shipping_postal_code: "34141", shipping_address_line1: "대전 유성구 대학로 291", shipping_address_line2: "카이스트 정문", shipping_memo: "문 앞에 놓아주세요", item_count: 3, order_items: [{ title: "한국사 필기노트", quantity: 3 }] },
  },
].map((s) => ({
  ...s,
  // 양식 인쇄용 실값: 검수 첫 출력이므로 reprint 없음.
  // 운임그룹(CJ 샘플의 'C1')은 의미 미확인이라 미표기 — CJ가 값을 확정해주면 VITE_CJ_RATE_GROUP로 주입.
  reprint: 0,
  rateGroup: "",
  boxTypeName: "극소",
  sender: {
    name: "수북(SUBOOK)",
    phone: "010-6271-5792",
    zip: "03722",
    addr1: "서울 서대문구 연세로 50",
    addr2: "연세대학교 212동 경영관 209호 이글루",
  },
}));

const btn = (active) => ({
  padding: "7px 12px",
  borderRadius: "8px",
  border: active ? "2px solid #2563eb" : "1px solid #cbd5e1",
  background: active ? "#eff6ff" : "#fff",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "13px",
});

// 헤드리스 인쇄 진단용 URL 파라미터: ?data=mock|samples & n=<샘플 수 제한>
const urlParams = new URLSearchParams(window.location.search);

function Page() {
  const [tab, setTab] = useState("form"); // form | full
  const [dataMode, setDataMode] = useState(urlParams.get("data") === "mock" ? "mock" : "samples");
  const [bg, setBg] = useState("none"); // sample | blank | none
  const [rotate, setRotate] = useState(true); // 감열 96mm 급지 회전
  // PS70 실측 캘리브레이션 (2026-07-13 테스트 1회차): 전 필드 균일하게 좌 2.6mm·상 0.4mm
  // 밀림(순수 평행이동, 스케일 왜곡 없음) → 보정 기본값 +2.6/+0.4
  const [ox, setOx] = useState(2.6);
  const [oy, setOy] = useState(0.4);

  const bgUrl = bg === "sample" ? sampleBg : bg === "blank" ? formBg : null;

  // 인쇄 CSS — 양식 모드: 데이터만(배경 스캔 제외). 회전=96×120 세로급지, 비회전=120×96.
  const printCss =
    tab === "form"
      ? rotate
        ? `@media print {
            @page { size: 96mm 120mm; margin: 0; }
            .no-print { display: none !important; }
            .cj-form-bg { display: none !important; }
            /* ⚠ 크롬 인쇄 함정(5건 인쇄 실사고): page-break-after를 명시하면 전체가 ~0.84배
               축소된다. 시트가 페이지와 동일 크기(96×120)면 자연 페이지네이션으로 장당
               분리되므로 명시적 브레이크를 쓰지 않는다. */
            .sheet { position: relative; width: 96mm; height: 120mm; overflow: hidden; margin: 0; box-shadow: none; }
            .rot { position: absolute; top: 0; left: 0; width: 0; height: 0; overflow: visible; transform-origin: top left; transform: translateX(96mm) rotate(90deg); }
          }`
        : `@media print {
            @page { size: 120mm 96mm; margin: 0; }
            .no-print { display: none !important; }
            .cj-form-bg { display: none !important; }
            .sheet { width: 120mm; height: 96mm; overflow: hidden; margin: 0; box-shadow: none; page-break-after: always; }
            .rot { transform: none; }
          }`
      : `@media print {
          @page { size: 100mm 123mm; margin: 0; }
          .no-print { display: none !important; }
          .sheet { position: relative; width: 100mm; height: 123mm; overflow: hidden; page-break-after: always; margin: 0; box-shadow: none; }
          .rot { position: absolute; top: 0; left: 0; transform-origin: top left; transform: translateX(100mm) rotate(90deg); }
        }`;

  return (
    <div className="page-wrap" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <style>{`
        .sheet { margin: 0 auto 16px; width: fit-content; box-shadow: 0 2px 12px rgba(0,0,0,0.25); background:#fff; }
        /* 화면 전용 여백/확대 — 인쇄에 padding이 섞이면 라벨이 밀려 2페이지로 넘어간다 */
        @media screen { .page-wrap { padding: 18px; } .form-zoom { zoom: 2; } }
        @media print { .page-wrap { padding: 0; margin: 0; } }
      `}</style>
      <style>{printCss}</style>

      <div className="no-print" style={{ maxWidth: "780px", margin: "0 auto 16px", background: "#fff", borderRadius: "12px", padding: "14px 18px", boxShadow: "0 2px 10px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
          <button type="button" style={btn(tab === "form")} onClick={() => setTab("form")}>양식 인쇄 (CJ 지급 양식 120×96)</button>
          <button type="button" style={btn(tab === "full")} onClick={() => setTab("full")}>전체 인쇄 (백지 123×100 · 구형)</button>
          <button type="button" onClick={() => window.print()} style={{ marginLeft: "auto", padding: "9px 20px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
            🖨 인쇄
          </button>
        </div>

        {tab === "form" ? (
          <div style={{ display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap", fontSize: "13px" }}>
            <span style={{ fontWeight: 700 }}>데이터:</span>
            <button type="button" style={btn(dataMode === "samples")} onClick={() => setDataMode("samples")}>검수 샘플 5건 (실등록)</button>
            <button type="button" style={btn(dataMode === "mock")} onClick={() => setDataMode("mock")}>기준점 1건 (오버레이 검증)</button>
            <span style={{ fontWeight: 700, marginLeft: "8px" }}>배경(검증용):</span>
            <button type="button" style={btn(bg === "sample")} onClick={() => setBg("sample")}>인쇄 샘플</button>
            <button type="button" style={btn(bg === "blank")} onClick={() => setBg("blank")}>빈 양식</button>
            <button type="button" style={btn(bg === "none")} onClick={() => setBg("none")}>없음</button>
            <span style={{ fontWeight: 700, marginLeft: "8px" }}>급지:</span>
            <button type="button" style={btn(rotate)} onClick={() => setRotate(true)}>회전(96mm 폭)</button>
            <button type="button" style={btn(!rotate)} onClick={() => setRotate(false)}>비회전(120mm 폭)</button>
            <label style={{ marginLeft: "8px" }}>
              오프셋X <input type="number" step="0.25" value={ox} onChange={(e) => setOx(Number(e.target.value))} style={{ width: "58px" }} />mm
            </label>
            <label>
              Y <input type="number" step="0.25" value={oy} onChange={(e) => setOy(Number(e.target.value))} style={{ width: "58px" }} />mm
            </label>
          </div>
        ) : (
          <p style={{ fontSize: "13px", color: "#475569", margin: 0 }}>
            (구형) 백지 감열 라벨용 전체 라벨 — CJ 개발환경 실등록 5건. 인쇄 시 100×123 세로급지 회전.
          </p>
        )}
        <p style={{ fontSize: "12px", color: "#94a3b8", margin: "10px 0 0" }}>
          인쇄 대화상자에서 배율 100%(실제 크기)·여백 없음 필수. 양식 모드 인쇄 시 배경 스캔은 자동 제외되고 데이터만 인쇄됩니다.
        </p>
      </div>

      {tab === "form" ? (
        (dataMode === "mock"
          ? [FORM_MOCK]
          : urlParams.has("idx")
            ? [FULL_SAMPLES[Number(urlParams.get("idx")) || 0]].filter(Boolean)
            : FULL_SAMPLES.slice(0, Number(urlParams.get("n")) || FULL_SAMPLES.length)
        ).map((s) => (
          <div className="sheet form-zoom" key={s.trackingNumber}>
            <div className="rot">
              <CjWaybillFormLabel data={s} offsetX={ox} offsetY={oy} bgUrl={bgUrl} bgOpacity={1} />
            </div>
          </div>
        ))
      ) : (
        FULL_SAMPLES.map((s) => (
          <div className="sheet" key={s.trackingNumber}>
            <div className="rot">
              <CjWaybillLabel data={s} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ?modal=1 — admin 주문관리의 실제 인쇄 모달(CjWaybillFormPrintModal)을 body에 큰 앱 콘텐츠와
// 함께 띄워 '인쇄 밀림'을 헤드리스로 재현·검증하는 모드.
// ?modal=1&n=<장수> — 일괄 출력(다건 시트) 검증. 문서 높이가 정확히 120mm × 장수여야 한다.
function ModalRepro() {
  const count = Math.max(1, Number(urlParams.get("n")) || 1);
  const batch =
    count > 1
      ? Array.from({ length: count }, (_, i) => ({
          ...(FULL_SAMPLES[i % FULL_SAMPLES.length] ?? FORM_MOCK),
        }))
      : null;
  return (
    <>
      {/* admin 앱처럼 #root 안에 긴 콘텐츠(밀림 유발 조건). 모달은 createPortal로 body 직계라 #root 밖. */}
      <div id="root" style={{ height: "4000px", background: "#f1f5f9", padding: "40px" }}>
        (admin 앱 시뮬레이션 — #root 긴 콘텐츠, 인쇄 시 display:none 되어야 함)
      </div>
      <CjWaybillFormPrintModal open data={FORM_MOCK} items={batch} onClose={() => {}} />
    </>
  );
}

const isModalRepro = new URLSearchParams(window.location.search).get("modal") === "1";
createRoot(document.getElementById("label-root")).render(isModalRepro ? <ModalRepro /> : <Page />);
