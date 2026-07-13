import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { maskName, maskPhone } from "../lib/waybillMask";

// CJ 지급 양식(사전인쇄 라벨, 120×96mm) 전용 — **데이터만** 절대좌표(mm)로 인쇄하는 레이어.
// 테두리·로고·필드라벨(운송장번호/받는분/수량 등)은 양식에 이미 인쇄돼 있으므로 그리지 않는다.
//
// 좌표 출처: CJ 제공 양식·정상 출력 샘플 스캔(2026-07-13)을 동일 좌표계(10px/mm)로
// 호모그래피 정합 후 실측. 전역 오프셋(프린터 급지 편차)은 offsetX/offsetY(mm)로 보정.
// 검증: label-preview.html의 오버레이 모드(스캔 배경 위 데이터 겹침)로 확인.

const F = "'Noto Sans KR', 'Malgun Gothic', sans-serif";

// mm 절대배치 텍스트 셀
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

// mm 절대배치 바코드 — jsbarcode(px 고정)를 viewBox로 바꿔 셀(mm)에 딱 맞게 스트레치.
// 가로 스트레치는 모듈폭이 균일 배율로 변해 판독에 문제 없음.
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
    // px 고정 크기 → viewBox 전환 후 셀에 맞춰 늘림
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
  // 운임그룹(수량칸의 'C1' 자리) — 계약 코드라 env/설정으로 주입 (VITE_CJ_RATE_GROUP)
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
        {/* ── 상단 스트립 — 샘플 실측: 번호 7.2~44.3(넓은 자간), 일자 51.5~67, 1/1 78~, 재출력 93.8~ ── */}
        <T x={7.2} y={0.3} size={4} spacing={0.55}>{formatWaybill(waybill)}</T>
        <T x={51.5} y={0.7} size={3} spacing={0.1}>{todayDotYmd()}</T>
        <T x={78} y={0.7} size={3}>1/1</T>
        {reprint > 0 ? <T x={93.8} y={0.7} size={3}>재출력: {reprint}</T> : null}

        {/* ── 분류코드 영역 — CJ 샘플 실측 앵커(색분석) 기준 ──
            흰 박스(0~41.5): 바코드 0.5~26.5 + 첫글자(밑줄) 29.4~
            노란 박스(41.5~94): 나머지 3자 39.8~66.7(와이드체→scaleX 1.38) + 서브 72.9~90.4(scaleX 1.33) */}
        <B x={0.5} y={4} w={26} h={12.5} value={clsfMain} format="CODE128A" />
        {[
          { x: 29.4, size: 13, sx: 1, underline: true, text: clsfMain.slice(0, 1), dy: 0 },
          { x: 39.8, size: 13, sx: 1.38, underline: false, text: clsfMain.slice(1), dy: 0 },
          { x: 73.5, size: 10, sx: 1.33, underline: false, text: `-${clsfSub}`, dy: 0.8 },
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
              fontWeight: 800,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            <span
              style={{
                fontSize: `${p.size}mm`,
                transform: p.sx !== 1 ? `scaleX(${p.sx})` : undefined,
                transformOrigin: "left bottom",
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
              fontSize: "5.8mm",
              fontWeight: 800,
              fontFamily: F,
              color: "#000",
              background: "#fff",
            }}
          >
            {addr.p2pCd}
          </div>
        ) : null}
        <B x={74.5} y={21.3} w={35.5} h={4.6} value={waybill} format="CODE128C" />

        {/* ── 받는분 ── */}
        <T x={2.5} y={21.2} size={3.2}>{maskName(order.shipping_recipient_name)}</T>
        <T x={18} y={21.2} size={3.2}>{maskPhone(order.shipping_recipient_phone)}</T>
        <T x={2.5} y={24.9} w={95} size={3.3}>{rcvrAddr}</T>
        <T x={2.5} y={32} w={95} size={8.8} weight={800}>{addr.clsfAddr || ""}</T>

        {/* ── 보내는분 + 수량/운임/정산 ── */}
        <T x={2.5} y={40.4} size={2.9}>{sender.name || "수북"}</T>
        <T x={33} y={40.8} size={3.1}>{sender.phone || ""}</T>
        <T x={64.5} y={41} size={3.4}>{joinParts(boxType, rateGroup, String(qty))}</T>
        <T x={86} y={40.8} w={7.2} size={3.4} align="right">0</T>
        <T x={110} y={40.8} size={3.4}>신용</T>
        <T x={2.5} y={44.5} w={80} size={3}>{sndrAddr}</T>

        {/* ── 품목명(실제 품목) + 박스연번 ── */}
        <T x={1} y={48.3} w={72} size={3}>{itemLine}</T>
        <T x={114.6} y={48.9} size={3}>1</T>

        {/* ── 배송메시지 (양식 여백부) ── */}
        {order.shipping_memo ? (
          <T x={3} y={54} w={105} size={3.2}>{order.shipping_memo}</T>
        ) : null}

        {/* ── 하단 ── */}
        <T x={61.5} y={81.2} size={3.2}>총수량:{qty}</T>
        <B x={76} y={80} w={34.5} h={11} value={waybill} format="CODE128C" />
        {/* 사람이 읽는 운송장 숫자 — 샘플 실측 84.9~107 (107.9 이후 런은 바코드 삐침) */}
        <T x={76} y={90.7} w={31} size={3.1} align="right" spacing={0.42}>{waybill}</T>
        {/* 배달점소-별칭 — CJ 출력물은 장평(가로 압축) 서체라 scaleX로 재현 */}
        <div
          style={{
            position: "absolute",
            left: "2.5mm",
            top: "86.2mm",
            fontSize: "10mm",
            fontWeight: 800,
            fontFamily: F,
            color: "#000",
            lineHeight: 1,
            whiteSpace: "nowrap",
            transform: "scaleX(0.64)",
            transformOrigin: "left top",
          }}
        >
          {branchAlias}
        </div>
      </div>
    </div>
  );
}
