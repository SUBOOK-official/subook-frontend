import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { formatCurrency } from "@shared-domain/format";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { FREE_SHIPPING_THRESHOLD, calculateShippingFee, createOrder } from "../lib/cart";
import { loadMemberPortalSnapshot } from "../lib/memberPortal";
import "./PublicOrderPage.css";

const PAYMENT_METHODS = [
  { id: "bank_transfer", label: "계좌이체 (무통장입금)", available: true },
  { id: "card", label: "신용/체크카드", available: false },
  { id: "kakao_pay", label: "카카오페이", available: false },
  { id: "toss_pay", label: "토스페이", available: false },
  { id: "naver_pay", label: "네이버페이", available: false },
];

function loadDaumPostcode() {
  return new Promise((resolve) => {
    if (window.daum?.Postcode) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    script.onload = () => resolve();
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
  const { isAuthenticated, isLoading: authLoading, user, profile } = usePublicAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const orderItems = location.state?.items;

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
  const [toast, setToast] = useState(null);
  const [pgToast, setPgToast] = useState(false);

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate("/login", { state: { from: "/order" } });
      return;
    }
    if (!orderItems || orderItems.length === 0) {
      navigate("/cart");
      return;
    }
  }, [authLoading, isAuthenticated, navigate, orderItems]);

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
    await loadDaumPostcode();
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
    if (!method.available) {
      setPgToast(true);
      setTimeout(() => setPgToast(false), 2500);
      return;
    }
    setPaymentMethod(methodId);
  };

  const validate = () => {
    if (!shipping.recipientName.trim()) return "수령인 이름을 입력해주세요.";
    if (!shipping.recipientPhone.trim()) return "수령인 연락처를 입력해주세요.";
    if (!shipping.postalCode.trim() || !shipping.addressLine1.trim()) return "배송지 주소를 입력해주세요.";
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      showToast(validationError, "error");
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
    });

    setIsSubmitting(false);

    if (error) {
      showToast(error.message || "주문에 실패했습니다.", "error");
      return;
    }

    navigate(`/order/complete/${data.order_id}`, {
      state: {
        orderNumber: data.order_number,
        totalAmount: data.total_amount,
        itemCount: data.item_count,
      },
      replace: true,
    });
  };

  if (!orderItems || orderItems.length === 0) return null;

  const subtotal = orderItems.reduce((sum, i) => sum + (i.price ?? 0) * i.quantity, 0);
  const shippingFee = calculateShippingFee(subtotal);
  const totalAmount = subtotal + shippingFee;

  return (
    <PublicPageFrame>
      <div className="order-page">
        <PublicSiteHeader />

        <ContentContainer as="section" className="order-content">
          <h1 className="order-page__title">주문/결제</h1>

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
                      className={`order-payment-btn${method.id === paymentMethod ? " is-active" : ""}${!method.available ? " is-disabled" : ""}`}
                      key={method.id}
                      onClick={() => handlePaymentSelect(method.id)}
                      type="button"
                    >
                      <span className="order-payment-btn__label">{method.label}</span>
                      {!method.available && (
                        <span className="order-payment-btn__badge">준비 중</span>
                      )}
                    </button>
                  ))}
                </div>

                {paymentMethod === "bank_transfer" && (
                  <div className="order-bank-info">
                    <p className="order-bank-info__title">입금 계좌 안내</p>
                    <p className="order-bank-info__account">신한은행 110-XXX-XXXXXX (수북)</p>
                    <p className="order-bank-info__notice">
                      주문 후 24시간 이내 입금해주세요. 미입금 시 자동 취소됩니다.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 결제 요약 사이드바 */}
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
                {shippingFee > 0 && (
                  <p className="order-sidebar__hint">
                    {formatCurrency(FREE_SHIPPING_THRESHOLD)}원 이상 무료배송
                  </p>
                )}
                <div className="order-sidebar__divider" />
                <div className="order-sidebar__row order-sidebar__row--total">
                  <span>총 결제금액</span>
                  <span>{formatCurrency(totalAmount)}</span>
                </div>

                <button
                  className="order-sidebar__submit-btn"
                  disabled={isSubmitting}
                  onClick={handleSubmit}
                  type="button"
                >
                  {isSubmitting ? "주문 처리 중…" : `${formatCurrency(totalAmount)} 결제하기`}
                </button>

                <p className="order-sidebar__agreement">
                  주문 내용을 확인했으며, 결제에 동의합니다.
                </p>
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

        {pgToast && (
          <div className="order-toast order-toast--pg" role="alert">
            추후 업데이트 예정입니다. 현재는 계좌이체만 가능합니다.
          </div>
        )}
      </div>
    </PublicPageFrame>
  );
}

export default PublicOrderPage;
