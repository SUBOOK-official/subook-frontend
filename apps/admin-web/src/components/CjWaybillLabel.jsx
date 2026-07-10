import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { maskName, maskPhone } from "../lib/waybillMask";
import { PrinterIcon } from "./icons";

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

// 규격서(표준운송장가이드 1.5인치) 19개 필드 + 개인정보 문구 + 운임 셀을 최대한 충실히 재현.
// pt→mm: 1pt≈0.3528mm. 필드 폰트 pt: 운송장번호12·접수/매수/재출력8·분류코드36·주소약칭24·
// 운임10·보내는분주소8·상품명9·배송메세지8·배달점소별칭18·특수문자30.
export function CjWaybillLabel({ data }) {
  const order = data?.order ?? {};
  const addr = data?.addr ?? {};
  const sender = data?.sender ?? {};
  const items = Array.isArray(order.order_items) ? order.order_items : [];

  const waybill = String(data?.trackingNumber ?? "").replace(/\D/g, "");
  const clsfMain = String(addr.clsfCd ?? "").trim(); // 대분류코드 (분류코드 바코드 값)
  const clsfSub = String(addr.subClsfCd ?? "").trim(); // SUB코드
  const clsfText = [clsfMain, clsfSub].filter(Boolean).join("-");
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
  // 재출력여부(필드4): 재인쇄 횟수(data.reprint)가 있을 때만 표기. 최초 출력은 공란.
  const reprint = Number(data?.reprint) || 0;

  const L = "0.3mm solid #000"; // 내부 구분선

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
      {/* 1행(9mm): 운송장번호(1) | 접수일자(2) | 출력매수(3) | 재출력(4) | 고객센터 */}
      <div style={{ display: "flex", alignItems: "stretch", borderBottom: L, height: "9mm" }}>
        <div style={{ flex: 1, padding: "0 1mm", display: "flex", alignItems: "center", gap: "1mm" }}>
          <span style={{ fontSize: "2.4mm" }}>운송장번호</span>
          <span style={{ fontSize: "4.2mm", letterSpacing: "0.2mm" }}>{formatWaybill(waybill)}</span>
        </div>
        <div style={{ width: "20mm", borderLeft: L, fontSize: "2.8mm", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {todayDotYmd()}
        </div>
        <div style={{ width: "9mm", borderLeft: L, fontSize: "2.8mm", display: "flex", alignItems: "center", justifyContent: "center" }}>
          1/1
        </div>
        <div style={{ width: "13mm", borderLeft: L, fontSize: "2.4mm", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {reprint > 0 ? `재출력 ${reprint}` : ""}
        </div>
        <div style={{ width: "26mm", borderLeft: L, fontSize: "2.5mm", display: "flex", alignItems: "center", justifyContent: "center" }}>
          고객센터 1588-1255
        </div>
      </div>

      {/* 2행(24mm): 분류코드바코드(5) | 분류코드 대+SUB(6) +특수문자(19) | 운송장바코드(8) */}
      <div style={{ display: "flex", alignItems: "center", borderBottom: L, height: "24mm" }}>
        <div style={{ width: "30mm", padding: "1mm", display: "flex", alignItems: "center", justifyContent: "center", borderRight: L }}>
          <Barcode value={clsfMain} format="CODE128A" height={42} width={1.15} />
        </div>
        <div style={{ flex: 1, textAlign: "center", fontSize: "11mm", lineHeight: 1, letterSpacing: "0", whiteSpace: "nowrap" }}>
          {clsfText || "-"}
          {addr.p2pCd ? <span style={{ fontSize: "8mm", marginLeft: "1.5mm" }}>{addr.p2pCd}</span> : null}
        </div>
        <div style={{ width: "39mm", padding: "1mm", display: "flex", alignItems: "center", justifyContent: "center", borderLeft: L }}>
          <Barcode value={waybill} format="CODE128C" height={50} width={1.25} />
        </div>
      </div>

      {/* 받는분(21mm): 성명·전화(7) / 주소(9) / 주소약칭(10) */}
      <div style={{ display: "flex", borderBottom: L, height: "21mm" }}>
        <div style={{ width: "6mm", writingMode: "vertical-rl", textAlign: "center", fontSize: "3mm", borderRight: L, display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: "1mm" }}>
          받는분
        </div>
        <div style={{ flex: 1, padding: "1mm 1.5mm", display: "flex", flexDirection: "column", justifyContent: "flex-start" }}>
          <div style={{ fontSize: "3.5mm" }}>
            {maskName(order.shipping_recipient_name)}
            <span style={{ marginLeft: "3mm" }}>{maskPhone(order.shipping_recipient_phone)}</span>
          </div>
          <div style={{ fontSize: "3mm", marginTop: "0.8mm", lineHeight: 1.15 }}>
            [{order.shipping_postal_code || ""}] {rcvrAddr}
          </div>
          <div style={{ fontSize: "7mm", marginTop: "1mm", lineHeight: 1.05, overflow: "hidden" }}>
            {addr.clsfAddr || rcvrAddr}
          </div>
        </div>
      </div>

      {/* 보내는분(12mm): 성명·전화(11)·주소(15) | 운임그룹+수량(12)·운임(13)·운임구분(14) */}
      <div style={{ display: "flex", borderBottom: L, height: "12mm" }}>
        <div style={{ width: "6mm", writingMode: "vertical-rl", textAlign: "center", fontSize: "2.4mm", borderRight: L, display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: "0" }}>
          보내는분
        </div>
        <div style={{ flex: 1, padding: "1mm 1.5mm", fontSize: "2.8mm", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div>
            {sender.name || "수북"}
            <span style={{ marginLeft: "3mm" }}>{sender.phone || ""}</span>
          </div>
          <div style={{ marginTop: "0.5mm", lineHeight: 1.15 }}>[{sender.zip || ""}] {sndrAddr}</div>
        </div>
        <div style={{ width: "13mm", borderLeft: L, fontSize: "2.5mm", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: "2.1mm" }}>수량</div>
          <div style={{ fontSize: "3.2mm" }}>{qty}</div>
        </div>
        <div style={{ width: "14mm", borderLeft: L, fontSize: "2.5mm", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: "2.1mm" }}>운임</div>
          <div style={{ fontSize: "3.2mm" }}>0</div>
        </div>
        <div style={{ width: "13mm", borderLeft: L, fontSize: "3mm", display: "flex", alignItems: "center", justifyContent: "center" }}>
          신용
        </div>
      </div>

      {/* 상품명(6mm) (16) */}
      <div style={{ height: "6mm", padding: "0 1.5mm", fontSize: "3mm", borderBottom: L, display: "flex", alignItems: "center", overflow: "hidden", whiteSpace: "nowrap" }}>
        <span style={{ fontSize: "2.3mm", marginRight: "1.5mm" }}>상품명</span>
        {itemLine}
      </div>

      {/* 개인정보 보호 문구 + ONE 슬로건 (flex, 규격 표준 문구) */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2mm", borderBottom: L }}>
        <div style={{ fontSize: "2.5mm", lineHeight: 1.35, fontWeight: 600 }}>
          <div>고객님(받는 분)의 소중한 상품을 안전하게 배송하겠습니다.</div>
          <div>개인정보 유출우려가 있으니 운송장은 폐기 바랍니다.</div>
        </div>
        <div style={{ fontSize: "2.4mm", textAlign: "center", whiteSpace: "nowrap", marginLeft: "2mm" }}>
          모두를 위한<br />단 하나의 배송, <span style={{ fontSize: "3.2mm" }}>ONE</span>
        </div>
      </div>

      {/* 배송메세지(17) */}
      <div style={{ height: "5mm", padding: "0 1.5mm", fontSize: "2.8mm", borderBottom: L, display: "flex", alignItems: "center", overflow: "hidden", whiteSpace: "nowrap" }}>
        <span style={{ fontSize: "2.3mm", marginRight: "1.5mm" }}>배송메세지</span>
        {order.shipping_memo || ""}
      </div>

      {/* 하단(13mm): 배달점소-별칭(18) | 운송장바코드(8)+번호 */}
      <div style={{ display: "flex", alignItems: "center", height: "13mm" }}>
        <div style={{ flex: 1, padding: "0 2mm", fontSize: "6mm", overflow: "hidden", whiteSpace: "nowrap" }}>
          {branchAlias || "—"}
        </div>
        <div style={{ width: "48mm", borderLeft: L, padding: "1mm", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <Barcode value={waybill} format="CODE128C" height={28} width={1.05} />
          <div style={{ fontSize: "2.6mm", marginTop: "0.5mm", letterSpacing: "0.3mm" }}>{waybill}</div>
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
          style={{ background: "#080f47", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}
        >
          <PrinterIcon size={14} /> 송장 인쇄
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{ background: "#fff", color: "#3f4045", border: "1px solid #d1d1d4", borderRadius: "8px", padding: "10px 20px", fontWeight: 600, cursor: "pointer" }}
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
