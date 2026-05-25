import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { formatCurrency } from "@shared-domain/format";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { supabase as publicSupabase } from "@shared-supabase/publicSupabaseClient";
import { FREE_SHIPPING_THRESHOLD, calculateShippingFee, createOrder } from "../lib/cart";
import { loadMemberPortalSnapshot } from "../lib/memberPortal";
import { usePageMeta } from "../lib/usePageMeta";
import {
  BANK_ACCOUNT,
  BANK_HOLDER,
  BANK_NAME,
  PAYMENT_DEADLINE_HOURS,
} from "../lib/paymentBankInfo";
import "./PublicOrderPage.css";

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

const PAYMENT_METHODS = [
  { id: "bank_transfer", label: "계좌이체 (무통장입금)", available: true },
  { id: "card", label: "신용/체크카드", available: false },
  { id: "kakao_pay", label: "카카오페이", available: false },
  { id: "toss_pay", label: "토스페이", available: false },
  { id: "naver_pay", label: "네이버페이", available: false },
];

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
          <img alt={item.title} src={item.coverImageUrl} />
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
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // P0-3: 동의 체크박스 3개로 분리 — 주문 내용/결제 및 자동 취소/환불 정책
  const [agreementOrder, setAgreementOrder] = useState(false);
  const [agreementPayment, setAgreementPayment] = useState(false);
  const [agreementRefund, setAgreementRefund] = useState(false);
  const allAgreementsChecked = agreementOrder && agreementPayment && agreementRefund;
  const inFlightRef = useRef(false); // 더블 클릭으로 RPC 두 번 발사 방지 (state 비동기 보완)
  const [toast, setToast] = useState(null);
  // 쿠폰
  const [applicableCoupons, setApplicableCoupons] = useState([]);
  const [selectedCouponId, setSelectedCouponId] = useState(null);
  const [isCouponPickerOpen, setIsCouponPickerOpen] = useState(false);
  // P1-4: 모바일 키보드 감지 — sticky bar bottom 보정
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return undefined;
    const vv = window.visualViewport;
    const sync = () => {
      // 키보드가 올라오면 visualViewport.height < window.innerHeight.
      const diff = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(diff > 80 ? diff : 0);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate("/login", { state: { from: { pathname: "/order" } } });
      return;
    }
    if (!orderItems || orderItems.length === 0) {
      navigate("/cart");
      return;
    }
  }, [authLoading, isAuthenticated, navigate, orderItems]);

  // 가격 drift 검증: 진입 시 books 테이블에서 fresh 가격·status를 조회해 표시 금액을 동기화한다.
  // initialOrderItems가 바뀔 때만 한 번 fetch (재실행 방지).
  useEffect(() => {
    if (!isAuthenticated || !initialOrderItems || initialOrderItems.length === 0) return;
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
      if (cancelled || error || !Array.isArray(data)) return;

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
        setPriceDriftWarning(
          `이미 판매되었거나 비공개된 교재가 ${unavailable.length}건 있어 주문에서 제외했습니다: ${unavailable.join(", ")}`,
        );
      } else if (drifts.length > 0) {
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
  }, [isAuthenticated, initialOrderItems]);

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
      });
      if (!error && Array.isArray(data)) {
        setApplicableCoupons(data);
      }
    };
    void loadCoupons();
  }, [user, orderItems]);

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

  const handleSearchAddress = async () => {
    try {
      await loadDaumPostcode();
    } catch (err) {
      showToast(err?.message || "주소 검색을 불러오지 못했습니다.", "error");
      return;
    }

    if (!window.daum?.Postcode) {
      showToast("주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
      return;
    }

    new window.daum.Postcode({
      oncomplete: (data) => {
        setShipping((prev) => ({
          ...prev,
          postalCode: data.zonecode,
          addressLine1: data.roadAddress || data.jibunAddress,
        }));
        setSelectedAddressId(null);
      },
    }).open();
  };

  const handlePaymentSelect = (methodId) => {
    const method = PAYMENT_METHODS.find((m) => m.id === methodId);
    if (!method?.available) {
      // P1-8: 비활성 결제 수단 클릭 시 사용자가 "왜 안 되지" 멈추지 않게 명시
      showToast("사업자 등록 완료 후 오픈 예정입니다.", "info");
      return;
    }
    setPaymentMethod(methodId);
  };

  const validate = () => {
    if (!shipping.recipientName.trim()) return "수령인 이름을 입력해주세요.";
    if (!shipping.recipientPhone.trim()) return "수령인 연락처를 입력해주세요.";
    if (!shipping.postalCode.trim() || !shipping.addressLine1.trim()) return "배송지 주소를 입력해주세요.";
    if (!agreementOrder) return "[필수] 주문 내용·개인정보 제공 동의에 체크해주세요.";
    if (!agreementPayment) return "[필수] 24시간 미입금 시 자동 취소 동의에 체크해주세요.";
    if (!agreementRefund) return "[필수] 환불·교환 정책 확인에 체크해주세요.";
    return null;
  };

  const handleSubmit = async () => {
    // 동기 ref 가드: 빠른 더블 클릭 시 첫 호출이 끝나기 전 두 번째 클릭 차단.
    // setState는 비동기라 isSubmitting state로는 race를 못 막는다.
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const validationError = validate();
    if (validationError) {
      showToast(validationError, "error");
      inFlightRef.current = false;
      return;
    }

    setIsSubmitting(true);
    const bookIds = orderItems.map((i) => i.bookId);
    const quantities = orderItems.map((i) => i.quantity);

    const { data, error } = await createOrder({
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
    });

    setIsSubmitting(false);

    if (error) {
      showToast(error.message || "주문에 실패했습니다.", "error");
      inFlightRef.current = false;
      return;
    }

    navigate(`/order/complete/${data.order_id}`, {
      state: {
        orderNumber: data.order_number,
        totalAmount: data.total_amount,
        itemCount: orderItems.reduce((sum, i) => sum + (i.quantity ?? 1), 0),
        recipientName: shipping.recipientName,
      },
      replace: true,
    });
  };

  if (!orderItems || orderItems.length === 0) return null;

  const subtotal = orderItems.reduce((sum, i) => sum + (i.price ?? 0) * i.quantity, 0);
  const baseShippingFee = calculateShippingFee(subtotal);
  const selectedCoupon = applicableCoupons.find((c) => c.id === selectedCouponId) ?? null;
  const couponPreview = previewCouponDiscount(selectedCoupon, subtotal, baseShippingFee);
  const shippingFee = couponPreview.shippingFeeAfter;
  const couponDiscount = couponPreview.subtotalDiscount;
  const totalAmount = Math.max(0, subtotal + shippingFee - couponDiscount);

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
            <div className="order-main">
              {/* 주문 상품 */}
              <div className="order-section">
                <h2 className="order-section__title">주문 상품 ({orderItems.length}개)</h2>
                <div className="order-items">
                  {orderItems.map((item, idx) => (
                    <OrderItemRow item={item} key={`${item.bookId}-${idx}`} />
                  ))}
                </div>
              </div>

              {/* 배송지 */}
              <div className="order-section">
                <h2 className="order-section__title">배송지 정보</h2>

                {savedAddresses.length > 0 && (
                  <div className="order-saved-addresses">
                    {savedAddresses.map((addr) => (
                      <button
                        className={`order-saved-addr${addr.id === selectedAddressId ? " is-active" : ""}`}
                        key={addr.id}
                        onClick={() => handleSelectAddress(addr)}
                        type="button"
                      >
                        <span className="order-saved-addr__label">
                          {addr.label || addr.recipient_name}
                          {addr.is_default && <span className="order-saved-addr__default">기본</span>}
                        </span>
                        <span className="order-saved-addr__address">
                          {addr.address_line1} {addr.address_line2}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="order-form">
                  <div className="order-form__row">
                    <label className="order-form__label">수령인</label>
                    <input
                      className="order-form__input"
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
                      onChange={(e) => setShipping((p) => ({ ...p, recipientPhone: e.target.value }))}
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
                        onChange={(e) => setShipping((p) => ({ ...p, addressLine2: e.target.value }))}
                        placeholder="상세 주소 (동/호수)"
                        type="text"
                        value={shipping.addressLine2}
                      />
                    </div>
                  </div>
                  <div className="order-form__row">
                    <label className="order-form__label">배송 메모</label>
                    <input
                      className="order-form__input"
                      onChange={(e) => setShipping((p) => ({ ...p, memo: e.target.value }))}
                      placeholder="배송 시 요청사항 (선택)"
                      type="text"
                      value={shipping.memo}
                    />
                  </div>
                </div>
              </div>

              {/* 결제 수단 */}
              <div className="order-section">
                <h2 className="order-section__title">결제 수단</h2>
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
                <p className="order-payment-notice">
                  현재는 계좌이체만 가능합니다. 카드·간편결제는 사업자 등록 절차가 완료된 후 순차적으로 열립니다.
                </p>

                {paymentMethod === "bank_transfer" && (
                  <div className="order-bank-info">
                    <p className="order-bank-info__title">계좌이체로 결제하기</p>
                    {/* P0-2: 결제 직전 계좌 정보 사전 노출 — 입금자명은 주문번호 확정 후 자동 안내 */}
                    <p className="order-bank-info__account">
                      {BANK_NAME} {BANK_ACCOUNT}
                    </p>
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
            </div>

            {/* 결제 요약 사이드바 — 모바일 키보드 활성 시 가려지지 않도록 bottom 동적 보정 */}
            <div
              className="order-sidebar"
              style={keyboardOffset > 0 ? { bottom: keyboardOffset } : undefined}
            >
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
                {shippingFee > 0 && (
                  <p className="order-sidebar__hint">
                    {/* P2-5: 카트와 동일한 hint — N원 더 담으면 무료배송 */}
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
                      onClick={() => setIsCouponPickerOpen(true)}
                    >
                      {selectedCoupon
                        ? `🎟 ${selectedCoupon.title}`
                        : `쿠폰 적용 (${applicableCoupons.length}장 사용 가능)`}
                      {selectedCoupon ? <span className="order-sidebar__coupon-change">변경</span> : null}
                    </button>
                    {selectedCoupon ? (
                      <button
                        type="button"
                        className="order-sidebar__coupon-clear"
                        onClick={() => setSelectedCouponId(null)}
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

                <div className="order-sidebar__divider" />
                <div className="order-sidebar__row order-sidebar__row--total">
                  <span>총 결제금액</span>
                  <span>{formatCurrency(totalAmount)}</span>
                </div>

                {/* P0-3: 동의 체크박스 3분리 — 주문 내용 / 자동 취소 / 환불 정책 */}
                <div className="order-sidebar__agreements">
                  <label className="order-sidebar__agreement-check">
                    <input
                      checked={agreementOrder}
                      onChange={(e) => setAgreementOrder(e.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      <strong>[필수]</strong> 주문 내용·개인정보 제공에 동의합니다.
                    </span>
                  </label>
                  <label className="order-sidebar__agreement-check">
                    <input
                      checked={agreementPayment}
                      onChange={(e) => setAgreementPayment(e.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      <strong>[필수]</strong> 결제 후 {PAYMENT_DEADLINE_HOURS}시간 이내 미입금 시
                      <strong> 자동 취소</strong>에 동의합니다.
                    </span>
                  </label>
                  <label className="order-sidebar__agreement-check">
                    <input
                      checked={agreementRefund}
                      onChange={(e) => setAgreementRefund(e.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      <strong>[필수]</strong>{" "}
                      <a
                        className="order-sidebar__agreement-link"
                        href="/refund"
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        환불·교환 정책
                      </a>
                      을 확인했습니다. (포장 개봉/필기 추가 시 단순변심 환불 불가)
                    </span>
                  </label>
                </div>

                <button
                  className="order-sidebar__submit-btn"
                  disabled={isSubmitting || !allAgreementsChecked}
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

        {toast && (
          <div className={`order-toast order-toast--${toast.type}`} role="alert">
            {toast.message}
          </div>
        )}

        {isCouponPickerOpen && (
          <div className="order-coupon-modal" onClick={() => setIsCouponPickerOpen(false)}>
            <div
              className="order-coupon-modal__panel"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="order-coupon-modal__header">
                <h2>쿠폰 선택</h2>
                <button
                  type="button"
                  className="order-coupon-modal__close"
                  onClick={() => setIsCouponPickerOpen(false)}
                >
                  ✕
                </button>
              </header>

              <ul className="order-coupon-modal__list">
                {sortedCoupons.length === 0 ? (
                  <li className="order-coupon-modal__empty">
                    이 주문에 사용할 수 있는 쿠폰이 없습니다.
                  </li>
                ) : (
                  sortedCoupons.map((c) => {
                    const isSelected = c.id === selectedCouponId;
                    const isRecommended = c.id === recommendedCouponId;
                    const expiringSoon = isCouponExpiringSoon(c);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          className={`order-coupon-modal__item${isSelected ? " is-selected" : ""}`}
                          onClick={() => {
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
                            {c.min_order_amount > 0 ? (
                              <span>{formatCurrency(c.min_order_amount)} 이상 주문 시</span>
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
                  onClick={() => setIsCouponPickerOpen(false)}
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
