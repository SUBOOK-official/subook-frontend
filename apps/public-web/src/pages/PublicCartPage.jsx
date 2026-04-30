import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatCurrency } from "@shared-domain/format";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import {
  FREE_SHIPPING_THRESHOLD,
  calculateShippingFee,
  deleteCartItem,
  deleteCartItems,
  getCartItems,
  updateCartItemQuantity,
} from "../lib/cart";
import "./PublicCartPage.css";

function CartItemRow({ item, isSelected, onToggle, onQuantityChange, onDelete }) {
  const [updating, setUpdating] = useState(false);

  const handleDecrease = async () => {
    if (item.quantity <= 1 || updating) return;
    setUpdating(true);
    await onQuantityChange(item.id, item.quantity - 1);
    setUpdating(false);
  };

  const handleIncrease = async () => {
    if (item.quantity >= 99 || updating) return;
    setUpdating(true);
    await onQuantityChange(item.id, item.quantity + 1);
    setUpdating(false);
  };

  const handleDelete = async () => {
    setUpdating(true);
    await onDelete(item.id);
  };

  const lineTotal = (item.price ?? 0) * item.quantity;

  return (
    <div className={`cart-item${item.is_sold_out ? " cart-item--sold-out" : ""}`}>
      <div className="cart-item__check">
        <input
          aria-label={`${item.title} 선택`}
          checked={isSelected}
          disabled={item.is_sold_out}
          onChange={() => onToggle(item.id)}
          type="checkbox"
        />
      </div>

      <div className="cart-item__image">
        {item.cover_image_url ? (
          <img alt={item.title} src={item.cover_image_url} />
        ) : (
          <div className="cart-item__image-placeholder">SUBOOK</div>
        )}
      </div>

      <div className="cart-item__info">
        <Link className="cart-item__title" to={`/store/${item.product_id || item.book_id}`}>
          {item.title}
        </Link>
        <div className="cart-item__meta">
          {[item.subject, item.brand, item.option_label, item.condition_grade]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {item.is_sold_out && <span className="cart-item__sold-out-badge">품절</span>}

        <div className="cart-item__price-mobile">
          {item.price !== null ? formatCurrency(item.price) : "가격 미등록"}
        </div>

        <div className="cart-item__actions">
          <div className="cart-item__qty">
            <button
              aria-label="수량 줄이기"
              className="cart-item__qty-btn"
              disabled={item.quantity <= 1 || updating || item.is_sold_out}
              onClick={handleDecrease}
              type="button"
            >
              −
            </button>
            <span className="cart-item__qty-value">{item.quantity}</span>
            <button
              aria-label="수량 늘리기"
              className="cart-item__qty-btn"
              disabled={item.quantity >= 99 || updating || item.is_sold_out}
              onClick={handleIncrease}
              type="button"
            >
              +
            </button>
          </div>
          <button
            className="cart-item__delete-btn"
            disabled={updating}
            onClick={handleDelete}
            type="button"
          >
            삭제
          </button>
        </div>
      </div>

      <div className="cart-item__price-col">
        <span className="cart-item__unit-price">
          {item.price !== null ? formatCurrency(item.price) : "—"}
        </span>
        <span className="cart-item__line-total">
          {item.price !== null ? formatCurrency(lineTotal) : "—"}
        </span>
      </div>
    </div>
  );
}

function PublicCartPage() {
  const { isAuthenticated, isLoading: authLoading } = usePublicAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadCart = useCallback(async () => {
    setIsLoading(true);
    const { items: cartItems, error } = await getCartItems();
    setItems(cartItems);
    const availableIds = new Set(
      cartItems.filter((i) => !i.is_sold_out).map((i) => i.id),
    );
    setSelectedIds(availableIds);
    if (error) {
      showToast("장바구니를 불러오지 못했습니다.", "error");
    }
    setIsLoading(false);
  }, [showToast]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate("/login", { state: { from: "/cart" } });
      return;
    }
    void loadCart();
  }, [authLoading, isAuthenticated, navigate, loadCart]);

  const handleToggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleAll = () => {
    const availableItems = items.filter((i) => !i.is_sold_out);
    if (selectedIds.size === availableItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(availableItems.map((i) => i.id)));
    }
  };

  const handleQuantityChange = async (id, quantity) => {
    const { error } = await updateCartItemQuantity(id, quantity);
    if (error) {
      showToast("수량 변경에 실패했습니다.", "error");
      return;
    }
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity } : item)),
    );
  };

  const handleDelete = async (id) => {
    const { error } = await deleteCartItem(id);
    if (error) {
      showToast("삭제에 실패했습니다.", "error");
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    showToast("삭제되었습니다.");
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const { error } = await deleteCartItems(ids);
    if (error) {
      showToast("삭제에 실패했습니다.", "error");
      return;
    }
    setItems((prev) => prev.filter((item) => !selectedIds.has(item.id)));
    setSelectedIds(new Set());
    showToast(`${ids.length}개 상품이 삭제되었습니다.`);
  };

  const handleOrder = () => {
    const selectedItems = items.filter((i) => selectedIds.has(i.id) && !i.is_sold_out);
    if (selectedItems.length === 0) {
      showToast("주문할 상품을 선택해주세요.", "error");
      return;
    }
    const orderPayload = selectedItems.map((i) => ({
      bookId: i.book_id,
      productId: i.product_id,
      quantity: i.quantity,
      title: i.title,
      optionLabel: i.option_label,
      conditionGrade: i.condition_grade,
      coverImageUrl: i.cover_image_url,
      price: i.price,
    }));
    navigate("/order", { state: { items: orderPayload } });
  };

  const selectedItems = items.filter((i) => selectedIds.has(i.id) && !i.is_sold_out);
  const subtotal = selectedItems.reduce(
    (sum, i) => sum + (i.price ?? 0) * i.quantity,
    0,
  );
  const shippingFee = selectedItems.length > 0 ? calculateShippingFee(subtotal) : 0;
  const totalAmount = subtotal + shippingFee;
  const availableItems = items.filter((i) => !i.is_sold_out);
  const allSelected = availableItems.length > 0 && selectedIds.size === availableItems.length;

  return (
    <PublicPageFrame>
      <div className="cart-page">
        <PublicSiteHeader />

        <ContentContainer as="section" className="cart-content">
          <h1 className="cart-page__title">장바구니</h1>

          {isLoading ? (
            <div className="cart-skeleton">
              {[1, 2, 3].map((i) => (
                <div className="cart-skeleton__item" key={i} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="cart-empty">
              <div className="cart-empty__icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <rect x="8" y="14" width="32" height="26" rx="4" stroke="#d1d5db" strokeWidth="2.5" fill="none" />
                  <path d="M16 14V12a8 8 0 1 1 16 0v2" stroke="#d1d5db" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                  <circle cx="24" cy="28" r="3" fill="#d1d5db" />
                </svg>
              </div>
              <p className="cart-empty__text">장바구니가 비어있습니다</p>
              <p className="cart-empty__hint">마음에 드는 교재를 담아보세요</p>
              <Link className="cart-empty__link" to="/">스토어 둘러보기</Link>
            </div>
          ) : (
            <div className="cart-layout">
              <div className="cart-list">
                <div className="cart-list__header">
                  <label className="cart-list__select-all">
                    <input
                      checked={allSelected}
                      onChange={handleToggleAll}
                      type="checkbox"
                    />
                    <span>전체선택 ({selectedIds.size}/{availableItems.length})</span>
                  </label>
                  <button
                    className="cart-list__delete-selected"
                    disabled={selectedIds.size === 0}
                    onClick={handleDeleteSelected}
                    type="button"
                  >
                    선택삭제
                  </button>
                </div>

                {items.map((item) => (
                  <CartItemRow
                    isSelected={selectedIds.has(item.id)}
                    item={item}
                    key={item.id}
                    onDelete={handleDelete}
                    onQuantityChange={handleQuantityChange}
                    onToggle={handleToggle}
                  />
                ))}
              </div>

              <div className="cart-summary">
                <div className="cart-summary__card">
                  <h2 className="cart-summary__title">주문 요약</h2>
                  <div className="cart-summary__row">
                    <span>상품금액</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="cart-summary__row">
                    <span>배송비</span>
                    <span>
                      {selectedItems.length === 0
                        ? "—"
                        : shippingFee === 0
                          ? "무료"
                          : formatCurrency(shippingFee)}
                    </span>
                  </div>
                  {shippingFee > 0 && (
                    <p className="cart-summary__shipping-hint">
                      {formatCurrency(FREE_SHIPPING_THRESHOLD - subtotal)} 더 담으면 무료배송
                    </p>
                  )}
                  <div className="cart-summary__divider" />
                  <div className="cart-summary__row cart-summary__row--total">
                    <span>총 결제금액</span>
                    <span>{formatCurrency(totalAmount)}</span>
                  </div>
                  <button
                    className="cart-summary__order-btn"
                    disabled={selectedItems.length === 0}
                    onClick={handleOrder}
                    type="button"
                  >
                    주문하기 ({selectedItems.length}개)
                  </button>
                </div>
              </div>
            </div>
          )}
        </ContentContainer>

        <PublicFooter />

        {toast && (
          <div className={`cart-toast cart-toast--${toast.type}`} role="alert">
            {toast.message}
          </div>
        )}
      </div>
    </PublicPageFrame>
  );
}

export default PublicCartPage;
