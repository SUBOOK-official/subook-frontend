import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatCurrency } from "@shared-domain/format";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { usePublicWishlist } from "../contexts/PublicWishlistContext";
import {
  FREE_SHIPPING_THRESHOLD,
  addToCart,
  calculateShippingFee,
  deleteCartItem,
  deleteCartItems,
  getCartItems,
} from "../lib/cart";
import "./PublicCartPage.css";

// P1-3: 장바구니 → 주문 → 뒤로가기 시 selection 보존용 sessionStorage 키
const CART_SELECTION_STORAGE_KEY = "subook.cart.selection.v1";
// P2-3: 가격 미등록 24시간 이상이면 사용자가 해당 line을 삭제할 수 있게 표시
const STALE_PRICE_MS = 24 * 60 * 60 * 1000;

function readPersistedCartSelection() {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(CART_SELECTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

function persistCartSelection(ids) {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(
      CART_SELECTION_STORAGE_KEY,
      JSON.stringify(Array.from(ids).map(String)),
    );
  } catch {
    // ignore
  }
}

function isStalePriceMissing(item) {
  if (item.price !== null && item.price !== undefined) return false;
  const createdAtRaw = item.created_at ?? item.createdAt;
  if (!createdAtRaw) return false;
  const createdAt = new Date(createdAtRaw).getTime();
  if (!Number.isFinite(createdAt)) return false;
  return Date.now() - createdAt >= STALE_PRICE_MS;
}

function CartItemRow({ item, isSelected, onToggle, onDelete }) {
  const [updating, setUpdating] = useState(false);

  const handleDelete = async () => {
    setUpdating(true);
    await onDelete(item.id);
  };

  // 단일재고 정책: 권당 1권 고정 (S·A+ 모두). quantity stepper 미노출.
  const lineTotal = (item.price ?? 0) * item.quantity;
  const isPriceMissing = item.price === null || item.price === undefined;
  const isCheckboxDisabled = item.is_sold_out || isPriceMissing;
  // P2-3: 가격 미등록 24시간 이상 → 사용자가 직접 삭제할 수 있게 라벨 분리
  const isStaleMissing = isPriceMissing && !item.is_sold_out && isStalePriceMissing(item);

  return (
    <div
      className={`cart-item${item.is_sold_out ? " cart-item--sold-out" : ""}${
        isPriceMissing && !item.is_sold_out ? " cart-item--price-missing" : ""
      }`}
    >
      <div className="cart-item__check">
        <input
          aria-label={`${item.title} 선택`}
          checked={isSelected}
          disabled={isCheckboxDisabled}
          onChange={() => onToggle(item.id)}
          type="checkbox"
        />
      </div>

      <div className="cart-item__image">
        {item.cover_image_url ? (
          <img alt={item.title} loading="lazy" src={item.cover_image_url} />
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
        {isPriceMissing && !item.is_sold_out && !isStaleMissing && (
          <span className="cart-item__sold-out-badge">가격 확인 중</span>
        )}
        {isStaleMissing && (
          <span className="cart-item__sold-out-badge cart-item__sold-out-badge--stale">
            가격 등록이 지연되고 있어요
          </span>
        )}

        <div className="cart-item__price-mobile">
          {!isPriceMissing ? formatCurrency(item.price) : "가격 미등록"}
        </div>

        <div className="cart-item__actions">
          <span className="cart-item__qty-fixed">1권</span>
          <button
            className="cart-item__delete-btn"
            disabled={updating}
            onClick={handleDelete}
            type="button"
          >
            {isStaleMissing ? "삭제하기" : "삭제"}
          </button>
        </div>
      </div>

      <div className="cart-item__price-col">
        <span className="cart-item__unit-price">
          {!isPriceMissing ? formatCurrency(item.price) : "—"}
        </span>
        <span className="cart-item__line-total">
          {!isPriceMissing ? formatCurrency(lineTotal) : "—"}
        </span>
      </div>
    </div>
  );
}

function PublicCartPage() {
  const { isAuthenticated, isLoading: authLoading } = usePublicAuth();
  const { favoriteCount } = usePublicWishlist();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = "info", options = null) => {
    setToast({ message, type, options });
    // action 있는 토스트는 사용자에게 누를 시간이 더 필요 — 5초
    const duration = options?.onAction ? 5000 : 3000;
    setTimeout(() => setToast(null), duration);
  }, []);

  const loadCart = useCallback(async () => {
    setIsLoading(true);
    const { items: cartItems, error } = await getCartItems();
    setItems(cartItems);

    // P1-3: 주문 페이지에서 뒤로가기 시 selection 복원. sessionStorage에서 읽어와
    // 현재 카트에 살아 있는 item만 추려 다시 선택. 없으면 기본(available 전체).
    const cartItemIds = new Set(cartItems.map((i) => String(i.id)));
    const availableIdsArr = cartItems.filter((i) => !i.is_sold_out).map((i) => String(i.id));
    const persisted = readPersistedCartSelection();
    if (persisted && persisted.length > 0) {
      const restored = persisted.filter((id) => cartItemIds.has(id));
      if (restored.length > 0) {
        setSelectedIds(new Set(restored));
      } else {
        setSelectedIds(new Set(availableIdsArr));
      }
    } else {
      setSelectedIds(new Set(availableIdsArr));
    }

    if (error) {
      showToast("장바구니를 불러오지 못했습니다.", "error");
    }
    setIsLoading(false);
  }, [showToast]);

  // P1-3: 선택 변경 시 sessionStorage에 영속화 (mount 직후 빈 Set은 skip).
  useEffect(() => {
    if (isLoading) return;
    persistCartSelection(selectedIds);
  }, [selectedIds, isLoading]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      // location 객체 형식으로 통일 — 로그인 후 search/hash까지 보존.
      navigate("/login", { state: { from: { pathname: "/cart" } } });
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
    const availableItems = items.filter(
      (i) => !i.is_sold_out && i.price !== null && i.price !== undefined,
    );
    if (selectedIds.size === availableItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(availableItems.map((i) => i.id)));
    }
  };

  const handleDelete = async (id) => {
    const target = items.find((item) => item.id === id);
    const wasSelected = selectedIds.has(id);
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
    if (target) {
      // 5초 안에 되돌리기 가능. 실수로 누른 경우 복구 동선.
      showToast("삭제되었습니다.", "info", {
        actionLabel: "되돌리기",
        onAction: async () => {
          const { error: restoreError } = await addToCart({
            productId: target.product_id,
            quantity: target.quantity ?? 1,
          });
          if (restoreError) {
            showToast("되돌리기에 실패했어요. 다시 담아주세요.", "error");
            return;
          }
          if (wasSelected) {
            setSelectedIds((prev) => new Set(prev).add(target.id));
          }
          await loadCart();
          showToast("다시 담았어요.");
        },
      });
    } else {
      showToast("삭제되었습니다.");
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const snapshot = items.filter((item) => selectedIds.has(item.id));
    const { error } = await deleteCartItems(ids);
    if (error) {
      showToast("삭제에 실패했습니다.", "error");
      return;
    }
    setItems((prev) => prev.filter((item) => !selectedIds.has(item.id)));
    setSelectedIds(new Set());
    showToast(`${ids.length}개 상품이 삭제되었습니다.`, "info", {
      actionLabel: "되돌리기",
      onAction: async () => {
        let failed = 0;
        for (const item of snapshot) {
          const { error: restoreError } = await addToCart({
            productId: item.product_id,
            quantity: item.quantity ?? 1,
          });
          if (restoreError) failed += 1;
        }
        if (failed === snapshot.length) {
          showToast("되돌리기에 실패했어요. 다시 담아주세요.", "error");
          return;
        }
        setSelectedIds(new Set(snapshot.map((item) => item.id)));
        await loadCart();
        showToast(
          failed === 0
            ? `${snapshot.length}개 상품을 다시 담았어요.`
            : `${snapshot.length - failed}개 다시 담았어요. ${failed}개는 재고가 변경됐어요.`,
        );
      },
    });
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

  const selectedItems = items.filter(
    (i) =>
      selectedIds.has(i.id) && !i.is_sold_out && i.price !== null && i.price !== undefined,
  );
  const subtotal = selectedItems.reduce(
    (sum, i) => sum + (i.price ?? 0) * i.quantity,
    0,
  );
  const shippingFee = selectedItems.length > 0 ? calculateShippingFee(subtotal) : 0;
  const totalAmount = subtotal + shippingFee;
  const availableItems = items.filter(
    (i) => !i.is_sold_out && i.price !== null && i.price !== undefined,
  );
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
              <div className="cart-empty__actions">
                <Link className="cart-empty__link" to="/">스토어 둘러보기</Link>
                {favoriteCount > 0 ? (
                  <Link className="cart-empty__link cart-empty__link--secondary" to="/mypage#wishlist">
                    찜한 교재 {favoriteCount}개 보기
                  </Link>
                ) : null}
              </div>
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
            <span className="cart-toast__message">{toast.message}</span>
            {toast.options?.actionLabel && toast.options?.onAction ? (
              <button
                className="cart-toast__action"
                onClick={() => {
                  const action = toast.options.onAction;
                  setToast(null);
                  action();
                }}
                type="button"
              >
                {toast.options.actionLabel}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </PublicPageFrame>
  );
}

export default PublicCartPage;
