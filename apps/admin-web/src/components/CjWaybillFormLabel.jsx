import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import JsBarcode from "jsbarcode";
import { maskName, maskPhone } from "../lib/waybillMask";

// CJ 지급 양식(사전인쇄 라벨, 120×96mm) 전용 — **데이터만** 절대좌표(mm)로 인쇄하는 레이어.
// 테두리·로고·필드라벨(운송장번호/받는분/수량 등)은 양식에 이미 인쇄돼 있으므로 그리지 않는다.
//
// ── 규격 원칙 (표준운송장가이드 1.5인치 표 기준) ──────────────────────────────
// · 폰트: Noto Sans KR Bold(가이드 허용 서체). 글자 변형(scaleX 등) 금지 — 자연 글자폭.
// · 크기: 가이드 pt × 0.96 (가이드는 123×100 기준, 본 양식은 120×96 축소형) → mm 환산.
//   1운송장번호12pt→4.06 / 2·3·4접수일자·매수·재출력8pt→2.71 / 6분류코드36pt→12.19
//   7받는분성명·전화10pt→3.39 / 9받는분주소9pt→3.05 / 10주소약칭24pt→8.13
//   11보내는분성명·전화7pt→2.37 / 12·13·14수량·운임·구분10pt→3.39 / 15보내는분주소8pt→2.71
//   16상품명9pt→3.05 / 17배송메세지8pt→2.71 / 18배달점소18pt→5.9 / 19특수문자→박스 내접 8
// · 예외 2곳(물리 한계, CJ 자체 출력 실측과 일치시킴):
//   - 분류코드 중간(53pt=cap12.9mm)은 이 양식의 분류코드 존(≈15.8mm)에 어센더·디센더 포함
//     수납 불가 + 상단 스트립 침범 → 36pt급(12.19mm) 적용. CJ 정상 출력 실측도 cap≈9mm(36pt급).
//   - 특수문자(30pt=cap7.3mm)는 양식 P2P 박스(7.5mm 높이)에 내접 불가 → 8mm(내접 최대).
// · 좌표: CJ 빈 양식·정상 출력 샘플 스캔의 호모그래피 정합 + 색/명도 프로젝션 실측 앵커.
// · 전역 오프셋(프린터 급지 편차)은 offsetX/offsetY(mm)로 보정 (PS70 실측 +2.6/+0.4).

const F = "'Noto Sans KR', 'Malgun Gothic', sans-serif";

// mm 절대배치 텍스트 셀 (글자 변형 없음 — letterSpacing만 허용)
function T({ x, y, w, size, weight = 700, align = "left", spacing, children }) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${x}mm`,
        top: `${y}mm`,
        width: w ? `${w}mm` : "auto",
        fontSize: `${size}mm`,
        fontWeight: weight,
        textAlign: align,
        letterSpacing: spacing ? `${spacing}mm` : undefined,
        lineHeight: 1.05,
        whiteSpace: "nowrap",
        overflow: "hidden",
        fontFamily: F,
        color: "#000",
      }}
    >
      {children}
    </div>
  );
}

// mm 절대배치 바코드 — jsbarcode(px 고정)를 viewBox로 바꿔 셀(mm)에 맞게 스트레치.
// (바코드는 모듈폭 균일 배율 변화라 판독 무관 — 글자 변형 금지 원칙과 별개)
function B({ x, y, w, h, value, format }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const v = String(value ?? "").trim();
    if (!el || !v) return;
    try {
      JsBarcode(el, v, { format, height: 40, width: 2, displayValue: false, margin: 0 });
    } catch {
      try {
        JsBarcode(el, v, { format: "CODE128", height: 40, width: 2, displayValue: false, margin: 0 });
      } catch {
        return;
      }
    }
    const pw = parseFloat(el.getAttribute("width")) || 1;
    const ph = parseFloat(el.getAttribute("height")) || 1;
    el.setAttribute("viewBox", `0 0 ${pw} ${ph}`);
    el.setAttribute("preserveAspectRatio", "none");
    el.removeAttribute("width");
    el.removeAttribute("height");
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.display = "block";
  }, [value, format]);
  return (
    <div style={{ position: "absolute", left: `${x}mm`, top: `${y}mm`, width: `${w}mm`, height: `${h}mm` }}>
      <svg ref={ref} aria-hidden="true" />
    </div>
  );
}

function todayDotYmd() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

function joinParts(...parts) {
  return parts.map((s) => String(s ?? "").trim()).filter(Boolean).join(" ");
}

function formatWaybill(no) {
  const digits = String(no ?? "").replace(/\D/g, "");
  if (digits.length === 12) return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
  return String(no ?? "");
}

// 주문관리 '송장 출력' 인쇄 모달 — CJ 지급 양식(96×120 롤, PS70 회전 급지) 전용.
// 단건(data) / 다건(items) 모두 지원 — 다건은 시트를 세로로 이어붙여 한 번의 인쇄 작업으로 N장.
//
// ── 다건 인쇄에서 반드시 지켜야 하는 것 (2026-08-10 헤드리스 PDF로 실측) ─────────
// ⚠ `.cj-form-sheet { contain: strict }` 없으면 2장 이상부터 문서 전체가 0.836배 축소된다.
//   원인: 회전 레이어(.cj-form-rot) 안의 라벨은 레이아웃상 120mm 폭이라 96mm 시트를 넘치는데,
//   크롬 인쇄는 이 넘침을 문서 폭(≈114.8mm)으로 보고 shrink-to-fit을 걸어버린다.
//   overflow:hidden만으로는 안 막히고 contain(size+layout+paint)까지 있어야 막힌다.
//   1장일 때는 안 걸려서 오래 못 잡았던 함정 — "다건 인쇄 시 0.84배 축소" 사고의 진짜 원인.
//   (축소가 걸리면 페이지 높이 계산까지 어긋나 7장→6페이지처럼 라벨이 통째로 사라진다.)
// · 축소를 없애면 브레이크 유무와 무관하게 장수가 맞지만, 반올림 드리프트 방어로 시트마다
//   break-after: page를 명시한다(마지막 시트는 제외 — 빈 페이지가 딸려 나온다).
// · 검증: n=1·2·3·7·13·30 전부 페이지수=장수, 내부 배율 3.125(=단건 실물 검증치와 동일),
//   시트 박스 363×454px(=96×120mm), 단건은 텍스트 배치행렬 86개가 변경 전과 완전 동일.
// 인쇄 CSS는 label-preview 하네스에서 실물 검증된 것과 동일 (@page 96×120·회전·데이터만).
export function CjWaybillFormPrintModal({ open, data, items, onClose }) {
  const sheets = Array.isArray(items) && items.length > 0 ? items : data ? [data] : [];
  if (!open || sheets.length === 0) return null;
  const offsetX = Number(import.meta.env.VITE_CJ_PRINT_OFFSET_X ?? 2.6); // PS70 실측 캘리브레이션
  const offsetY = Number(import.meta.env.VITE_CJ_PRINT_OFFSET_Y ?? 0.4);
  // 모달을 body 직계로 포털 렌더 → 인쇄 시 #root(앱 전체)를 display:none으로 완전히 제거하고
  // 라벨 시트만 문서 흐름의 유일 요소로 남긴다(하네스와 동일 구조). visibility:hidden 방식은
  // 레이아웃 공간을 남겨 프린터 직접 인쇄 시 라벨이 아래로 밀리는 원인이라 폐기.
  return createPortal(
    <div
      className="cj-form-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "24px",
        overflow: "auto",
      }}
    >
      <style>{`
        @media print {
          @page { size: 96mm 120mm; margin: 0; }
          /* 앱 전체(#root)를 아예 제거 → 문서에 라벨 시트만 남아 라벨 장수만큼만 출력 */
          #root { display: none !important; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          /* overlay는 폭만 96mm로 고정하고 높이는 시트 수만큼 자연 증가.
             (높이를 고정 클램프하면 장수가 늘 때 마지막 라벨이 잘려나간다) */
          .cj-form-overlay {
            position: static !important; inset: auto !important;
            padding: 0 !important; margin: 0 !important;
            background: none !important; display: block !important;
            width: 96mm !important; height: auto !important; overflow: hidden !important;
          }
          .cj-form-noprint { display: none !important; }
          /* 시트 = 페이지 1장. position:relative(회전 레이어의 containing block)가 없으면
             rot(absolute)가 body 기준이 되어 라벨이 문서 높이를 늘리고 인쇄가 밀린다.
             contain:strict는 위 주석 참고 — 다건 인쇄 축소를 막는 핵심. */
          .cj-form-sheet {
            position: relative !important;
            width: 96mm !important; height: 120mm !important;
            margin: 0 !important; padding: 0 !important; box-shadow: none !important;
            overflow: hidden !important;
            contain: strict !important;
          }
          /* 마지막 시트에는 걸지 않는다 — 빈 페이지가 한 장 더 나온다 */
          .cj-form-sheet:not(:last-of-type) { break-after: page !important; }
          .cj-form-rot { position: absolute; top: 0; left: 0; width: 0; height: 0; overflow: visible; transform-origin: top left; transform: translateX(96mm) rotate(90deg); }
        }
      `}</style>

      <div className="cj-form-noprint" style={{ marginBottom: "12px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            onClick={() => window.print()}
            style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}
          >
            🖨 송장 인쇄{sheets.length > 1 ? ` (${sheets.length}장)` : ""}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "#fff", color: "#334155", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "10px 20px", fontWeight: 600, cursor: "pointer" }}
          >
            닫기
          </button>
        </div>
        <div style={{ background: "#fff", borderRadius: "8px", padding: "8px 14px", fontSize: "12px", color: "#475569", textAlign: "center", lineHeight: 1.6 }}>
          CJ 양식 라벨을 프린터에 넣고 인쇄 — 용지 <b>cj테스트(96×120)</b> · 여백 <b>없음</b> · 배율 <b>100%</b> · 양면 <b>해제</b>
          {sheets.length > 1 ? (
            <>
              <br />
              <b>{sheets.length}장</b>이 한 번에 출력됩니다. 라벨 용지가 <b>{sheets.length}장 이상</b> 남았는지 확인하세요.
            </>
          ) : null}
          <br />
          <span style={{ color: "#b45309" }}>혹시 라벨이 밀려 나오면 → 인쇄창 대상을 <b>"PDF로 저장"</b>으로 뽑은 뒤 그 PDF를 프린터로 출력하세요.</span>
        </div>
      </div>

      {sheets.map((sheet, index) => (
        <div
          className="cj-form-sheet"
          key={`${sheet?.trackingNumber ?? "label"}-${index}`}
          style={{
            background: "#fff",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            // 화면에서만 시트 사이 간격 — 인쇄 CSS의 margin:0 !important가 덮는다
            marginBottom: index < sheets.length - 1 ? "16px" : 0,
          }}
        >
          <div className="cj-form-rot">
            <CjWaybillFormLabel data={sheet} offsetX={offsetX} offsetY={offsetY} />
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}

export default function CjWaybillFormLabel({
  data,
  offsetX = 0, // 프린터 캘리브레이션 (mm, +면 오른쪽)
  offsetY = 0, // (mm, +면 아래)
  bgUrl = null, // 검증용 스캔 배경 (인쇄 시 자동 제외)
  bgOpacity = 1,
}) {
  const order = data?.order ?? {};
  const addr = data?.addr ?? {};
  const sender = data?.sender ?? {};
  const items = Array.isArray(order.order_items) ? order.order_items : [];

  const waybill = String(data?.trackingNumber ?? "").replace(/\D/g, "");
  const clsfMain = String(addr.clsfCd ?? "").trim();
  const clsfSub = String(addr.subClsfCd ?? "").trim();
  const branchAlias = [addr.clldlvBranNm, addr.clldlvEmpNickNm].filter(Boolean).join("-");
  const rcvrAddr = joinParts(order.shipping_address_line1, order.shipping_address_line2);
  const sndrAddr = joinParts(sender.addr1, sender.addr2);
  const qty =
    Number(order.item_count) ||
    items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0) ||
    1;
  const itemLine =
    items.length > 0
      ? items.map((it) => joinParts(it.title, it.quantity > 1 ? `x${it.quantity}` : "")).join(" / ")
      : `중고 교재 ${qty}권`;
  const reprint = Number(data?.reprint) || 0;
  // 운임그룹(수량칸 'C1' 자리) — 계약 코드라 env/설정으로 주입 (VITE_CJ_RATE_GROUP)
  const rateGroup = String(data?.rateGroup ?? import.meta.env.VITE_CJ_RATE_GROUP ?? "").trim();
  const boxType = String(data?.boxTypeName ?? "극소").trim();

  return (
    <div
      style={{
        position: "relative",
        width: "120mm",
        height: "96mm",
        overflow: "hidden",
        background: bgUrl ? "#fff" : "transparent",
        fontFamily: F,
      }}
    >
      {bgUrl ? (
        <img
          src={bgUrl}
          alt=""
          className="cj-form-bg"
          style={{ position: "absolute", inset: 0, width: "120mm", height: "96mm", opacity: bgOpacity }}
        />
      ) : null}

      {/* 데이터 레이어 (캘리브레이션 오프셋 적용 대상) */}
      <div style={{ position: "absolute", inset: 0, transform: `translate(${offsetX}mm, ${offsetY}mm)` }}>
        {/* ── 상단 스트립 (샘플 실측 앵커: 번호7.2 일자51.5 매수78 재출력93.8) ── */}
        <T x={7.2} y={0.3} size={4.06} spacing={0.4}>{formatWaybill(waybill)}</T>
        <T x={51.5} y={0.8} size={2.71} spacing={0.15}>{todayDotYmd()}</T>
        <T x={78} y={0.8} size={2.71}>1/1</T>
        {reprint > 0 ? <T x={93.8} y={0.8} size={2.71}>재출력:{reprint}</T> : null}

        {/* ── 분류코드 영역 — 흰박스(0~41.5): 바코드+첫글자 / 노란박스(41.5~94): 나머지+서브 ──
            바코드 상단은 운송장번호 파란 박스(~5mm)와 겹치지 않게 5.4부터 (3회차 실물 피드백) */}
        <B x={0.5} y={5.4} w={26} h={11.1} value={clsfMain} format="CODE128A" />
        {[
          { x: 29.4, size: 12.19, underline: true, text: clsfMain.slice(0, 1), dy: 0 },
          { x: 39.8, size: 12.19, underline: false, text: clsfMain.slice(1), dy: 0 },
          { x: 73.5, size: 12.19, underline: false, text: `-${clsfSub}`, dy: 0.8 },
        ].map((p) => (
          <div
            key={p.x}
            style={{
              position: "absolute",
              left: `${p.x}mm`,
              top: `${5.6 + p.dy}mm`,
              height: "10.4mm",
              display: "flex",
              alignItems: "flex-end",
              fontFamily: F,
              color: "#000",
              fontWeight: 700,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            <span
              style={{
                fontSize: `${p.size}mm`,
                textDecoration: p.underline ? "underline" : undefined,
                textUnderlineOffset: p.underline ? "1mm" : undefined,
              }}
            >
              {p.text}
            </span>
          </div>
        ))}
        {addr.p2pCd ? (
          <div
            style={{
              position: "absolute",
              left: "98.3mm",
              top: "13.4mm",
              width: "10.5mm",
              height: "7.5mm",
              border: "0.55mm solid #000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "8mm", // 가이드 30pt는 표준형 박스 기준 — 본 양식 박스(7.5mm) 내접 최대
              fontWeight: 700,
              fontFamily: F,
              color: "#000",
              background: "#fff",
            }}
          >
            {addr.p2pCd}
          </div>
        ) : null}
        {/* ── 받는분 ── */}
        <T x={2.5} y={21} size={3.39}>{maskName(order.shipping_recipient_name)}</T>
        <T x={18} y={21} size={3.39}>{maskPhone(order.shipping_recipient_phone)}</T>
        <T x={2.5} y={24.7} w={95} size={3.05}>{rcvrAddr}</T>
        {/* 상단 운송장 바코드 — P7 박스·주소와 겹치지 않게 주소 아래 줄로 (3회차 실물 피드백) */}
        <B x={74.5} y={28.3} w={35.5} h={4} value={waybill} format="CODE128C" />
        <T x={2.5} y={32.7} w={95} size={8.13} weight={700}>{addr.clsfAddr || ""}</T>

        {/* ── 보내는분 + 수량/운임/정산 ── */}
        <T x={2.5} y={40.6} size={2.37}>{sender.name || "수북"}</T>
        <T x={33} y={40.9} size={2.37}>{sender.phone || ""}</T>
        <T x={64.5} y={40.8} size={3.39}>{joinParts(boxType, rateGroup, String(qty))}</T>
        <T x={86} y={40.8} w={7.2} size={3.39} align="right">0</T>
        <T x={110} y={40.8} size={3.39}>신용</T>
        <T x={2.5} y={44.6} w={80} size={2.71}>{sndrAddr}</T>

        {/* ── 품목명(실제 품목) + 박스연번 ── */}
        <T x={1} y={48.3} w={72} size={3.05}>{itemLine}</T>
        <T x={114.6} y={48.9} size={3.05}>1</T>

        {/* ── 배송메시지 (양식 여백부) ── */}
        {order.shipping_memo ? (
          <T x={3} y={54} w={105} size={2.71}>{order.shipping_memo}</T>
        ) : null}

        {/* ── 하단 ── */}
        <T x={61.5} y={81.3} size={3.05}>총수량:{qty}</T>
        {/* 하단 바코드 — 흰 칸 경계선(~81) 아래로 내접 (3회차 실물 피드백) */}
        <B x={76} y={81.2} w={34.5} h={9.6} value={waybill} format="CODE128C" />
        <T x={76} y={91} w={31} size={3.1} align="right" spacing={0.42}>{waybill}</T>
        {/* 배달점소-별칭 — 가이드 18pt×0.96≈5.9mm, 자연 글자폭(변형 금지) */}
        <T x={2.5} y={86.6} w={72} size={5.9} weight={900}>{branchAlias}</T>
      </div>
    </div>
  );
}
