import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { formatCurrency } from "@shared-domain/format";
import { formatPhoneNumber, isValidKoreanMobile } from "../lib/publicAuthFormUtils";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, TicketIcon } from "../components/icons";
import { fetchMyPoints } from "../lib/publicPoints";
import {
  clampPointsInput,
  computeMaxUsablePoints,
  formatPoints,
  getPointsUnavailableReason,
} from "../lib/publicPointsUtils";
import { useBodyScrollLock } from "@shared-domain/useBodyScrollLock";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { supabase as publicSupabase } from "@shared-supabase/publicSupabaseClient";
import {
  makeOnceGuard,
  trackAddPaymentInfo,
  trackAddShippingInfo,
  trackBeginCheckout,
  trackCheckoutError,
  trackCopyClick,
  trackCouponApply,
  trackCouponRemove,
  trackDialogClose,
  trackDialogOpen,
  trackEvent,
  trackException,
  trackFormProgress,
  trackPaymentMethodSelect,
  trackPurchase,
  trackSelectContent,
} from "../lib/analytics";
import {
  FREE_SHIPPING_THRESHOLD,
  calculateShippingFee,
  createOrder,
  createPgCheckoutSession,
} from "../lib/cart";
import {
  createGuestOrder,
  createGuestPgCheckoutSession,
  stashGuestOrderRef,
} from "../lib/guestOrder";
import { getRemoteAreaInfo } from "../lib/remoteAreaShipping";
import { loadMemberPortalSnapshot, saveMemberShippingAddress } from "../lib/memberPortal";
import { usePageMeta } from "../lib/usePageMeta";
import { getThumbnailImageUrl } from "../lib/storageImage";
import {
  BANK_ACCOUNT,
  BANK_HOLDER,
  BANK_NAME,
  PAYMENT_DEADLINE_HOURS,
} from "../lib/paymentBankInfo";
import {
  NICEPAY_READY,
  buildNicepayGoodsName,
  loadNicepaySdk,
  requestNicepayCardPay,
} from "../lib/nicepay";
import { PG_OVERRIDE } from "../lib/pgReviewMode";
import { BANK_OPTIONS } from "../lib/publicMypageUtils";
import "./PublicOrderPage.css";

// 백엔드 create_order가 던지는 영문/시스템 메시지를 사용자 친화 한국어로 매핑.
// 단일재고 특성상 "이미 다른 주문에 예약됨/품절"이 가장 흔하므로 가장 친절하게 안내한다.
function toFriendlyOrderError(error) {
  const raw = (error?.message || "").toLowerCase();
  if (raw.includes("already reserved") || raw.includes("not available") || raw.includes("sold")) {
    return "방금 다른 분이 먼저 구매했거나 품절된 교재가 있어요. 장바구니에서 해당 교재를 빼고 다시 시도해 주세요.";
  }
  if (raw.includes("at least one item")) {
    return "주문할 교재가 없어요. 장바구니를 다시 확인해 주세요.";
  }
  if (raw.includes("coupon")) {
    return "쿠폰을 적용할 수 없어요. 쿠폰을 다시 선택해 주세요.";
  }
  if (raw.includes("failed to fetch") || raw.includes("network")) {
    return "네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
  }
  // 이미 한국어 메시지면 그대로 노출, 아니면 기본 문구.
  if (error?.message && /[가-힣]/.test(error.message)) return error.message;
  return "주문에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

// P1-7: 쿠폰 정렬 — 만료 임박(<24h) 우선 + 같은 그룹에서 큰 할인 순.
// 결제 시점에 사용자가 가장 큰 이득을 가져갈 수 있는 쿠폰을 상단에 노출.
const COUPON_EXPIRY_SOON_MS = 24 * 60 * 60 * 1000;

function estimateCouponDiscountAmount(coupon, subtotal) {
  if (!coupon) return 0;
  if (coupon.discount_type === "fixed") {
    return Math.min(coupon.discount_value || 0, subtotal);
  }
  if (coupon.discount_type === "percentage") {
    let d = Math.floor((subtotal * (coupon.discount_value || 0)) / 100);
    if (coupon.max_discount_amount != null) d = Math.min(d, coupon.max_discount_amount);
    return d;
  }
  // free_shipping은 SHIPPING_FEE 만큼 가치를 가지지만 비교 단순화를 위해 0으로 둔다.
  // (배송비 정확 비교는 결제 요약에서 별도)
  return 0;
}

function getCouponExpiryMs(coupon) {
  if (!coupon?.expires_at) return Number.POSITIVE_INFINITY;
  const ms = new Date(coupon.expires_at).getTime();
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

function isCouponExpiringSoon(coupon) {
  if (!coupon?.expires_at) return false;
  const ms = getCouponExpiryMs(coupon);
  return ms - Date.now() <= COUPON_EXPIRY_SOON_MS;
}

// 쿠폰 할인 미리 계산 (백엔드 create_order RPC와 동일 규칙).
// 결제 요약 미리보기용. 실제 차감은 백엔드에서 다시 계산해 source of truth로 둔다.
function previewCouponDiscount(coupon, subtotal, shippingFee) {
  if (!coupon) return { subtotalDiscount: 0, shippingFeeAfter: shippingFee, label: "" };
  if (coupon.discount_type === "free_shipping") {
    return { subtotalDiscount: 0, shippingFeeAfter: 0, label: "무료배송" };
  }
  if (coupon.discount_type === "fixed") {
    const d = Math.min(coupon.discount_value || 0, subtotal);
    return { subtotalDiscount: d, shippingFeeAfter: shippingFee, label: `${formatCurrency(d)} 할인` };
  }
  if (coupon.discount_type === "percentage") {
    let d = Math.floor((subtotal * (coupon.discount_value || 0)) / 100);
    if (coupon.max_discount_amount != null) d = Math.min(d, coupon.max_discount_amount);
    return { subtotalDiscount: d, shippingFeeAfter: shippingFee, label: `${formatCurrency(d)} 할인` };
  }
  return { subtotalDiscount: 0, shippingFeeAfter: shippingFee, label: "" };
}

// 결제위젯에 넘길 최종 결제금액 — 화면 표시용 totalAmount와 동일 공식.
// (create_order가 서버에서 다시 계산하므로 제출 직전 setAmount(data.total_amount)로 한 번 더 맞춘다)
function computePayableTotal(items, coupons, selectedCouponId, pointsToUse = 0, pointBalance = 0) {
  const subtotal = (items || []).reduce((sum, i) => sum + (i.price ?? 0) * (i.quantity ?? 1), 0);
  const baseShipping = calculateShippingFee(subtotal);
  const coupon = (coupons || []).find((c) => c.id === selectedCouponId) ?? null;
  const preview = previewCouponDiscount(coupon, subtotal, baseShipping);
  // 포인트(2026-09-02)는 서버와 같은 규칙으로 상한 클램프 — 화면 totalAmount와 동일 공식
  const usablePoints = computeMaxUsablePoints({
    balance: pointBalance,
    subtotal,
    couponDiscount: preview.subtotalDiscount,
  });
  const points = Math.min(Math.max(0, Number(pointsToUse) || 0), usablePoints);
  return Math.max(0, subtotal + preview.shippingFeeAfter - preview.subtotalDiscount - points);
}

const PAYMENT_METHODS = [
  { id: "bank_transfer", label: "계좌이체 (무통장입금)", available: true },
  { id: "card", label: "신용/체크카드", available: false },
  { id: "kakao_pay", label: "카카오페이", available: false },
  { id: "toss_pay", label: "토스페이", available: false },
  { id: "naver_pay", label: "네이버페이", available: false },
];

// 입력 필드에서 Enter(모바일 '다음') → 같은 컨테이너의 다음 입력칸으로 자동 이동+포커스.
// readonly(주소 자동입력)·disabled·체크박스·라디오는 건너뛴다. 컨테이너 onKeyDown에 연결해 사용.
function focusNextFieldOnEnter(event) {
  if (event.key !== "Enter") return;
  const target = event.target;
  if (!target || target.tagName !== "INPUT") return;
  if (["checkbox", "button", "submit", "radio"].includes(target.type)) return;
  event.preventDefault();
  const focusables = Array.from(
    event.currentTarget.querySelectorAll("input, select"),
  ).filter(
    (el) =>
      !el.disabled &&
      !el.readOnly &&
      el.type !== "checkbox" &&
      el.type !== "radio" &&
      el.offsetParent !== null,
  );
  const index = focusables.indexOf(target);
  if (index >= 0 && index < focusables.length - 1) {
    focusables[index + 1].focus();
  } else {
    target.blur();
  }
}

// 주문 라인아이템 → GA4 items 입력 형태 (analytics.js toGaItem이 최종 변환)
function toAnalyticsLine(item) {
  return {
    productId: item.productId,
    title: item.title,
    optionLabel: item.optionLabel,
    conditionGrade: item.conditionGrade,
    price: item.price,
    quantity: item.quantity,
  };
}

// 은행 선택 커스텀 드롭다운 — 네이티브 select 대신 앱 스타일의 옵션 리스트.
function BankSelect({ value, onChange, options, placeholder = "은행 선택" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="order-bank-select" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`order-bank-select__trigger${value ? "" : " is-placeholder"}`}
        onClick={() => setOpen((prev) => !prev)}
        type="button"
      >
        <span>{value || placeholder}</span>
        <svg
          aria-hidden="true"
          className={`order-bank-select__caret${open ? " is-open" : ""}`}
          fill="none"
          height="14"
          viewBox="0 0 24 24"
          width="14"
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      </button>
      {open ? (
        <ul className="order-bank-select__list" role="listbox">
          {options.map((bank) => (
            <li key={bank}>
              <button
                aria-selected={bank === value}
                className={`order-bank-select__option${bank === value ? " is-selected" : ""}`}
                onClick={() => {
                  onChange(bank);
                  setOpen(false);
                }}
                role="option"
                type="button"
              >
                {bank}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ── 배송 요청사항 — 선택형 모달 (2026-07-12 UX 개편) ─────────────────────────
const DELIVERY_REQUEST_PRESETS = [
  "문 앞에 놓아주세요",
  "경비실에 맡겨 주세요",
  "파손 위험 상품입니다. 배송 시 주의해주세요",
];
const DELIVERY_MEMO_MAX = 40;
const MEMO_CHOICE_NONE = "__none__";
const MEMO_CHOICE_CUSTOM = "__custom__";

function OrderDeliveryRequestModal({ open, memo, onApply, onClose }) {
  const [choice, setChoice] = useState(MEMO_CHOICE_NONE);
  const [customText, setCustomText] = useState("");

  useBodyScrollLock(open);

  // 열릴 때마다 현재 적용된 요청사항으로 초기화
  useEffect(() => {
    if (!open) return;
    if (!memo) {
      setChoice(MEMO_CHOICE_NONE);
      setCustomText("");
    } else if (DELIVERY_REQUEST_PRESETS.includes(memo)) {
      setChoice(memo);
      setCustomText("");
    } else {
      setChoice(MEMO_CHOICE_CUSTOM);
      setCustomText(memo);
    }
  }, [open, memo]);

  if (!open) return null;

  const options = [
    { value: MEMO_CHOICE_NONE, label: "요청사항 없음" },
    ...DELIVERY_REQUEST_PRESETS.map((preset) => ({ value: preset, label: preset })),
    { value: MEMO_CHOICE_CUSTOM, label: "직접 입력" },
  ];
  const canApply = choice !== MEMO_CHOICE_CUSTOM || customText.trim().length > 0;

  const handleApply = () => {
    if (!canApply) return;
    if (choice === MEMO_CHOICE_NONE) {
      onApply("");
    } else if (choice === MEMO_CHOICE_CUSTOM) {
      onApply(customText.trim().slice(0, DELIVERY_MEMO_MAX));
    } else {
      onApply(choice);
    }
  };

  return (
    <div className="order-modal__overlay" onClick={onClose} role="presentation">
      <div
        aria-label="배송 요청사항"
        className="order-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="order-modal__head">
          <span aria-hidden="true" className="order-modal__head-spacer" />
          <h3 className="order-modal__title">배송 요청사항</h3>
          <button aria-label="닫기" className="order-modal__icon-btn" onClick={onClose} type="button">
            <CloseIcon size={20} />
          </button>
        </div>
        <div className="order-modal__body">
          {options.map((option) => (
            <button
              className={`order-modal__option${choice === option.value ? " is-selected" : ""}`}
              key={option.value}
              onClick={() => setChoice(option.value)}
              type="button"
            >
              <span>{option.label}</span>
              {choice === option.value && <CheckIcon size={18} />}
            </button>
          ))}
          {choice === MEMO_CHOICE_CUSTOM && (
            <textarea
              className="order-modal__textarea"
              maxLength={DELIVERY_MEMO_MAX}
              onChange={(event) => setCustomText(event.target.value)}
              placeholder={`내용을 입력해주세요.(최대 ${DELIVERY_MEMO_MAX}자)`}
              rows={3}
              value={customText}
            />
          )}
        </div>
        <div className="order-modal__actions">
          <button className="order-modal__btn" onClick={onClose} type="button">
            취소
          </button>
          <button
            className="order-modal__btn order-modal__btn--primary"
            disabled={!canApply}
            onClick={handleApply}
            type="button"
          >
            적용하기
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 주소록 모달 — 목록/새 주소 추가 2뷰 (2026-07-12 UX 개편) ──────────────────
const EMPTY_ADDRESS_FORM = {
  name: "",
  phone: "",
  postalCode: "",
  addressLine1: "",
  addressLine2: "",
  isDefault: false,
};

function OrderAddressBookModal({
  open,
  addresses,
  selectedAddressId,
  user,
  onSelect,
  onSaved,
  onClose,
  showToast,
  // GA4 — 결제 여정 공통 컨텍스트(checkout_type·pg_review_mode)를 주문서에서 주입
  checkoutContext = () => ({}),
}) {
  const [view, setView] = useState("list");
  const [form, setForm] = useState(EMPTY_ADDRESS_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);

  useBodyScrollLock(open);

  useEffect(() => {
    if (open) {
      setView("list");
      setForm(EMPTY_ADDRESS_FORM);
      setNameTouched(false);
    }
  }, [open]);

  if (!open) return null;

  const trimmedName = form.name.trim();
  const nameInvalid = trimmedName.length < 2 || trimmedName.length > 50;
  const formattedPhone = formatPhoneNumber(form.phone);
  const canSave =
    !nameInvalid &&
    isValidKoreanMobile(formattedPhone) &&
    Boolean(form.postalCode) &&
    Boolean(form.addressLine1) &&
    !isSaving;

  const handleSearchPostcode = async () => {
    // GA4 address_search_open — 우편번호 검색 진입(주소 입력 단계 이탈 진단)
    trackEvent("address_search_open", { uiSurface: "address_book", ...checkoutContext() });
    try {
      await loadDaumPostcode();
    } catch (err) {
      trackCheckoutError("address_script", err?.message, {
        uiSurface: "address_book",
        ...checkoutContext(),
      });
      showToast(err?.message || "주소 검색을 불러오지 못했습니다.", "error");
      return;
    }
    if (!window.daum?.Postcode) {
      trackCheckoutError("address_script", "postcode_unavailable", {
        uiSurface: "address_book",
        ...checkoutContext(),
      });
      showToast("주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
      return;
    }
    new window.daum.Postcode({
      oncomplete: (data) => {
        // GA4 address_search_complete — 주소 원문은 절대 보내지 않고 도서산간 여부만
        trackEvent("address_search_complete", {
          uiSurface: "address_book",
          isRemoteArea: Boolean(getRemoteAreaInfo(data.zonecode)),
          ...checkoutContext(),
        });
        setForm((prev) => ({
          ...prev,
          postalCode: data.zonecode,
          addressLine1: data.roadAddress || data.jibunAddress,
        }));
      },
    }).open();
  };

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    const savedValues = {
      recipient_name: trimmedName,
      recipient_phone: formattedPhone,
      postal_code: form.postalCode,
      address_line1: form.addressLine1,
      address_line2: form.addressLine2.trim(),
    };
    const result = await saveMemberShippingAddress({
      user,
      values: { id: null, label: "", ...savedValues, delivery_memo: "" },
      shouldMakeDefault: form.isDefault || addresses.length === 0,
    });
    setIsSaving(false);
    if (result.error) {
      // GA4 exception — 주소 저장 실패(입력값은 보내지 않는다)
      trackException("address_save_failed", {
        errorMessage: result.error.message,
        ...checkoutContext(),
      });
      showToast(result.error.message || "주소를 저장하지 못했습니다.", "error");
      return;
    }
    // GA4 address_save — 저장 성공 시점만(실패는 위 exception)
    trackEvent("address_save", {
      uiSurface: "order_page",
      setDefault: Boolean(form.isDefault || addresses.length === 0),
      ...checkoutContext(),
    });
    await onSaved(savedValues);
    setView("list");
    setForm(EMPTY_ADDRESS_FORM);
    setNameTouched(false);
  };

  return (
    <div className="order-modal__overlay" onClick={onClose} role="presentation">
      <div
        aria-label={view === "list" ? "주소록" : "주소 추가하기"}
        className="order-modal order-modal--address"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="order-modal__head">
          {view === "add" ? (
            <button
              aria-label="주소록으로 돌아가기"
              className="order-modal__icon-btn"
              onClick={() => setView("list")}
              type="button"
            >
              <ChevronLeftIcon size={20} />
            </button>
          ) : (
            <span aria-hidden="true" className="order-modal__head-spacer" />
          )}
          <h3 className="order-modal__title">{view === "list" ? "주소록" : "주소 추가하기"}</h3>
          <button aria-label="닫기" className="order-modal__icon-btn" onClick={onClose} type="button">
            <CloseIcon size={20} />
          </button>
        </div>

        {view === "list" ? (
          <div className="order-modal__body order-modal__body--list">
            <button
              className="order-addrbook__add-btn"
              onClick={() => {
                // GA4 address_add_start — 주소록에 저장된 주소를 두고 새로 입력하는 비율
                trackEvent("address_add_start", { ...checkoutContext() });
                setView("add");
              }}
              type="button"
            >
              + 새 주소 추가하기
            </button>
            {addresses.map((addr) => (
              <button
                className="order-addrbook__item"
                key={addr.id}
                onClick={() => onSelect(addr)}
                type="button"
              >
                <span className="order-addrbook__item-main">
                  <span className="order-addrbook__item-name">
                    {addr.recipient_name}
                    {addr.is_default && <span className="order-addrbook__badge">기본 배송지</span>}
                  </span>
                  <span className="order-addrbook__item-addr">
                    ({addr.postal_code}) {addr.address_line1} {addr.address_line2}
                  </span>
                  <span className="order-addrbook__item-phone">{addr.recipient_phone}</span>
                </span>
                {addr.id === selectedAddressId && (
                  <span className="order-addrbook__item-check">
                    <CheckIcon size={18} />
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div
            className="order-modal__body order-modal__body--form"
            onKeyDown={focusNextFieldOnEnter}
          >
            <label className="order-addrbook__field">
              <span className="order-addrbook__field-label">이름</span>
              <input
                className={`order-addrbook__input${nameTouched && nameInvalid ? " is-error" : ""}`}
                enterKeyHint="next"
                onBlur={() => setNameTouched(true)}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="수령인의 이름"
                type="text"
                value={form.name}
              />
              {nameTouched && nameInvalid && (
                <span className="order-addrbook__field-error">올바른 이름을 입력해주세요. (2 - 50자)</span>
              )}
            </label>
            <label className="order-addrbook__field">
              <span className="order-addrbook__field-label">휴대폰 번호</span>
              <input
                className="order-addrbook__input"
                enterKeyHint="next"
                inputMode="numeric"
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, phone: event.target.value.replace(/\D/g, "").slice(0, 11) }))
                }
                placeholder="- 없이 입력"
                type="tel"
                value={form.phone}
              />
            </label>
            <div className="order-addrbook__field">
              <span className="order-addrbook__field-label">우편번호</span>
              <div className="order-addrbook__postal-row">
                <input
                  className="order-addrbook__input"
                  placeholder="우편 번호를 검색하세요"
                  readOnly
                  type="text"
                  value={form.postalCode}
                />
                <button className="order-addrbook__postal-btn" onClick={handleSearchPostcode} type="button">
                  우편번호
                </button>
              </div>
            </div>
            <label className="order-addrbook__field">
              <span className="order-addrbook__field-label">주소</span>
              <input
                className="order-addrbook__input"
                placeholder="우편 번호 검색 후, 자동입력 됩니다"
                readOnly
                type="text"
                value={form.addressLine1}
              />
            </label>
            <label className="order-addrbook__field">
              <span className="order-addrbook__field-label">상세 주소</span>
              <input
                className="order-addrbook__input"
                enterKeyHint="done"
                onChange={(event) => setForm((prev) => ({ ...prev, addressLine2: event.target.value }))}
                placeholder="건물, 아파트, 동/호수 입력"
                type="text"
                value={form.addressLine2}
              />
            </label>
            <label className="order-addrbook__default-check">
              <input
                checked={form.isDefault}
                onChange={(event) => {
                  // GA4 address_default_toggle — 기본 배송지 지정 의향
                  trackEvent("address_default_toggle", {
                    checked: event.target.checked,
                    ...checkoutContext(),
                  });
                  setForm((prev) => ({ ...prev, isDefault: event.target.checked }));
                }}
                type="checkbox"
              />
              <span>기본 배송지로 설정</span>
            </label>
            <button
              className="order-modal__btn order-modal__btn--primary order-modal__btn--full"
              disabled={!canSave}
              onClick={handleSave}
              type="button"
            >
              {isSaving ? "저장 중..." : "저장하기"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// PG(토스 결제위젯) 활성 플래그 — 프로덕션은 라이브 키 들어오기 전까지 OFF.
// OFF면 아래 모든 PG 분기가 비활성화되고 기존 계좌이체 UI 그대로 동작한다.
const TOSS_ENABLED = import.meta.env.VITE_TOSS_ENABLED === "true";
const TOSS_CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY || "";
const TOSS_READY = TOSS_ENABLED && Boolean(TOSS_CLIENT_KEY);

// 토스 전자결제 심사 모드 — ?pg=toss 세션은 결제창을 토스 결제위젯으로 강제한다.
// 키가 없으면 공식 문서용 공개 테스트 키로 렌더링(실결제 불가, 결제창 확인 전용).
// 심사 종료(라이브 키 전환) 시 lib/pgReviewMode.js와 함께 제거.
const TOSS_DOCS_TEST_CLIENT_KEY = "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm";
const REVIEW_TOSS_CLIENT_KEY = TOSS_CLIENT_KEY || TOSS_DOCS_TEST_CLIENT_KEY;

// PG 제공사 선택 — 나이스페이(결제창)와 토스(결제위젯)는 배타적으로 운용.
// 나이스페이 포스타트 선도입(2026-07) 기간엔 나이스페이 우선, 둘 다 꺼져 있으면 계좌이체만.
const PG_PROVIDER = PG_OVERRIDE === "toss" ? "toss" : NICEPAY_READY ? "nicepay" : TOSS_READY ? "toss" : null;
const PG_READY = PG_PROVIDER !== null;
// 위젯 초기화에 실제 사용할 클라이언트 키 (심사 모드에서만 문서용 키 폴백 허용)
const ACTIVE_TOSS_CLIENT_KEY = PG_OVERRIDE === "toss" ? REVIEW_TOSS_CLIENT_KEY : TOSS_CLIENT_KEY;

// 결제위젯 orderName(최대 100자): "첫 상품명 외 N건"
function buildOrderName(items) {
  const first = items?.[0]?.title || "수북 교재";
  const extra = (items?.length ?? 1) - 1;
  const name = extra > 0 ? `${first} 외 ${extra}건` : first;
  return name.length > 100 ? name.slice(0, 100) : name;
}

function loadDaumPostcode() {
  return new Promise((resolve, reject) => {
    if (window.daum?.Postcode) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    script.async = true;

    // 10초 타임아웃 — 광고차단/네트워크 끊김 등으로 onload/onerror 둘 다 안 불리는 케이스 방어
    const timer = window.setTimeout(() => {
      reject(new Error("주소 검색 스크립트 로드 시간이 초과되었습니다. 네트워크 또는 광고차단 설정을 확인해 주세요."));
    }, 10_000);

    script.onload = () => {
      window.clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
    };

    document.head.appendChild(script);
  });
}

function OrderItemRow({ item }) {
  const lineTotal = (item.price ?? 0) * item.quantity;
  return (
    <div className="order-item">
      <div className="order-item__image">
        {item.coverImageUrl ? (
          <img alt={item.title} src={getThumbnailImageUrl(item.coverImageUrl)} />
        ) : (
          <div className="order-item__image-placeholder">SUBOOK</div>
        )}
      </div>
      <div className="order-item__info">
        <p className="order-item__title">{item.title}</p>
        <p className="order-item__meta">
          {[item.optionLabel, item.conditionGrade].filter(Boolean).join(" · ")}
        </p>
        <p className="order-item__qty">수량 {item.quantity}개</p>
      </div>
      <div className="order-item__price">
        {item.price !== null ? formatCurrency(lineTotal) : "—"}
      </div>
    </div>
  );
}

function PublicOrderPage() {
  usePageMeta({ title: "주문/결제", noindex: true });

  const { isAuthenticated, isLoading: authLoading, user, profile } = usePublicAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const initialOrderItems = location.state?.items;
  // 비회원(게스트) 주문 모드 (2026-08-03) — 로그인 게이트의 "비회원으로 주문하기"로만
  // 진입한다(state 플래그). 플래그 없이 비로그인으로 들어오면 기존대로 로그인으로 보낸다.
  // 로그인 상태면 플래그가 있어도 회원 주문으로 진행한다.
  const isGuestMode = Boolean(location.state?.guestMode);
  const isGuestCheckout = isGuestMode && !isAuthenticated;
  // 진입 시점의 cart snapshot을 보관하고, 서버에서 fresh 가격/판매상태를 받아 덮어쓴다.
  // create_order RPC는 어차피 서버 가격으로 결제하므로, 표시 금액과 실제 결제 금액의
  // mismatch를 막기 위해 진입 직후 한 번 재검증.
  const [orderItems, setOrderItems] = useState(initialOrderItems);
  const [priceDriftWarning, setPriceDriftWarning] = useState(null);

  const [shipping, setShipping] = useState({
    recipientName: "",
    recipientPhone: "",
    postalCode: "",
    addressLine1: "",
    addressLine2: "",
    memo: "",
  });
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  // 배송지 UX 개편 (2026-07-12): 기본 배송지 카드 + 주소록 모달 + 요청사항 선택 모달
  const [isAddressBookOpen, setIsAddressBookOpen] = useState(false);
  const [isMemoModalOpen, setIsMemoModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(PG_READY ? "card" : "bank_transfer");
  // 무통장입금 환불 대비 계좌 정보 (PG 안정화 전까지 수동 환불용). 관리자 주문 상세에서 확인.
  const [refundAccount, setRefundAccount] = useState({ bank: "", number: "", holder: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  // P0-3: 동의 체크박스 3개로 분리 — 주문 내용/결제 및 자동 취소/환불 정책
  const [agreementOrder, setAgreementOrder] = useState(false);
  const [agreementPayment, setAgreementPayment] = useState(false);
  const [agreementRefund, setAgreementRefund] = useState(false);
  // PG('card') vs 계좌이체. PG는 즉시결제라 '24시간 미입금 자동취소' 동의가 불필요하다.
  const isPg = PG_READY && paymentMethod !== "bank_transfer";
  const requiredAgreementsOk = isPg
    ? agreementOrder && agreementRefund
    : agreementOrder && agreementPayment && agreementRefund;
  // 토스 결제위젯 인스턴스 + 준비/오류 상태
  const tossWidgetsRef = useRef(null);
  const tossInitStartedRef = useRef(false); // 동시/재진입 init 동기 차단
  const pricingRef = useRef(null); // 최신 금액 입력 (init이 deps 없이 읽도록)
  const [tossWidgetReady, setTossWidgetReady] = useState(false);
  const [tossLoadError, setTossLoadError] = useState(false);
  const inFlightRef = useRef(false); // 더블 클릭으로 RPC 두 번 발사 방지 (state 비동기 보완)
  const [toast, setToast] = useState(null);
  // 쿠폰
  const [applicableCoupons, setApplicableCoupons] = useState([]);
  const [selectedCouponId, setSelectedCouponId] = useState(null);
  const [isCouponPickerOpen, setIsCouponPickerOpen] = useState(false);
  // 포인트 (2026-09-02) — 잔액은 서버 조회, 사용액은 입력. 실제 검증·차감은 create_order/finalize.
  const [pointBalance, setPointBalance] = useState(0);
  const [pointsToUse, setPointsToUse] = useState(0);

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── GA4 계측 공용 ───────────────────────────────────────────────────────────
  // 결제 여정 이벤트에 항상 얹는 컨텍스트: 회원/비회원 구분 + 토스 심사 모드 세션 여부.
  const checkoutContext = useCallback(
    () => ({
      checkoutType: isGuestCheckout ? "guest" : "member",
      ...(PG_OVERRIDE ? { pgReviewMode: true } : {}),
    }),
    [isGuestCheckout],
  );

  // 금액 파생값(소계·배송비·쿠폰·포인트)은 렌더 하단에서 계산되므로, effect·핸들러에서
  // 쓰려면 화면과 같은 공식으로 다시 계산한다(계측 전용 스냅샷 — 결제 금액은 서버가 확정).
  const analyticsPricing = useCallback(() => {
    const items = orderItems || [];
    const subtotalNow = items.reduce((sum, i) => sum + (i.price ?? 0) * (i.quantity ?? 1), 0);
    const coupon = applicableCoupons.find((c) => c.id === selectedCouponId) ?? null;
    const preview = previewCouponDiscount(coupon, subtotalNow, calculateShippingFee(subtotalNow));
    const surcharge = getRemoteAreaInfo(shipping.postalCode)?.surcharge ?? 0;
    const maxPoints = isGuestCheckout
      ? 0
      : computeMaxUsablePoints({
          balance: pointBalance,
          subtotal: subtotalNow,
          couponDiscount: preview.subtotalDiscount,
        });
    const points = Math.min(Math.max(0, pointsToUse), maxPoints);
    return {
      subtotal: subtotalNow,
      couponDiscount: preview.subtotalDiscount,
      shippingFee: preview.shippingFeeAfter + surcharge,
      maxUsablePoints: maxPoints,
      points,
      total: Math.max(
        0,
        subtotalNow + preview.shippingFeeAfter + surcharge - preview.subtotalDiscount - points,
      ),
    };
  }, [
    orderItems,
    applicableCoupons,
    selectedCouponId,
    shipping.postalCode,
    isGuestCheckout,
    pointBalance,
    pointsToUse,
  ]);

  const submitAttemptRef = useRef(0); // 결제하기 시도 횟수 (attempt_index)
  const impressionGuardRef = useRef(makeOnceGuard()); // 노출 계열 1회 가드
  const formProgressGuardRef = useRef(makeOnceGuard()); // 배송 필드 최초 입력 1회 가드
  const refundFieldGuardRef = useRef(makeOnceGuard()); // 환불계좌 필드 최초 입력 1회 가드

  // 계좌번호 복사 ('-' 제거한 숫자만 → 은행 앱에 바로 붙여넣기 편하게)
  const handleCopyAccount = async () => {
    const plain = BANK_ACCOUNT.replace(/-/g, "");
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(plain);
      } else {
        const t = document.createElement("textarea");
        t.value = plain;
        document.body.appendChild(t);
        t.select();
        document.execCommand("copy");
        t.remove();
      }
      showToast("계좌번호를 복사했어요.");
      // GA4 copy_click — 무엇을 복사했는지만 (계좌번호 값은 절대 보내지 않는다)
      trackCopyClick("bank_account", "order_form", "ok");
    } catch {
      showToast("복사에 실패했어요. 길게 눌러 복사해 주세요.", "error");
      trackCopyClick("bank_account", "order_form", "fail");
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated && !isGuestMode) {
      navigate("/login", { state: { from: { pathname: "/order" } } });
      return;
    }
    // 진입 자체가 빈손일 때만 카트로 돌려보낸다. drift/품절로 전 품목이 빠진
    // 경우는 본문에서 사유를 보여주고 사용자가 직접 돌아가게 한다(사유 없이 튕기지 않도록).
    if (!initialOrderItems || initialOrderItems.length === 0) {
      navigate(isGuestMode && !isAuthenticated ? "/" : "/cart");
      return;
    }
  }, [authLoading, isAuthenticated, isGuestMode, navigate, initialOrderItems]);

  // GA4 begin_checkout — 주문서 진입 1회 (진입 스냅샷 기준, drift 재검증 전)
  const beginCheckoutTrackedRef = useRef(false);
  useEffect(() => {
    if (beginCheckoutTrackedRef.current) return;
    if (authLoading || (!isAuthenticated && !isGuestMode)) return;
    if (!orderItems || orderItems.length === 0) return;
    beginCheckoutTrackedRef.current = true;
    trackBeginCheckout(orderItems.map(toAnalyticsLine), checkoutContext());
  }, [authLoading, isAuthenticated, isGuestMode, orderItems, checkoutContext]);

  // 가격 drift 검증: 진입 시 books 테이블에서 fresh 가격·status를 조회해 표시 금액을 동기화한다.
  // initialOrderItems가 바뀔 때만 한 번 fetch (재실행 방지).
  useEffect(() => {
    if ((!isAuthenticated && !isGuestMode) || !initialOrderItems || initialOrderItems.length === 0) return;
    let cancelled = false;
    (async () => {
      const bookIds = initialOrderItems
        .map((item) => item.bookId)
        .filter((id) => id !== null && id !== undefined);
      if (bookIds.length === 0) return;

      // ⚠ books 테이블은 RLS로 admin만 select 가능 — security definer RPC를 통해 우회.
      // 직접 .from("books").select()를 호출하면 0 row가 돌아와 모든 책이 unavailable로
      // 잡혀 /cart로 무한 redirect되는 버그가 있었음 (2026-05-25 발견).
      const { data, error } = await publicSupabase.rpc("get_books_pricing_for_order", {
        p_book_ids: bookIds,
      });
      if (cancelled) return;
      if (error || !Array.isArray(data)) {
        // GA4 checkout_price_drift — 진입 재검증이 만든 이탈 원인(조회 실패)
        trackEvent("checkout_price_drift", {
          driftType: "fetch_failed",
          itemCount: initialOrderItems.length,
          ...checkoutContext(),
        });
        // 검증 실패를 "변동 없음"으로 침묵 처리하면 표시 금액 ≠ 청구 금액이 될 수 있다.
        // 결제는 서버가 books.price 기준으로 재계산하므로 막지는 않되, 명시적으로 경고.
        setPriceDriftWarning(
          "최신 가격 정보를 확인하지 못했습니다. 표시 금액이 실제 결제 금액과 다를 수 있으니 새로고침 후 다시 확인해 주세요.",
        );
        return;
      }

      const freshMap = new Map(data.map((row) => [String(row.id), row]));
      const drifts = [];
      const unavailable = [];
      const merged = initialOrderItems.map((item) => {
        const fresh = freshMap.get(String(item.bookId));
        if (!fresh) {
          unavailable.push(item.title || "교재");
          return { ...item, _unavailable: true };
        }
        if (fresh.status !== "on_sale" || !fresh.is_public) {
          unavailable.push(item.title || "교재");
          return { ...item, _unavailable: true };
        }
        if (Number(fresh.price) !== Number(item.price)) {
          drifts.push({ title: item.title, oldPrice: item.price, newPrice: fresh.price });
          return { ...item, price: fresh.price };
        }
        return item;
      });
      setOrderItems(merged.filter((item) => !item._unavailable));
      if (unavailable.length > 0) {
        // GA4 checkout_price_drift — 품절·비공개로 주문에서 빠진 품목 수
        trackEvent("checkout_price_drift", {
          driftType: "unavailable",
          itemCount: unavailable.length,
          ...checkoutContext(),
        });
        setPriceDriftWarning(
          `이미 판매되었거나 비공개된 교재가 ${unavailable.length}건 있어 주문에서 제외했습니다: ${unavailable.join(", ")}`,
        );
      } else if (drifts.length > 0) {
        // GA4 checkout_price_drift — 표시 금액이 바뀐 품목 수(가격 신뢰도 이슈)
        trackEvent("checkout_price_drift", {
          driftType: "price_changed",
          itemCount: drifts.length,
          ...checkoutContext(),
        });
        const lines = drifts.map(
          (d) =>
            `${d.title}: ${d.oldPrice?.toLocaleString() ?? "?"}원 → ${d.newPrice?.toLocaleString() ?? "?"}원`,
        );
        setPriceDriftWarning(`가격이 변동되었습니다.\n${lines.join("\n")}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isGuestMode, initialOrderItems, checkoutContext]);

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      const snapshot = await loadMemberPortalSnapshot({ user, profile });
      const addresses = snapshot.shippingAddresses ?? [];
      setSavedAddresses(addresses);

      const defaultAddr = addresses.find((a) => a.is_default) ?? addresses[0];
      if (defaultAddr) {
        setSelectedAddressId(defaultAddr.id);
        setShipping({
          recipientName: defaultAddr.recipient_name ?? "",
          recipientPhone: defaultAddr.recipient_phone ?? "",
          postalCode: defaultAddr.postal_code ?? "",
          addressLine1: defaultAddr.address_line1 ?? "",
          addressLine2: defaultAddr.address_line2 ?? "",
          memo: defaultAddr.delivery_memo ?? "",
        });
      } else {
        const meta = user.user_metadata ?? {};
        setShipping((prev) => ({
          ...prev,
          recipientName: meta.name ?? profile?.name ?? "",
          recipientPhone: meta.phone ?? profile?.phone ?? "",
        }));
      }
    };

    void loadData();
  }, [user, profile]);

  // 적용 가능한 쿠폰 fetch (subtotal 기반)
  useEffect(() => {
    if (!user || !orderItems || orderItems.length === 0) return;
    const subtotalForFetch = orderItems.reduce(
      (sum, i) => sum + (i.price ?? 0) * i.quantity,
      0,
    );
    const loadCoupons = async () => {
      const { data, error } = await publicSupabase.rpc("get_applicable_coupons", {
        p_subtotal: subtotalForFetch,
        // 브랜드 한정 쿠폰(scope_brand) 적용 판정용 — 서버가 품목 브랜드 소계로 필터
        p_book_ids: orderItems.map((i) => i.bookId).filter(Boolean),
      });
      if (!error && Array.isArray(data)) {
        setApplicableCoupons(data);
        // GA4 coupon_availability — 이 장바구니 구성에서 쓸 수 있는 쿠폰이 몇 장인지 1회.
        // (0장이면 UI에서 쿠폰 row 자체가 숨겨져 "왜 안 썼나"를 화면만으로는 알 수 없다)
        if (impressionGuardRef.current(`coupon_availability:${subtotalForFetch}:${orderItems.length}`)) {
          trackEvent("coupon_availability", {
            availableCount: data.length,
            subtotal: subtotalForFetch,
            ...checkoutContext(),
          });
        }
      }
    };
    void loadCoupons();
  }, [user, orderItems, checkoutContext]);

  // 포인트 잔액 — 회원만 (게스트 주문은 사용 불가)
  useEffect(() => {
    if (!user || isGuestCheckout) {
      setPointBalance(0);
      setPointsToUse(0);
      return undefined;
    }
    let cancelled = false;
    void fetchMyPoints({ limit: 1 }).then((result) => {
      if (!cancelled) {
        setPointBalance(result.points.balance);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, isGuestCheckout]);

  // pricingRef를 최신 상태로 유지 — init effect가 deps 없이 초기 금액을 읽기 위함.
  useEffect(() => {
    pricingRef.current = { orderItems, applicableCoupons, selectedCouponId, pointsToUse, pointBalance };
  }, [orderItems, applicableCoupons, selectedCouponId, pointsToUse, pointBalance]);

  // ── 토스 결제위젯 초기화 — user 준비 시 "딱 1회"만 ───────────────────────────
  // ⚠ deps에 orderItems/쿠폰을 넣으면 마운트 직후 값이 바뀌며 effect가 재실행되어
  //   async init이 경쟁(double render)하고 "결제 모듈을 불러오지 못했어요" 오류가 났다.
  //   금액 동기화는 아래 sync effect가 전담. init은 user에만 의존 + 동기 가드로 재진입 차단.
  useEffect(() => {
    if (PG_PROVIDER !== "toss" || tossInitStartedRef.current) return;
    // 회원은 uid가 준비된 뒤 열고, 비회원(게스트 주문)은 ANONYMOUS로 바로 연다.
    if (!user?.id && !isGuestCheckout) return;
    tossInitStartedRef.current = true;
    setTossLoadError(false);
    (async () => {
      try {
        const { loadTossPayments, ANONYMOUS } = await import("@tosspayments/tosspayments-sdk");
        const toss = await loadTossPayments(ACTIVE_TOSS_CLIENT_KEY);
        const widgets = toss.widgets({ customerKey: user?.id || ANONYMOUS });
        const p = pricingRef.current || {};
        // setAmount는 render보다 먼저 호출해야 한다. 정확한 금액은 sync effect가 유지.
        await widgets.setAmount({
          currency: "KRW",
          value: computePayableTotal(p.orderItems, p.applicableCoupons, p.selectedCouponId, p.pointsToUse, p.pointBalance),
        });
        await Promise.all([
          widgets.renderPaymentMethods({ selector: "#toss-payment-method", variantKey: "DEFAULT" }),
          widgets.renderAgreement({ selector: "#toss-agreement", variantKey: "AGREEMENT" }),
        ]);
        tossWidgetsRef.current = widgets;
        setTossWidgetReady(true);
      } catch (err) {
        tossInitStartedRef.current = false; // 다음 렌더에서 재시도 허용
        setTossLoadError(true);
        // GA4 checkout_error — 위젯 초기화 실패는 결제 버튼 자체가 잠기는 치명 구간
        trackCheckoutError("pg_widget_init", err?.message, {
          pgProvider: "toss",
          ...checkoutContext(),
        });
        if (typeof window !== "undefined" && window.console) {
          window.console.warn("[toss] 결제위젯 초기화 실패", err);
        }
      }
    })();
  }, [user, isGuestCheckout, checkoutContext]);

  // 금액(쿠폰/배송비) 변동 시 결제위젯 금액 동기화
  useEffect(() => {
    if (!tossWidgetReady || !tossWidgetsRef.current) return;
    tossWidgetsRef.current.setAmount({
      currency: "KRW",
      value: computePayableTotal(orderItems, applicableCoupons, selectedCouponId, pointsToUse, pointBalance),
    });
  }, [tossWidgetReady, orderItems, applicableCoupons, selectedCouponId, pointsToUse, pointBalance]);

  // ── 나이스페이 SDK 사전 로드 — 제출 시점 지연을 줄인다 (실패해도 제출 시 재시도) ──
  useEffect(() => {
    if (PG_PROVIDER !== "nicepay") return;
    loadNicepaySdk().catch(() => {});
  }, []);

  // ── GA4 노출 계측 (렌더 중이 아니라 effect에서, 값별 1회) ────────────────────

  // 주문 가능한 품목이 0이 된 막다른 화면 — drift/품절이 만든 결제 불가 이탈
  useEffect(() => {
    if (!initialOrderItems || initialOrderItems.length === 0) return;
    if (orderItems && orderItems.length > 0) return;
    if (!impressionGuardRef.current("checkout_blocked_empty")) return;
    trackEvent("checkout_blocked_empty", {
      itemCount: initialOrderItems.length,
      ...checkoutContext(),
    });
  }, [initialOrderItems, orderItems, checkoutContext]);

  // 무통장 안내 블록 + 환불계좌 폼 노출 (결제 수단을 계좌이체로 둔 사용자 수)
  useEffect(() => {
    if (paymentMethod !== "bank_transfer") return;
    if (impressionGuardRef.current("bank_info_shown")) {
      trackEvent("bank_info_shown", {
        uiSurface: "order_form",
        value: analyticsPricing().total,
        ...checkoutContext(),
      });
    }
    if (impressionGuardRef.current("refund_account_form_shown")) {
      trackEvent("refund_account_form_shown", { ...checkoutContext() });
    }
  }, [paymentMethod, analyticsPricing, checkoutContext]);

  // 도서산간 추가 배송비 안내 — 지역 라벨 단위 1회 (주소 변경 때마다 재발화 방지)
  useEffect(() => {
    const info = getRemoteAreaInfo(shipping.postalCode);
    if (!info) return;
    if (!impressionGuardRef.current(`remote_area:${info.label}`)) return;
    trackEvent("remote_area_fee_shown", {
      region: info.label,
      surcharge: info.surcharge,
      ...checkoutContext(),
    });
  }, [shipping.postalCode, checkoutContext]);

  // "N원 더 담으면 무료배송" 힌트 노출 — 배송비를 남긴 채 결제로 가는 비율 분모
  useEffect(() => {
    const pricing = analyticsPricing();
    if (pricing.subtotal <= 0) return;
    if (pricing.shippingFee - (getRemoteAreaInfo(shipping.postalCode)?.surcharge ?? 0) <= 0) return;
    if (!impressionGuardRef.current("free_shipping_hint")) return;
    trackEvent("free_shipping_hint_view", {
      gapAmount: Math.max(0, FREE_SHIPPING_THRESHOLD - pricing.subtotal),
      ...checkoutContext(),
    });
  }, [analyticsPricing, shipping.postalCode, checkoutContext]);

  // 포인트 블록 노출 / 사용 불가 사유 — 적립은 됐는데 못 쓰는 구간을 분리해 본다
  useEffect(() => {
    if (isGuestCheckout || pointBalance <= 0) return;
    const pricing = analyticsPricing();
    if (impressionGuardRef.current("points_section_shown")) {
      trackEvent("points_section_shown", {
        balance: pointBalance,
        maxUsable: pricing.maxUsablePoints,
        ...checkoutContext(),
      });
    }
    if (pricing.maxUsablePoints > 0) return;
    const reason = getPointsUnavailableReason({ balance: pointBalance, subtotal: pricing.subtotal });
    if (!reason) return;
    if (!impressionGuardRef.current(`points_unavailable:${reason}`)) return;
    trackEvent("points_unavailable", {
      reason,
      balance: pointBalance,
      ...checkoutContext(),
    });
  }, [isGuestCheckout, pointBalance, analyticsPricing, checkoutContext]);

  // 포인트 입력 — 키 입력마다 보내지 않도록 800ms 디바운스 후 적용/해제만 1건씩.
  const pointsTrackedValueRef = useRef(0);
  const pointsInputMethodRef = useRef("manual"); // manual(직접 입력) / max(전액 사용 버튼)
  useEffect(() => {
    if (isGuestCheckout) return undefined;
    if (pointsToUse === pointsTrackedValueRef.current) return undefined;
    const timer = window.setTimeout(() => {
      const previous = pointsTrackedValueRef.current;
      pointsTrackedValueRef.current = pointsToUse;
      if (pointsToUse <= 0) {
        if (previous > 0) {
          trackEvent("points_clear", { balance: pointBalance, ...checkoutContext() });
        }
        return;
      }
      trackEvent("points_apply", {
        inputMethod: pointsInputMethodRef.current,
        pointsAmount: pointsToUse,
        balance: pointBalance,
        maxUsable: analyticsPricing().maxUsablePoints,
        ...checkoutContext(),
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [pointsToUse, isGuestCheckout, pointBalance, analyticsPricing, checkoutContext]);

  const handleSelectAddress = (addr) => {
    setSelectedAddressId(addr.id);
    setShipping({
      recipientName: addr.recipient_name ?? "",
      recipientPhone: addr.recipient_phone ?? "",
      postalCode: addr.postal_code ?? "",
      addressLine1: addr.address_line1 ?? "",
      addressLine2: addr.address_line2 ?? "",
      memo: addr.delivery_memo ?? "",
    });
  };

  // 주소록 모달에서 새 주소 저장 후 — 목록 갱신 + 방금 저장한 주소 자동 선택
  const refreshAddressesAndSelect = async (savedValues) => {
    const snapshot = await loadMemberPortalSnapshot({ user, profile });
    const addresses = snapshot.shippingAddresses ?? [];
    setSavedAddresses(addresses);
    const match = savedValues
      ? addresses
          .slice()
          .sort((a, b) => Number(b.id) - Number(a.id))
          .find(
            (a) =>
              a.postal_code === savedValues.postal_code &&
              a.address_line1 === savedValues.address_line1 &&
              a.recipient_name === savedValues.recipient_name,
          )
      : null;
    const next = match ?? addresses.find((a) => a.is_default) ?? addresses[0];
    if (next) {
      handleSelectAddress(next);
    }
  };

  const handleSearchAddress = async () => {
    // GA4 address_search_open — 주소 검색 진입(주소 단계 이탈 진단의 분모)
    trackEvent("address_search_open", { uiSurface: "order_form", ...checkoutContext() });
    try {
      await loadDaumPostcode();
    } catch (err) {
      // GA4 checkout_error — 우편번호 스크립트 로드 실패(광고차단·네트워크)
      trackCheckoutError("address_script", err?.message, {
        uiSurface: "order_form",
        ...checkoutContext(),
      });
      showToast(err?.message || "주소 검색을 불러오지 못했습니다.", "error");
      return;
    }

    if (!window.daum?.Postcode) {
      trackCheckoutError("address_script", "postcode_unavailable", {
        uiSurface: "order_form",
        ...checkoutContext(),
      });
      showToast("주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
      return;
    }

    new window.daum.Postcode({
      oncomplete: (data) => {
        // GA4 address_search_complete — 주소 원문 없이 도서산간 여부만 남긴다
        trackEvent("address_search_complete", {
          uiSurface: "order_form",
          isRemoteArea: Boolean(getRemoteAreaInfo(data.zonecode)),
          ...checkoutContext(),
        });
        setShipping((prev) => ({
          ...prev,
          postalCode: data.zonecode,
          addressLine1: data.roadAddress || data.jibunAddress,
        }));
        setSelectedAddressId(null);
      },
    }).open();
  };

  // GA4 form_progress — 배송 필드 최초 입력 완료(blur 시 값 있음)를 필드별 1회.
  // 어느 칸에서 멈추는지(퍼널 감사 요청)를 보기 위한 것이라 값은 절대 보내지 않는다.
  const handleShippingFieldBlur = (fieldName) => (event) => {
    if (!event.target.value.trim()) return;
    if (!formProgressGuardRef.current(fieldName)) return;
    trackFormProgress("checkout", fieldName, checkoutContext());
  };

  // GA4 refund_account_filled — 환불계좌 칸을 실제로 채웠는지만 필드별 1회.
  // 계좌번호·예금주 값은 어떤 형태로도 보내지 않는다.
  const handleRefundFieldBlur = (fieldName) => (event) => {
    if (!event.target.value.trim()) return;
    if (!refundFieldGuardRef.current(fieldName)) return;
    trackEvent("refund_account_filled", { fieldName, ...checkoutContext() });
  };

  // GA4 payment_method_select용 라벨 — add_payment_info와 같은 어휘로 맞춘다.
  const toPaymentTypeLabel = (methodId) =>
    methodId === "bank_transfer"
      ? "bank_transfer"
      : PG_PROVIDER === "nicepay"
        ? "card_nicepay"
        : PG_PROVIDER === "toss"
          ? "card_toss"
          : methodId;

  const handlePaymentSelect = (methodId) => {
    if (PG_READY) {
      // PG 활성 시: 'card'(나이스페이 결제창/토스 결제위젯)와 'bank_transfer'(계좌이체) 둘 다 선택 가능
      // GA4 payment_method_select — 수단 선택 자체(제출 전)의 분포와 전환
      trackPaymentMethodSelect(toPaymentTypeLabel(methodId), {
        previousMethod: toPaymentTypeLabel(paymentMethod),
        ...checkoutContext(),
      });
      setPaymentMethod(methodId);
      return;
    }
    const method = PAYMENT_METHODS.find((m) => m.id === methodId);
    if (!method?.available) {
      // P1-8: 비활성 결제 수단 클릭 시 사용자가 "왜 안 되지" 멈추지 않게 명시
      showToast("사업자 등록 완료 후 오픈 예정입니다.", "info");
      return;
    }
    trackPaymentMethodSelect(toPaymentTypeLabel(methodId), {
      previousMethod: toPaymentTypeLabel(paymentMethod),
      ...checkoutContext(),
    });
    setPaymentMethod(methodId);
  };

  // 반환값: null(통과) 또는 { field, message }.
  // field는 GA4 checkout_error(error_field)용 기계 판독 코드, message는 사용자 토스트 문구
  // (문구·검증 순서는 기존과 동일 — 계측을 위해 반환 형태만 바뀌었다).
  const validate = () => {
    if (!shipping.recipientName.trim()) {
      return { field: "recipient_name", message: "수령인 이름을 입력해주세요." };
    }
    if (!shipping.recipientPhone.trim()) {
      return { field: "recipient_phone", message: "수령인 연락처를 입력해주세요." };
    }
    // 배송 안내 SMS·알림톡 발송 대상이므로 휴대폰 형식을 검증한다(수거요청 페이지와 동일 기준).
    if (!isValidKoreanMobile(shipping.recipientPhone)) {
      return {
        field: "phone_format",
        message: "휴대폰 번호를 정확히 입력해주세요. (예: 010-1234-5678)",
      };
    }
    if (!shipping.postalCode.trim() || !shipping.addressLine1.trim()) {
      return { field: "address", message: "배송지 주소를 입력해주세요." };
    }
    if (!agreementOrder) {
      return {
        field: "agreement_order",
        message: "[필수] 주문 내용 확인 및 개인정보 수집·이용 동의에 체크해주세요.",
      };
    }
    if (!isPg && !agreementPayment) {
      return {
        field: "agreement_payment",
        message: "[필수] 미입금 시 주문 자동 취소 동의에 체크해주세요.",
      };
    }
    if (!agreementRefund) {
      return {
        field: "agreement_refund",
        message: "[필수] 환불·교환 정책 확인 동의에 체크해주세요.",
      };
    }
    // 무통장입금은 환불계좌를 주문 시점에 필수 수집 (2026-07-12 정책 — 환불 시 계좌 확인 지연 방지)
    if (!isPg) {
      if (!refundAccount.bank.trim()) {
        return { field: "refund_bank", message: "환불받을 계좌의 은행을 선택해주세요." };
      }
      if (refundAccount.number.replace(/[^0-9]/g, "").length < 6) {
        return {
          field: "refund_account_number",
          message: "환불받을 계좌번호를 정확히 입력해주세요.",
        };
      }
      if (!refundAccount.holder.trim()) {
        return { field: "refund_account_holder", message: "환불받을 계좌의 예금주를 입력해주세요." };
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    // 동기 ref 가드: 빠른 더블 클릭 시 첫 호출이 끝나기 전 두 번째 클릭 차단.
    // setState는 비동기라 isSubmitting state로는 race를 못 막는다.
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    // 제출 시도 횟수 — 검증 실패로 되돌아온 재시도까지 센다(몇 번 만에 통과하는지).
    submitAttemptRef.current += 1;
    const attemptIndex = submitAttemptRef.current;
    const paymentTypeLabel =
      isPg && PG_PROVIDER === "nicepay" ? "card_nicepay" : isPg ? "card_toss" : "bank_transfer";

    // GA4 checkout_submit_click — 결제하기를 실제로 누른 횟수(검증 통과 전 분모)
    trackEvent("checkout_submit_click", {
      paymentType: paymentTypeLabel,
      value: totalAmount,
      attemptIndex,
      couponApplied: Boolean(selectedCoupon),
      pointsUsed: isGuestCheckout ? 0 : effectivePoints,
      ...checkoutContext(),
    });

    const validationError = validate();
    if (validationError) {
      // GA4 checkout_error — 제출 시도가 검증에서 막힌 지점 (미입력 필드·동의 누락 분포)
      trackCheckoutError("validation", validationError.message, {
        errorField: validationError.field,
        attemptIndex,
        ...checkoutContext(),
      });
      showToast(validationError.message, "error");
      inFlightRef.current = false;
      return;
    }

    // GA4 add_shipping_info + add_payment_info — 검증 통과 = 배송지·결제수단이 확정 제출된
    // 시점. purchase와의 격차가 결제창 이탈·승인 실패·입금 포기 구간이 된다.
    const analyticsLines = orderItems.map(toAnalyticsLine);
    trackAddShippingInfo({
      lines: analyticsLines,
      shippingTier: remoteAreaInfo
        ? "도서산간"
        : shippingFee === 0
          ? "무료배송"
          : "일반",
      attemptIndex,
      ...checkoutContext(),
    });
    trackAddPaymentInfo({
      lines: analyticsLines,
      paymentType: paymentTypeLabel,
      coupon: selectedCoupon?.title,
      attemptIndex,
      ...checkoutContext(),
    });

    setIsSubmitting(true);
    const bookIds = orderItems.map((i) => i.bookId);
    const quantities = orderItems.map((i) => i.quantity);

    // 카드(나이스페이)는 주문을 먼저 만들지 않는다 — 결제 세션(재고 미선점)만 만들어
    // 결제창을 열고, 주문은 카드 인증 성공 후 서버(nicepay-return)가 생성한다.
    // 결제창에서 이탈해도 입금대기 주문·재고 선점이 남지 않고 장바구니도 유지된다.
    // (2026-08-03 — 이탈 시 책이 30분간 품절로 잠기던 문제의 근본 수리)
    const isNicepayCard = isPg && PG_PROVIDER === "nicepay";
    const orderArgs = {
      bookIds,
      quantities,
      shippingRecipientName: shipping.recipientName.trim(),
      shippingRecipientPhone: shipping.recipientPhone.trim(),
      shippingPostalCode: shipping.postalCode.trim(),
      shippingAddressLine1: shipping.addressLine1.trim(),
      shippingAddressLine2: shipping.addressLine2.trim() || null,
      shippingMemo: shipping.memo.trim() || null,
      paymentMethod,
      memberCouponId: selectedCouponId,
      // 포인트 사용액 — 서버가 잔액·상한을 재검증 (게스트 0)
      pointsAmount: isGuestCheckout ? 0 : effectivePoints,
    };

    // 비회원은 전용 anon RPC로 — 쿠폰 없음 + 약관 동의를 서버에 명시 전달(동의 시각 기록).
    // requiredAgreementsOk는 validate()를 통과한 시점이라 항상 true지만, 서버 계약을
    // 명시하기 위해 값 그대로 넘긴다.
    const { data, error } = isNicepayCard
      ? isGuestCheckout
        ? await createGuestPgCheckoutSession({ ...orderArgs, agreeTerms: requiredAgreementsOk })
        : await createPgCheckoutSession(orderArgs)
      : isGuestCheckout
        ? await createGuestOrder({
            ...orderArgs,
            refundBank: refundAccount.bank.trim() || null,
            refundAccountNumber: refundAccount.number.replace(/[^0-9]/g, "") || null,
            refundAccountHolder: refundAccount.holder.trim() || null,
            agreeTerms: requiredAgreementsOk,
          })
        : await createOrder({
            ...orderArgs,
            // 무통장입금일 때만 환불 계좌 전달 (PG 결제는 원결제수단으로 자동 환불).
            refundBank: paymentMethod === "bank_transfer" ? refundAccount.bank.trim() || null : null,
            refundAccountNumber:
              paymentMethod === "bank_transfer" ? refundAccount.number.replace(/[^0-9]/g, "") || null : null,
            refundAccountHolder:
              paymentMethod === "bank_transfer" ? refundAccount.holder.trim() || null : null,
          });

    if (error) {
      // GA4 checkout_error — 주문/세션 RPC 실패 (재고 선점 경합·쿠폰 무효 등 서버 거절 분포)
      trackCheckoutError(isNicepayCard ? "checkout_session" : "create_order", error.message, {
        paymentType: paymentTypeLabel,
        attemptIndex,
        ...checkoutContext(),
      });
      setIsSubmitting(false);
      showToast(toFriendlyOrderError(error), "error");
      inFlightRef.current = false;
      return;
    }

    // 주소록이 비어 있으면 이번 배송지를 기본 배송지로 자동 등록 (2026-07-12 정책).
    // best-effort — 실패해도 주문 흐름에는 영향 없음. 게스트는 주소록이 없다.
    if (!isGuestCheckout && savedAddresses.length === 0) {
      void saveMemberShippingAddress({
        user,
        values: {
          id: null,
          label: "",
          recipient_name: shipping.recipientName.trim(),
          recipient_phone: shipping.recipientPhone.trim(),
          postal_code: shipping.postalCode.trim(),
          address_line1: shipping.addressLine1.trim(),
          address_line2: shipping.addressLine2.trim(),
          delivery_memo: "",
        },
        shouldMakeDefault: true,
      });
    }

    // PG(나이스페이): 결제 세션 번호(order_number)와 서버 확정 금액으로 결제창 호출.
    // 카드 인증이 끝나면 나이스페이가 returnUrl(/api/payments/nicepay-return)로 POST →
    // 서버가 주문 생성(finalize) → 승인 → 주문완료로 리다이렉트.
    if (isNicepayCard) {
      // GA4 pg_session_created — 결제 세션 RPC 성공(결제창 호출 직전). 이후 purchase와의
      // 격차가 "결제창까지 갔다가 이탈" 구간이 된다.
      trackEvent("pg_session_created", {
        value: data.total_amount,
        itemCount: orderItems.length,
        pgProvider: "nicepay",
        attemptIndex,
        ...checkoutContext(),
      });
      // 게스트: 결제창 복귀(서버 303) 후 완료 페이지가 세션 없이도 주문을 보여줄 수 있게
      // 주문번호+휴대폰을 sessionStorage에 보관 (조회 RPC의 2요소 키와 동일).
      if (isGuestCheckout) {
        stashGuestOrderRef({
          orderNumber: data.order_number,
          phone: shipping.recipientPhone.trim(),
        });
      }
      try {
        await loadNicepaySdk();
        requestNicepayCardPay({
          orderNumber: data.order_number,
          // 서버가 확정한 금액으로 결제창을 열어 청구금액 = 주문금액을 보장.
          amount: data.total_amount,
          goodsName: buildNicepayGoodsName(orderItems),
          buyerName: shipping.recipientName.trim() || undefined,
          buyerTel: shipping.recipientPhone.replace(/\D/g, "") || undefined,
          buyerEmail: user?.email || undefined,
          onError: (result) => {
            trackCheckoutError("pg_open", result?.errorMsg, {
              pgProvider: "nicepay",
              ...checkoutContext(),
            });
            showToast(
              result?.errorMsg || "결제를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.",
              "error",
            );
          },
        });
        // GA4 pg_open — 결제창 호출이 예외 없이 시작됨. 결제창을 닫는 이탈은 콜백이 없어
        // pg_open − purchase 격차로만 관찰된다(나이스페이 SDK 한계).
        trackEvent("pg_open", {
          value: data.total_amount,
          pgProvider: "nicepay",
          attemptIndex,
          ...checkoutContext(),
        });
      } catch (err) {
        trackCheckoutError("pg_open", err?.message, {
          pgProvider: "nicepay",
          ...checkoutContext(),
        });
        const msg =
          err?.message && /[가-힣]/.test(err.message)
            ? err.message
            : "결제를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.";
        showToast(msg, "error");
      } finally {
        // PC 레이어 결제창은 사용자가 닫아도 콜백이 없다 — 버튼을 되살려 재시도를
        // 허용한다. 주문은 아직 만들어지지 않았으므로(세션만 존재) 이탈해도
        // 입금대기·재고 선점이 남지 않고 장바구니도 그대로다.
        setIsSubmitting(false);
        inFlightRef.current = false;
      }
      return;
    }

    // PG(토스): 주문(pending) 생성 후 토스 결제위젯 호출. 성공 시 토스가 successUrl로 리다이렉트.
    if (isPg) {
      try {
        const widgets = tossWidgetsRef.current;
        if (!widgets) throw new Error("결제 모듈이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.");
        // 서버가 확정한 금액으로 한 번 더 맞춰 청구금액 = 주문금액을 보장.
        await widgets.setAmount({ currency: "KRW", value: data.total_amount });
        await widgets.requestPayment({
          orderId: data.order_number,
          orderName: buildOrderName(orderItems),
          successUrl: `${window.location.origin}/order/payment/success`,
          failUrl: `${window.location.origin}/order/payment/fail`,
          customerName: shipping.recipientName.trim() || undefined,
          customerMobilePhone: shipping.recipientPhone.replace(/\D/g, "") || undefined,
        });
        // 리다이렉트되므로 이후 코드는 실행되지 않는다.
      } catch (err) {
        // 사용자가 결제창을 닫았거나 실패. 주문(pending)은 24시간 후 자동 취소된다.
        trackCheckoutError("pg_widget", err?.message, {
          pgProvider: "toss",
          attemptIndex,
          ...checkoutContext(),
        });
        setIsSubmitting(false);
        inFlightRef.current = false;
        const msg =
          err?.message && /[가-힣]/.test(err.message)
            ? err.message
            : "결제가 취소되었거나 완료되지 않았습니다. 다시 시도해 주세요.";
        showToast(msg, "info");
      }
      return;
    }

    // purchase 계측(GA4+Meta) — 무통장: 주문 생성 시점(입금 확인 전), 금액은 서버 확정값.
    // 카드(PG) 경로는 여기 도달하지 않고 주문완료 페이지(OrderCompletePage)에서 발화한다.
    trackPurchase({
      transactionId: data.order_number ?? String(data.order_id),
      value: data.total_amount,
      shipping: shippingFee,
      items: orderItems.map(toAnalyticsLine),
      coupon: selectedCoupon?.title,
      paymentType: "bank_transfer",
      discountAmount: couponDiscount,
      pointsUsed: isGuestCheckout ? 0 : effectivePoints,
      ...checkoutContext(),
    });

    // 게스트 무통장: 새로고침·재방문 시 완료 페이지가 RLS 대신 조회 RPC로 복원하도록 보관
    if (isGuestCheckout) {
      stashGuestOrderRef({
        orderNumber: data.order_number,
        phone: shipping.recipientPhone.trim(),
      });
    }

    setIsSubmitting(false);
    navigate(`/order/complete/${data.order_id}`, {
      state: {
        orderNumber: data.order_number,
        totalAmount: data.total_amount,
        itemCount: orderItems.reduce((sum, i) => sum + (i.quantity ?? 1), 0),
        recipientName: shipping.recipientName,
        paymentMethod, // 완료 페이지 카피·입금안내 분기 (무통장 vs 카드)
        createdAt: new Date().toISOString(), // 게스트 입금 카운트다운용 (회원은 RPC 재조회가 덮어씀)
        guest: isGuestCheckout, // 완료 페이지 CTA 분기 (마이페이지 vs 비회원 주문조회)
      },
      replace: true,
    });
  };

  if (!orderItems || orderItems.length === 0) {
    // 빈손 진입이면 위 effect가 /cart로 보내는 중 → 깜빡임 방지 null.
    // 진입은 있었으나 drift/품절로 전 품목이 빠진 경우 → 사유와 함께 카트 복귀 안내
    // (예전엔 사유 없이 /cart로 튕겨 사용자가 이유를 몰랐다).
    if (!initialOrderItems || initialOrderItems.length === 0) return null;
    return (
      <PublicPageFrame>
        <div className="order-page">
          <PublicSiteHeader />
          <ContentContainer as="section" className="order-content">
            <div className="order-empty" role="alert">
              <p className="order-empty__text">
                {priceDriftWarning ||
                  "선택하신 교재를 주문할 수 없어요. 이미 판매되었거나 비공개로 전환되었습니다."}
              </p>
              <button
                className="order-empty__back"
                onClick={() => {
                  // GA4 select_content — 막다른 화면에서 카트로 복귀한 비율
                  trackSelectContent("checkout_empty_cta", "back_to_cart", checkoutContext());
                  navigate("/cart");
                }}
                type="button"
              >
                장바구니로 돌아가기
              </button>
            </div>
          </ContentContainer>
          <PublicFooter />
        </div>
      </PublicPageFrame>
    );
  }

  const subtotal = orderItems.reduce((sum, i) => sum + (i.price ?? 0) * i.quantity, 0);

  // 정가(original_price) 대비 절약액 — 정가가 있는 시중 상품만 합산.
  // 비매품(정가 없음)·정가<=판매가는 제외해 할인이 0/음수로 잡히지 않게 가드.
  // (정가는 시중 정가라 정적 → 결제 직전 drift로 price가 바뀌어도 그대로 의미 있음)
  const retailOriginalTotal = orderItems.reduce((sum, i) => {
    const orig = Number(i.originalPrice);
    const price = Number(i.price);
    if (!Number.isFinite(orig) || !Number.isFinite(price) || orig <= price) return sum;
    return sum + orig * (i.quantity ?? 1);
  }, 0);
  const retailSellingTotal = orderItems.reduce((sum, i) => {
    const orig = Number(i.originalPrice);
    const price = Number(i.price);
    if (!Number.isFinite(orig) || !Number.isFinite(price) || orig <= price) return sum;
    return sum + price * (i.quantity ?? 1);
  }, 0);
  const retailSavings = retailOriginalTotal - retailSellingTotal;

  const baseShippingFee = calculateShippingFee(subtotal);
  const selectedCoupon = applicableCoupons.find((c) => c.id === selectedCouponId) ?? null;
  const couponPreview = previewCouponDiscount(selectedCoupon, subtotal, baseShippingFee);
  // 제주·도서산간 추가 배송비 — 서버 create_order와 동일하게
  // 무료배송(임계·쿠폰) 처리 "이후" 가산된다 (어떤 경우에도 부과)
  const remoteAreaInfo = getRemoteAreaInfo(shipping.postalCode);
  const remoteSurcharge = remoteAreaInfo?.surcharge ?? 0;
  const shippingFee = couponPreview.shippingFeeAfter + remoteSurcharge;
  const couponDiscount = couponPreview.subtotalDiscount;
  // 포인트 (2026-09-02): 1,000P 이상 보유 · 상품금액 15,000원 이상 · 상품금액 20%까지 (서버와 동일 규칙)
  const maxUsablePoints = isGuestCheckout
    ? 0
    : computeMaxUsablePoints({ balance: pointBalance, subtotal, couponDiscount });
  const effectivePoints = Math.min(Math.max(0, pointsToUse), maxUsablePoints);
  const pointsUnavailableReason = isGuestCheckout
    ? ""
    : getPointsUnavailableReason({ balance: pointBalance, subtotal });
  const totalAmount = Math.max(0, subtotal + shippingFee - couponDiscount - effectivePoints);

  // P1-7: 쿠폰 정렬 — 만료 임박(<24h) 우선 + 큰 할인 순.
  // 가장 큰 이득이 되는 쿠폰을 위로 올리고, 추천/만료 임박 라벨로 시각 가이드.
  const sortedCoupons = [...applicableCoupons].sort((a, b) => {
    const aExpiring = isCouponExpiringSoon(a);
    const bExpiring = isCouponExpiringSoon(b);
    if (aExpiring !== bExpiring) return aExpiring ? -1 : 1;
    const aDiscount = estimateCouponDiscountAmount(a, subtotal);
    const bDiscount = estimateCouponDiscountAmount(b, subtotal);
    if (aDiscount !== bDiscount) return bDiscount - aDiscount;
    return getCouponExpiryMs(a) - getCouponExpiryMs(b);
  });
  // "추천" 뱃지는 가장 큰 할인 쿠폰 1장에만. 만료 임박은 따로 표시.
  const recommendedCouponId = sortedCoupons
    .map((coupon) => ({ id: coupon.id, amount: estimateCouponDiscountAmount(coupon, subtotal) }))
    .reduce(
      (acc, cur) => (acc === null || cur.amount > acc.amount ? cur : acc),
      null,
    )?.id;

  return (
    <PublicPageFrame>
      <div className="order-page">
        <PublicSiteHeader />

        <ContentContainer as="section" className="order-content">
          <h1 className="order-page__title">주문/결제</h1>

          {priceDriftWarning ? (
            <div className="order-drift-warning" role="alert">
              <strong>주문 정보가 변경되었습니다.</strong>
              <div className="order-drift-warning__detail">{priceDriftWarning}</div>
              <button
                type="button"
                className="order-drift-warning__close"
                onClick={() => setPriceDriftWarning(null)}
              >
                확인
              </button>
            </div>
          ) : null}

          <div className="order-layout">
            <div className="order-main" onKeyDown={focusNextFieldOnEnter}>
              {/* 주문 상품 */}
              <div className="order-section">
                <h2 className="order-section__title">주문 상품 ({orderItems.length}개)</h2>
                <div className="order-items">
                  {orderItems.map((item, idx) => (
                    <OrderItemRow item={item} key={`${item.bookId}-${idx}`} />
                  ))}
                </div>
              </div>

              {/* 배송지 — 기본 배송지 카드 + 주소록 모달 (2026-07-12 UX 개편) */}
              <div className="order-section">
                <div className="order-section__head">
                  <h2 className="order-section__title">배송 주소</h2>
                  {savedAddresses.length > 0 && (
                    <button
                      className="order-addr-change-btn"
                      onClick={() => {
                        // GA4 dialog_open(address_book) — 저장된 주소를 바꾸러 들어간 비율
                        trackDialogOpen("address_book", {
                          savedAddressCount: savedAddresses.length,
                          ...checkoutContext(),
                        });
                        setIsAddressBookOpen(true);
                      }}
                      type="button"
                    >
                      주소 변경
                    </button>
                  )}
                </div>

                {selectedAddressId != null ? (
                  <div className="order-addr-card">
                    <div className="order-addr-card__row">
                      <span className="order-addr-card__label">받는 분</span>
                      <span className="order-addr-card__value">{shipping.recipientName}</span>
                    </div>
                    <div className="order-addr-card__row">
                      <span className="order-addr-card__label">연락처</span>
                      <span className="order-addr-card__value">{shipping.recipientPhone}</span>
                    </div>
                    <div className="order-addr-card__row">
                      <span className="order-addr-card__label">주소</span>
                      <span className="order-addr-card__value">
                        [{shipping.postalCode}] {shipping.addressLine1} {shipping.addressLine2}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="order-form">
                    {savedAddresses.length === 0 && !isGuestCheckout && (
                      <p className="order-section__hint">
                        입력하신 주소는 기본 배송지로 자동 저장돼요.
                      </p>
                    )}
                    <div className="order-form__row">
                      <label className="order-form__label">수령인</label>
                      <input
                        className="order-form__input"
                        onBlur={handleShippingFieldBlur("recipient_name")}
                        onChange={(e) => setShipping((p) => ({ ...p, recipientName: e.target.value }))}
                        placeholder="이름"
                        type="text"
                        value={shipping.recipientName}
                      />
                    </div>
                    <div className="order-form__row">
                      <label className="order-form__label">연락처</label>
                      <input
                        className="order-form__input"
                        inputMode="tel"
                        onBlur={handleShippingFieldBlur("recipient_phone")}
                        onChange={(e) => setShipping((p) => ({ ...p, recipientPhone: formatPhoneNumber(e.target.value) }))}
                        placeholder="010-0000-0000"
                        type="tel"
                        value={shipping.recipientPhone}
                      />
                    </div>
                    <div className="order-form__row">
                      <label className="order-form__label">주소</label>
                      <div className="order-form__address-group">
                        <div className="order-form__postal-row">
                          <input
                            className="order-form__input order-form__input--postal"
                            disabled
                            placeholder="우편번호"
                            type="text"
                            value={shipping.postalCode}
                          />
                          <button
                            className="order-form__search-btn"
                            onClick={handleSearchAddress}
                            type="button"
                          >
                            주소 검색
                          </button>
                        </div>
                        <input
                          className="order-form__input"
                          disabled
                          placeholder="기본 주소"
                          type="text"
                          value={shipping.addressLine1}
                        />
                        <input
                          className="order-form__input"
                          onBlur={handleShippingFieldBlur("address_detail")}
                          onChange={(e) => setShipping((p) => ({ ...p, addressLine2: e.target.value }))}
                          placeholder="상세 주소 (동/호수)"
                          type="text"
                          value={shipping.addressLine2}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 배송 요청사항 — 선택형 모달로 설정 */}
                <button
                  className="order-memo-row"
                  onClick={() => {
                    // GA4 dialog_open(delivery_memo) — 요청사항을 실제로 여는 비율
                    trackDialogOpen("delivery_memo", {
                      hasMemo: Boolean(shipping.memo),
                      ...checkoutContext(),
                    });
                    setIsMemoModalOpen(true);
                  }}
                  type="button"
                >
                  <span className={shipping.memo ? "" : "order-memo-row__placeholder"}>
                    {shipping.memo || "요청사항 없음"}
                  </span>
                  <ChevronRightIcon size={16} />
                </button>
              </div>

              {/* 결제 수단 */}
              <div className="order-section">
                <h2 className="order-section__title">결제 수단</h2>
                {PG_READY ? (
                  <>
                    <div className="order-payment-methods">
                      <button
                        className={`order-payment-btn${paymentMethod !== "bank_transfer" ? " is-active" : ""}`}
                        onClick={() => handlePaymentSelect("card")}
                        type="button"
                      >
                        <span className="order-payment-btn__label">
                          {PG_PROVIDER === "nicepay" ? "신용/체크카드" : "간편결제 · 카드"}
                        </span>
                      </button>
                      <button
                        className={`order-payment-btn${paymentMethod === "bank_transfer" ? " is-active" : ""}`}
                        onClick={() => handlePaymentSelect("bank_transfer")}
                        type="button"
                      >
                        <span className="order-payment-btn__label">계좌이체 (무통장입금)</span>
                      </button>
                    </div>

                    {/* 나이스페이는 별도 위젯 없이 결제하기 시점에 결제창이 열린다 */}
                    {PG_PROVIDER === "nicepay" && paymentMethod !== "bank_transfer" ? (
                      <p className="order-section__hint" style={{ marginTop: 12 }}>
                        결제하기 버튼을 누르면 나이스페이먼츠 안전결제창에서 카드 결제가 진행됩니다.
                      </p>
                    ) : null}

                    {/* 토스 결제위젯 컨테이너는 항상 마운트(재선택 시 재init 방지), 계좌이체 선택 시 숨김 */}
                    {PG_PROVIDER === "toss" ? (
                      <div style={{ display: paymentMethod === "bank_transfer" ? "none" : undefined, marginTop: 16 }}>
                        <div id="toss-payment-method" />
                        <div id="toss-agreement" />
                        {tossLoadError ? (
                          <p role="alert" style={{ marginTop: 12, fontSize: 13, color: "#dc2626" }}>
                            결제 모듈을 불러오지 못했어요. 새로고침 후 다시 시도하거나 계좌이체를 이용해 주세요.
                          </p>
                        ) : !tossWidgetReady ? (
                          <p style={{ marginTop: 12, fontSize: 13, color: "#64748b" }}>결제 수단을 불러오는 중...</p>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="order-payment-methods">
                    {PAYMENT_METHODS.map((method) => (
                      <button
                        aria-disabled={!method.available || undefined}
                        className={`order-payment-btn${method.id === paymentMethod ? " is-active" : ""}${!method.available ? " is-disabled" : ""}`}
                        disabled={!method.available}
                        key={method.id}
                        onClick={() => handlePaymentSelect(method.id)}
                        title={!method.available ? "준비 중인 결제 수단입니다." : undefined}
                        type="button"
                      >
                        <span className="order-payment-btn__label">{method.label}</span>
                        {!method.available && (
                          <span className="order-payment-btn__badge">준비 중</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {paymentMethod === "bank_transfer" && (
                  <div className="order-bank-info">
                    {/* P0-2: 결제 직전 계좌 정보 사전 노출 — 입금자명은 주문번호 확정 후 자동 안내 */}
                    <div className="order-bank-info__account-row">
                      <p className="order-bank-info__account">
                        {BANK_NAME} {BANK_ACCOUNT}
                      </p>
                      <button
                        aria-label="계좌번호 복사"
                        className="order-bank-info__copy"
                        onClick={handleCopyAccount}
                        type="button"
                      >
                        <svg
                          aria-hidden="true"
                          fill="none"
                          height="18"
                          viewBox="0 0 24 24"
                          width="18"
                        >
                          <rect
                            height="13"
                            rx="2"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            width="13"
                            x="9"
                            y="9"
                          />
                          <path
                            d="M5 15V5a2 2 0 0 1 2-2h10"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeWidth="1.8"
                          />
                        </svg>
                      </button>
                    </div>
                    <p className="order-bank-info__holder">예금주: {BANK_HOLDER}</p>
                    <ul className="order-bank-info__bullets">
                      <li>
                        결제 후 <strong>{PAYMENT_DEADLINE_HOURS}시간 이내</strong> 입금해주세요.
                      </li>
                      <li>미입금 시 주문이 자동 취소됩니다.</li>
                      <li>
                        입금자명은 결제 완료 후 화면·카카오톡으로 자동 안내드립니다.
                        (본인 성함 + 주문번호 마지막 4자리)
                      </li>
                    </ul>
                  </div>
                )}
              </div>

              {/* 환불 계좌 정보 — 무통장입금 결제 시 필수 입력 (2026-07-12 정책).
                  PG 결제는 원결제수단 자동 환불이라 미해당. 관리자 주문 상세에서 확인 가능. */}
              {paymentMethod === "bank_transfer" && (
                <div className="order-section">
                  <h2 className="order-section__title">환불 계좌 정보</h2>
                  <p className="order-section__hint">
                    환불이 필요할 때 아래 계좌로 돌려드려요.
                    <br />
                    입금하시는 분 본인 명의 계좌로 입력해 주세요.
                  </p>
                  <div className="order-refund-account">
                    <BankSelect
                      onChange={(bank) => {
                        // GA4 refund_account_bank_select — 은행명은 개인정보가 아니라 그대로 기록
                        trackEvent("refund_account_bank_select", {
                          bankName: bank,
                          ...checkoutContext(),
                        });
                        setRefundAccount((prev) => ({ ...prev, bank }));
                      }}
                      options={BANK_OPTIONS}
                      value={refundAccount.bank}
                    />
                    <input
                      className="order-refund-account__input"
                      enterKeyHint="next"
                      inputMode="numeric"
                      onBlur={handleRefundFieldBlur("account_number")}
                      onChange={(e) => setRefundAccount((prev) => ({ ...prev, number: e.target.value }))}
                      placeholder="계좌번호 (‘-’ 없이 숫자만)"
                      type="text"
                      value={refundAccount.number}
                    />
                    <input
                      className="order-refund-account__input"
                      enterKeyHint="done"
                      onBlur={handleRefundFieldBlur("holder")}
                      onChange={(e) => setRefundAccount((prev) => ({ ...prev, holder: e.target.value }))}
                      placeholder="예금주"
                      type="text"
                      value={refundAccount.holder}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 결제 요약 사이드바 — 모바일에선 고정바 없이 일반 흐름(PR #12) */}
            <div className="order-sidebar">
              <div className="order-sidebar__card">
                <h2 className="order-sidebar__title">결제 금액</h2>
                <div className="order-sidebar__row">
                  <span>상품금액</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="order-sidebar__row">
                  <span>배송비</span>
                  <span>{shippingFee === 0 ? "무료" : formatCurrency(shippingFee)}</span>
                </div>
                {remoteSurcharge > 0 && remoteAreaInfo ? (
                  <p className="order-sidebar__hint">
                    {remoteAreaInfo.label} 지역 추가 배송비 {formatCurrency(remoteSurcharge)} 포함
                  </p>
                ) : null}
                {couponPreview.shippingFeeAfter > 0 && (
                  <p className="order-sidebar__hint">
                    {/* P2-5: 카트와 동일한 hint — N원 더 담으면 무료배송 (도서산간 추가비는 별도) */}
                    {formatCurrency(Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal))} 더 담으면 무료배송
                  </p>
                )}

                {/* 쿠폰 적용 — 보유 쿠폰이 0장이면 row 자체를 숨김. */}
                {/* "사용 가능한 쿠폰이 없습니다"는 결제 직전 시점 좌절감을 키우는 카피라 노출하지 않는다. */}
                {applicableCoupons.length > 0 || selectedCoupon ? (
                  <div className="order-sidebar__coupon-row">
                    <button
                      type="button"
                      className="order-sidebar__coupon-button"
                      onClick={() => {
                        // GA4 dialog_open(coupon_picker) — 보유 쿠폰 대비 실제로 여는 비율
                        trackDialogOpen("coupon_picker", {
                          availableCount: applicableCoupons.length,
                          hasSelected: Boolean(selectedCoupon),
                          subtotal,
                          ...checkoutContext(),
                        });
                        setIsCouponPickerOpen(true);
                      }}
                    >
                      {selectedCoupon
                        ? <><TicketIcon size={14} /> {selectedCoupon.title}</>
                        : `쿠폰 적용 (${applicableCoupons.length}장 사용 가능)`}
                      {selectedCoupon ? <span className="order-sidebar__coupon-change">변경</span> : null}
                    </button>
                    {selectedCoupon ? (
                      <button
                        type="button"
                        className="order-sidebar__coupon-clear"
                        onClick={() => {
                          trackCouponRemove({
                            uiSurface: "sidebar",
                            couponId: String(selectedCoupon?.id ?? ""),
                            ...checkoutContext(),
                          });
                          setSelectedCouponId(null);
                        }}
                      >
                        해제
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {selectedCoupon ? (
                  <div className="order-sidebar__row order-sidebar__row--discount">
                    <span>쿠폰 할인</span>
                    <span>
                      {selectedCoupon.discount_type === "free_shipping"
                        ? "배송비 무료"
                        : `-${formatCurrency(couponDiscount)}`}
                    </span>
                  </div>
                ) : null}

                {/* 포인트 사용 (2026-09-02) — 회원 + 잔액 있을 때만 노출 */}
                {!isGuestCheckout && pointBalance > 0 ? (
                  <div className="order-sidebar__points">
                    <div className="order-sidebar__points-head">
                      <span>포인트 사용</span>
                      <span className="order-sidebar__points-balance">보유 {formatPoints(pointBalance)}</span>
                    </div>
                    {maxUsablePoints > 0 ? (
                      <>
                        <div className="order-sidebar__points-row">
                          <input
                            aria-label="사용할 포인트"
                            className="order-sidebar__points-input"
                            inputMode="numeric"
                            onChange={(e) => {
                              // 직접 입력 — 실제 발화는 아래 디바운스 effect가 800ms 뒤 1건만
                              pointsInputMethodRef.current = "manual";
                              setPointsToUse(clampPointsInput(e.target.value, maxUsablePoints));
                            }}
                            placeholder="0"
                            type="text"
                            value={effectivePoints > 0 ? String(effectivePoints) : ""}
                          />
                          <button
                            className="order-sidebar__points-max"
                            onClick={() => {
                              // 전액 사용/해제 — input_method=max로 구분 (발화는 디바운스 effect)
                              pointsInputMethodRef.current = "max";
                              setPointsToUse(effectivePoints === maxUsablePoints ? 0 : maxUsablePoints);
                            }}
                            type="button"
                          >
                            {effectivePoints === maxUsablePoints ? "해제" : "전액 사용"}
                          </button>
                        </div>
                        <p className="order-sidebar__hint">
                          이 주문에서 최대 {formatPoints(maxUsablePoints)} (상품금액의 20%)
                        </p>
                      </>
                    ) : (
                      <p className="order-sidebar__hint">{pointsUnavailableReason}</p>
                    )}
                  </div>
                ) : null}

                {effectivePoints > 0 ? (
                  <div className="order-sidebar__row order-sidebar__row--discount">
                    <span>포인트 사용</span>
                    <span>-{formatCurrency(effectivePoints)}</span>
                  </div>
                ) : null}

                <div className="order-sidebar__divider" />
                <div className="order-sidebar__row order-sidebar__row--total">
                  <span>총 결제금액</span>
                  <span>{formatCurrency(totalAmount)}</span>
                </div>

                {/* 정가 대비 절약 멘트 — 정가가 있는 시중 상품에 한해 표시.
                    전부 비매품(정가 없음)이면 retailSavings=0이라 노출 안 됨. */}
                {retailSavings > 0 ? (
                  <p className="order-sidebar__savings">
                    정가 대비 <strong>{formatCurrency(retailSavings)}</strong> 아꼈어요
                  </p>
                ) : null}

                {/* P0-3: 동의 체크박스 3분리 — 주문 내용 / 자동 취소 / 환불 정책 */}
                <div className="order-sidebar__agreements">
                  <label className="order-sidebar__agreement-check order-sidebar__agreement-check--all">
                    <input
                      checked={
                        agreementOrder &&
                        agreementRefund &&
                        (isPg || agreementPayment)
                      }
                      onChange={(e) => {
                        const next = e.target.checked;
                        // GA4 agreement_toggle_all — 일괄 동의 사용 비율(개별 체크 대비)
                        trackEvent("agreement_toggle_all", {
                          formName: "checkout",
                          checked: next,
                          ...checkoutContext(),
                        });
                        setAgreementOrder(next);
                        setAgreementPayment(next);
                        setAgreementRefund(next);
                      }}
                      type="checkbox"
                    />
                    <span>
                      <strong>모두 동의하기</strong>
                    </span>
                  </label>
                  <label className="order-sidebar__agreement-check">
                    <input
                      checked={agreementOrder}
                      onChange={(e) => {
                        // GA4 agreement_toggle — 어떤 필수 동의에서 멈추는지(검증 실패와 대조)
                        trackEvent("agreement_toggle", {
                          formName: "checkout",
                          agreementType: "order_privacy",
                          checked: e.target.checked,
                          ...checkoutContext(),
                        });
                        setAgreementOrder(e.target.checked);
                      }}
                      type="checkbox"
                    />
                    <span>
                      <strong>[필수]</strong> 주문 내용 확인 및{" "}
                      <a
                        className="order-sidebar__agreement-link"
                        href="/privacy"
                        onClick={() =>
                          trackSelectContent("policy_link", "privacy", checkoutContext())
                        }
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        개인정보 수집·이용
                      </a>
                      에 동의합니다.
                    </span>
                  </label>
                  {!isPg && (
                    <label className="order-sidebar__agreement-check">
                      <input
                        checked={agreementPayment}
                        onChange={(e) => {
                          trackEvent("agreement_toggle", {
                            formName: "checkout",
                            agreementType: "auto_cancel",
                            checked: e.target.checked,
                            ...checkoutContext(),
                          });
                          setAgreementPayment(e.target.checked);
                        }}
                        type="checkbox"
                      />
                      <span>
                        <strong>[필수]</strong> 결제 후 {PAYMENT_DEADLINE_HOURS}시간 이내 미입금 시
                        주문이 <strong>자동 취소</strong>됨에 동의합니다.
                      </span>
                    </label>
                  )}
                  <label className="order-sidebar__agreement-check">
                    <input
                      checked={agreementRefund}
                      onChange={(e) => {
                        trackEvent("agreement_toggle", {
                          formName: "checkout",
                          agreementType: "refund_policy",
                          checked: e.target.checked,
                          ...checkoutContext(),
                        });
                        setAgreementRefund(e.target.checked);
                      }}
                      type="checkbox"
                    />
                    <span>
                      <strong>[필수]</strong>{" "}
                      <a
                        className="order-sidebar__agreement-link"
                        href="/refund"
                        onClick={() => trackSelectContent("policy_link", "refund", checkoutContext())}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        환불·교환 정책
                      </a>
                      을 확인했으며, 포장 개봉 또는 필기·표시 등 흔적이 추가된 경우 단순 변심에
                      의한 환불이 제한될 수 있음에 동의합니다.
                    </span>
                  </label>
                </div>

                <button
                  className="order-sidebar__submit-btn"
                  disabled={
                    isSubmitting ||
                    !requiredAgreementsOk ||
                    (isPg && PG_PROVIDER === "toss" && !tossWidgetReady)
                  }
                  onClick={handleSubmit}
                  type="button"
                >
                  {isSubmitting ? "주문 처리 중…" : `${formatCurrency(totalAmount)} 결제하기`}
                </button>
              </div>
            </div>
          </div>
        </ContentContainer>

        <PublicFooter />

        <OrderAddressBookModal
          addresses={savedAddresses}
          checkoutContext={checkoutContext}
          onClose={() => setIsAddressBookOpen(false)}
          onSaved={refreshAddressesAndSelect}
          onSelect={(addr) => {
            // GA4 address_select — 주소록에서 고른 주소(기본 배송지 사용률)
            trackEvent("address_select", {
              isDefault: Boolean(addr.is_default),
              savedAddressCount: savedAddresses.length,
              ...checkoutContext(),
            });
            handleSelectAddress(addr);
            setIsAddressBookOpen(false);
          }}
          open={isAddressBookOpen}
          selectedAddressId={selectedAddressId}
          showToast={showToast}
          user={user}
        />
        <OrderDeliveryRequestModal
          memo={shipping.memo}
          onApply={(nextMemo) => {
            // GA4 delivery_memo_apply — 프리셋/직접입력 분포. 직접입력 본문은 보내지 않는다.
            trackEvent("delivery_memo_apply", {
              memoType: !nextMemo
                ? "none"
                : DELIVERY_REQUEST_PRESETS.includes(nextMemo)
                  ? "preset"
                  : "custom",
              ...(DELIVERY_REQUEST_PRESETS.includes(nextMemo) ? { optionLabel: nextMemo } : {}),
              ...checkoutContext(),
            });
            setShipping((prev) => ({ ...prev, memo: nextMemo }));
            setIsMemoModalOpen(false);
          }}
          onClose={() => setIsMemoModalOpen(false)}
          open={isMemoModalOpen}
        />

        {toast && (
          <div className={`order-toast order-toast--${toast.type}`} role="alert">
            {toast.message}
          </div>
        )}

        {isCouponPickerOpen && (
          <div
            className="order-coupon-modal"
            onClick={() => {
              trackDialogClose("coupon_picker", "backdrop", checkoutContext());
              setIsCouponPickerOpen(false);
            }}
          >
            <div
              className="order-coupon-modal__panel"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="order-coupon-modal__header">
                <h2>쿠폰 선택</h2>
                <button
                  aria-label="닫기"
                  type="button"
                  className="order-coupon-modal__close"
                  onClick={() => {
                    trackDialogClose("coupon_picker", "close_button", checkoutContext());
                    setIsCouponPickerOpen(false);
                  }}
                >
                  <CloseIcon size={18} />
                </button>
              </header>

              <ul className="order-coupon-modal__list">
                {sortedCoupons.length === 0 ? (
                  <li className="order-coupon-modal__empty">
                    이 주문에 사용할 수 있는 쿠폰이 없습니다.
                  </li>
                ) : (
                  sortedCoupons.map((c, couponIndex) => {
                    const isSelected = c.id === selectedCouponId;
                    const isRecommended = c.id === recommendedCouponId;
                    const expiringSoon = isCouponExpiringSoon(c);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          className={`order-coupon-modal__item${isSelected ? " is-selected" : ""}`}
                          onClick={() => {
                            // GA4 coupon_apply — 정렬 순위·추천/만료임박 라벨이 선택에 미치는 영향
                            trackCouponApply({
                              couponId: c.id,
                              couponTitle: c.title,
                              discountType: c.discount_type,
                              discountAmount: estimateCouponDiscountAmount(c, subtotal),
                              isRecommended,
                              expiringSoon,
                              rank: couponIndex + 1,
                              ...checkoutContext(),
                            });
                            setSelectedCouponId(c.id);
                            setIsCouponPickerOpen(false);
                          }}
                        >
                          <div className="order-coupon-modal__item-amount">
                            {c.discount_type === "free_shipping"
                              ? "무료배송"
                              : c.discount_type === "percentage"
                                ? `${c.discount_value}%${c.max_discount_amount ? ` (최대 ${formatCurrency(c.max_discount_amount)})` : ""}`
                                : `${formatCurrency(c.discount_value)} 할인`}
                          </div>
                          <div className="order-coupon-modal__item-body">
                            <div className="order-coupon-modal__item-tags">
                              {isRecommended ? (
                                <span className="order-coupon-modal__tag order-coupon-modal__tag--recommend">
                                  추천
                                </span>
                              ) : null}
                              {expiringSoon ? (
                                <span className="order-coupon-modal__tag order-coupon-modal__tag--expiring">
                                  만료 임박
                                </span>
                              ) : null}
                            </div>
                            <strong>{c.title}</strong>
                            {c.scope_brand || c.min_order_amount > 0 ? (
                              <span>
                                {c.scope_brand ? `${c.scope_brand} 교재 ` : ""}
                                {c.min_order_amount > 0
                                  ? `${formatCurrency(c.min_order_amount)} 이상 주문 시`
                                  : "전용"}
                              </span>
                            ) : null}
                            <span className="order-coupon-modal__item-expiry">
                              {c.expires_at
                                ? `${c.expires_at.replace("T", " ").slice(0, 16)}까지`
                                : "무기한"}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>

              <footer className="order-coupon-modal__footer">
                {selectedCouponId ? (
                  <button
                    type="button"
                    className="order-coupon-modal__clear"
                    onClick={() => {
                      trackCouponRemove({
                        uiSurface: "modal",
                        couponId: String(selectedCouponId ?? ""),
                        ...checkoutContext(),
                      });
                      setSelectedCouponId(null);
                      setIsCouponPickerOpen(false);
                    }}
                  >
                    쿠폰 사용 안 함
                  </button>
                ) : null}
                <button
                  type="button"
                  className="order-coupon-modal__close-button"
                  onClick={() => {
                    trackDialogClose("coupon_picker", "cancel_button", checkoutContext());
                    setIsCouponPickerOpen(false);
                  }}
                >
                  닫기
                </button>
              </footer>
            </div>
          </div>
        )}
      </div>
    </PublicPageFrame>
  );
}

export default PublicOrderPage;
