// [CJ 검수용 — 개발서버 전용 페이지] 운송장 출력물 검수 샘플 인쇄
// CJ 개발환경에 실제 등록된 테스트 데이터 5건(운송장번호·주소정제 라우팅 실값)으로
// 표준 운송장 라벨을 인쇄한다. 규격서 1.4.8 검수(사진촬영본 제출)용.
//
// 인쇄 모드 2종:
//  · 감열(PS100): 용지 100×123mm 세로급지, 라벨을 90° 회전해 인쇄 (PS100 인쇄폭 108mm 제약)
//  · A4 원치수: A4 용지에 123×100mm 실치수 인쇄 (배율 100%/실제 크기 필수) → 오려서 촬영
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { CjWaybillLabel } from "./components/CjWaybillLabel";

// CJ 개발환경 등록분 (2026-07-07 소량 배치) — 운송장번호·분류코드·주소약칭·배달점소 전부 실값
const SAMPLES = [
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
  sender: { name: "수북", phone: "01062715792", zip: "03722", addr1: "서울 서대문구 연세로 50", addr2: "연세대학교 212동 경영관 209호 이글루" },
}));

function SamplePrintPage() {
  const [mode, setMode] = useState("thermal"); // thermal(PS100 회전) | a4(원치수)

  // 화면용 기본 스타일은 클래스로만 부여 (인라인 스타일은 @media print 규칙을 이겨버리므로 금지)
  const baseCss = `
    .sheet { margin: 0 auto 16px; width: fit-content; box-shadow: 0 2px 12px rgba(0,0,0,0.25); }
  `;
  const printCss =
    mode === "thermal"
      ? `
        @media print {
          @page { size: 100mm 123mm; margin: 0; }
          .no-print { display: none !important; }
          .sheet { position: relative; width: 100mm; height: 123mm; overflow: hidden; page-break-after: always; margin: 0; box-shadow: none; }
          /* 라벨(123w×100h)을 좌상단 기준 90° 회전 → 100w×123h 세로 용지에 정확히 안착 */
          .rot { position: absolute; top: 0; left: 0; transform-origin: top left; transform: translateX(100mm) rotate(90deg); }
        }`
      : `
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          .no-print { display: none !important; }
          .sheet { width: fit-content; page-break-after: always; margin: 0; box-shadow: none; }
          .rot { transform: none; }
        }`;

  return (
    <div style={{ padding: "20px", fontFamily: "'Noto Sans KR', sans-serif" }}>
      <style>{baseCss}</style>
      <style>{printCss}</style>

      <div className="no-print" style={{ maxWidth: "720px", margin: "0 auto 20px", background: "#fff", borderRadius: "12px", padding: "16px 20px", boxShadow: "0 2px 10px rgba(0,0,0,0.15)" }}>
        <h1 style={{ fontSize: "18px", fontWeight: 800, margin: "0 0 8px" }}>CJ 운송장 출력물 검수 — 샘플 5건</h1>
        <p style={{ fontSize: "13px", color: "#475569", margin: "0 0 12px", lineHeight: 1.6 }}>
          CJ 개발환경에 실제 등록된 테스트 운송장 5건입니다(분류코드·배달점소 실값).
          인쇄 후 사진 촬영하여 CJ에 제출하세요. 브라우저 인쇄창에서 <b>배율 100%(실제 크기)</b>, 여백 없음 확인 필수.
        </p>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button type="button" onClick={() => setMode("thermal")} style={{ padding: "8px 14px", borderRadius: "8px", border: mode === "thermal" ? "2px solid #2563eb" : "1px solid #cbd5e1", background: mode === "thermal" ? "#eff6ff" : "#fff", fontWeight: 700, cursor: "pointer" }}>
            감열 프린터 (PS100 · 100×123 회전)
          </button>
          <button type="button" onClick={() => setMode("a4")} style={{ padding: "8px 14px", borderRadius: "8px", border: mode === "a4" ? "2px solid #2563eb" : "1px solid #cbd5e1", background: mode === "a4" ? "#eff6ff" : "#fff", fontWeight: 700, cursor: "pointer" }}>
            A4 원치수 (오려서 촬영)
          </button>
          <button type="button" onClick={() => window.print()} style={{ marginLeft: "auto", padding: "10px 22px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
            🖨 5건 인쇄
          </button>
        </div>
        <p style={{ fontSize: "12px", color: "#94a3b8", margin: "10px 0 0" }}>
          감열 모드: 프린터 용지를 폭 100mm 라벨로 세팅(용지 크기 100×123 또는 100×150). 라벨이 90° 회전되어 출력되는 것이 정상입니다.
        </p>
      </div>

      {SAMPLES.map((s) => (
        <div className="sheet" key={s.trackingNumber}>
          <div className="rot">
            <CjWaybillLabel data={s} />
          </div>
        </div>
      ))}
    </div>
  );
}

createRoot(document.getElementById("label-root")).render(<SamplePrintPage />);
