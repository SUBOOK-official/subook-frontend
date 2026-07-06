import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { maskName, maskPhone } from "../lib/waybillMask";

// CJ 표준 운송장 라벨 (123 x 100 mm, 1.5인치 가이드 기준).
// 데이터 출처: /api/admin/cj-delivery 응답 (trackingNumber, addr[주소정제], sender[수북], order[구매자]).
// 규격: backend/docs/cj/표준운송장가이드_1.5인치.pdf (필드 19종). MVP — 핵심 필드 우선, CJ 샘플 검증 후 미세조정.

// 바코드: jsbarcode. 분류코드=CODE128A(대문자/숫자), 운송장번호=CODE128C(짝수 자리 숫자).
function Barcode({ value, format = "CODE128", height = 40, width = 1.4 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const v = String(value ?? "").trim();
    if (!el || !v) return;
    try {
      JsBarcode(el, v, { format, height, width, displayValue: false, margin: 0 });
    } catch {
      // 포맷에 맞지 않는 값(예: CODE128C에 홀수 자리) — 자동 CODE128로 폴백
      try {
        JsBarcode(el, v, { format: "CODE128", height, width, displayValue: false, margin: 0 });
      } catch {
        /* 무시 — 빈 바코드 */
      }
    }
  }, [value, format, height, width]);
  return <svg ref={ref} aria-hidden="true" />;
}

function todayDotYmd() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

function joinParts(...parts) {
  return parts.map((s) => String(s ?? "").trim()).filter(Boolean).join(" ");
}

// 운송장번호를 4-4-4 형태로 (표시용). 바코드엔 원본(숫자만) 사용.
function formatWaybill(no) {
  const digits = String(no ?? "").replace(/\D/g, "");
  if (digits.length === 12) return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
  return String(no ?? "");
}

export function CjWaybillLabel({ data }) {
  const order = data?.order ?? {};
  const addr = data?.addr ?? {};
  const sender = data?.sender ?? {};
  const items = Array.isArray(order.order_items) ? order.order_items : [];

  const waybill = String(data?.trackingNumber ?? "").replace(/\D/g, "");
  const clsfText = [addr.clsfCd, addr.subClsfCd].filter(Boolean).join("-");
  const branchAlias = [addr.clldlvBranNm, addr.clldlvEmpNickNm].filter(Boolean).join("-");
  const rcvrAddr = joinParts(order.shipping_address_line1, order.shipping_address_line2);
  const sndrAddr = joinParts(sender.addr1, sender.addr2);
  const itemLine =
    items.length > 0
      ? items.map((it) => joinParts(it.title, it.quantity > 1 ? `x${it.quantity}` : "")).join(" / ")
      : `중고 교재 ${order.item_count ?? 1}권`;

  const cell = { border: "0.3mm solid #000", padding: "0.5mm 1mm", boxSizing: "border-box" };

  return (
    <div
      style={{
        width: "123mm",
        height: "100mm",
        boxSizing: "border-box",
        border: "0.4mm solid #000",
        background: "#fff",
        color: "#000",
        fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif",
        fontWeight: 700,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* 1행: 운송장번호 / 접수일자 / 출력매수 / 고객센터 */}
      <div style={{ display: "flex", alignItems: "center", borderBottom: "0.3mm solid #000", height: "9mm" }}>
        <div style={{ ...cell, flex: 1, borderLeft: "none", borderTop: "none", borderBottom: "none" }}>
          <span style={{ fontSize: "2.6mm" }}>운송장번호 </span>
          <span style={{ fontSize: "4.2mm" }}>{formatWaybill(waybill)}</span>
        </div>
        <div style={{ ...cell, width: "22mm", fontSize: "2.8mm", borderTop: "none", borderBottom: "none" }}>
          {todayDotYmd()}
        </div>
        <div style={{ ...cell, width: "10mm", fontSize: "2.8mm", textAlign: "center", borderTop: "none", borderBottom: "none" }}>
          1/1
        </div>
        <div style={{ ...cell, width: "26mm", fontSize: "2.6mm", textAlign: "center", borderTop: "none", borderRight: "none", borderBottom: "none" }}>
          고객센터 1588-1255
        </div>
      </div>

      {/* 2행: 분류코드 바코드 / 분류코드(대) / 운송장번호 바코드 */}
      <div style={{ display: "flex", alignItems: "center", borderBottom: "0.3mm solid #000", height: "26mm" }}>
        <div style={{ width: "34mm", padding: "1mm", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRight: "0.3mm solid #000" }}>
          <Barcode value={addr.clsfCd || ""} format="CODE128A" height={44} width={1.3} />
        </div>
        <div style={{ flex: 1, textAlign: "center", fontSize: "12mm", lineHeight: 1, letterSpacing: "0", whiteSpace: "nowrap", overflow: "hidden" }}>
          {clsfText || "-"}
          {addr.p2pCd ? <span style={{ fontSize: "7mm", marginLeft: "1.5mm" }}>{addr.p2pCd}</span> : null}
        </div>
        <div style={{ width: "40mm", padding: "1mm", display: "flex", alignItems: "center", justifyContent: "center", borderLeft: "0.3mm solid #000" }}>
          <Barcode value={waybill} format="CODE128C" height={52} width={1.35} />
        </div>
      </div>

      {/* 받는분 */}
      <div style={{ display: "flex", borderBottom: "0.3mm solid #000" }}>
        <div style={{ width: "7mm", writingMode: "vertical-rl", textAlign: "center", fontSize: "3mm", borderRight: "0.3mm solid #000", padding: "1mm 0" }}>
          받는분
        </div>
        <div style={{ flex: 1, padding: "1mm" }}>
          <div style={{ fontSize: "3.2mm" }}>
            {maskName(order.shipping_recipient_name)} &nbsp; {maskPhone(order.shipping_recipient_phone)}
          </div>
          <div style={{ fontSize: "3mm", marginTop: "0.5mm" }}>
            [{order.shipping_postal_code || ""}] {rcvrAddr}
          </div>
          <div style={{ fontSize: "6.5mm", marginTop: "1mm", lineHeight: 1.1 }}>{addr.clsfAddr || rcvrAddr}</div>
        </div>
      </div>

      {/* 보내는분 + 운임 */}
      <div style={{ display: "flex", borderBottom: "0.3mm solid #000", alignItems: "stretch" }}>
        <div style={{ width: "7mm", writingMode: "vertical-rl", textAlign: "center", fontSize: "3mm", borderRight: "0.3mm solid #000", padding: "1mm 0" }}>
          보내는분
        </div>
        <div style={{ flex: 1, padding: "1mm", fontSize: "2.8mm" }}>
          {sender.name || "수북"} &nbsp; {sender.phone || ""}
          <div>[{sender.zip || ""}] {sndrAddr}</div>
        </div>
        <div style={{ width: "24mm", padding: "1mm", fontSize: "2.6mm", textAlign: "center", borderLeft: "0.3mm solid #000", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div>수량 {order.item_count ?? 1}</div>
          <div>신용</div>
        </div>
      </div>

      {/* 상품명 */}
      <div style={{ padding: "1mm", fontSize: "2.8mm", borderBottom: "0.3mm solid #000", minHeight: "9mm" }}>
        <span style={{ fontSize: "2.4mm" }}>상품 </span>
        {itemLine}
      </div>

      {/* 배송메시지 */}
      <div style={{ padding: "1mm", fontSize: "2.8mm", flex: 1 }}>
        <span style={{ fontSize: "2.4mm" }}>메모 </span>
        {order.shipping_memo || ""}
      </div>

      {/* 하단: 운송장 바코드 + 배달점소-별칭 */}
      <div style={{ display: "flex", alignItems: "center", borderTop: "0.3mm solid #000", height: "13mm" }}>
        <div style={{ flex: 1, padding: "1mm", display: "flex", alignItems: "center" }}>
          <Barcode value={waybill} format="CODE128C" height={30} width={1.1} />
        </div>
        <div style={{ width: "55mm", padding: "1mm", textAlign: "center", fontSize: "5mm", borderLeft: "0.3mm solid #000" }}>
          {branchAlias || "—"}
        </div>
      </div>
    </div>
  );
}

// 인쇄 모달 — 라벨 + [인쇄] 버튼. @media print로 라벨만 남기고 123x100mm 페이지 세팅.
export function CjWaybillLabelModal({ open, data, onClose }) {
  if (!open || !data) return null;
  return (
    <div
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
      className="cj-label-overlay"
    >
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .cj-label-print, .cj-label-print * { visibility: visible !important; }
          .cj-label-print { position: absolute; left: 0; top: 0; margin: 0 !important; }
          .cj-label-noprint { display: none !important; }
          @page { size: 123mm 100mm; margin: 0; }
        }
      `}</style>

      <div className="cj-label-noprint" style={{ marginBottom: "12px", display: "flex", gap: "8px" }}>
        <button
          type="button"
          onClick={() => window.print()}
          style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}
        >
          🖨 송장 인쇄
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{ background: "#fff", color: "#334155", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "10px 20px", fontWeight: 600, cursor: "pointer" }}
        >
          닫기
        </button>
      </div>

      <div className="cj-label-print" style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
        <CjWaybillLabel data={data} />
      </div>
    </div>
  );
}

export default CjWaybillLabelModal;
