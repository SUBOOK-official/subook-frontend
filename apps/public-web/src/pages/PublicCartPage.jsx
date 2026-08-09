import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatCurrency } from "@shared-domain/format";
import ContentContainer from "../components/ContentContainer";
import { CartIcon } from "../components/icons";
import PublicFooter from "../components/PublicFooter";
import PublicMemberGateDialog from "../components/PublicMemberGateDialog";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { usePublicWishlist } from "../contexts/PublicWishlistContext";
import { trackAddToCart, trackRemoveFromCart, trackViewCart } from "../lib/analytics";
import { usePageMeta } from "../lib/usePageMeta";
import { getAddableBooks, groupCartItems, normalizeCartGrade } from "../lib/cartItemGroups";
import { fetchStorefrontProductDetail } from "../lib/storefront";
import { getThumbnailImageUrl } from "../lib/storageImage";
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

// cart_item 한 건 → GA4 items 라인 (analytics.js toGaItem 입력 형태)
function cartItemToAnalyticsLine(item) {
  return {
    productId: item.product_id,
    title: item.title,
    brand: item.brand,
    subject: item.subject,
    optionLabel: item.option_label,
    conditionGrade: item.condition_grade,
    price: item.price,
    quantity: 1,
  };
}

// productMeta — 삭제 되돌리기/되살리기 시 add_to_cart에 넘길 메타. cart_item 한 건에서 추출.
function cartItemToProductMeta(item) {
  return {
    title: item.title,
    subject: item.subject,
    brand: item.brand,
    optionLabel: item.option_label,
    conditionGrade: item.condition_grade,
    coverImageUrl: item.cover_image_url,
    price: item.price,
  };
}

// 단일재고 모델: 같은 회차·등급의 책 N권을 한 줄(수량 N)로 보여준다.
// 수량 −/+는 cart_item(book_id)을 삭제/추가하는 방식. (한 book_id의 quantity는 항상 1)
function CartGroupRow({ group, isSelected, canIncrease, busy, onToggle, onIncrease, onDecrease, onDelete }) {
  const metaText = [group.representative?.subject, group.representative?.brand, group.optionLabel, group.representative?.condition_grade]
    .filter(Boolean)
    .join(" · ");
  const isCheckboxDisabled = group.isSoldOut || group.isPriceMissing;

  return (
    <div
      className={`cart-item${group.isSoldOut ? " cart-item--sold-out" : ""}${
        group.isPriceMissing && !group.isSoldOut ? " cart-item--price-missing" : ""
      }`}
    >
      <div className="cart-item__check">
        <input
          aria-label={`${group.representative?.title ?? "상품"} ${group.optionLabel ?? ""} 선택`}
          checked={isSelected}
          disabled={isCheckboxDisabled}
          onChange={() => onToggle(group)}
          type="checkbox"
        />
      </div>

      <div className="cart-item__image">
        {group.representative?.cover_image_url ? (
          <img alt={group.representative.title} loading="lazy" src={getThumbnailImageUrl(group.representative.cover_image_url)} />
        ) : (
          <div className="cart-item__image-placeholder">SUBOOK</div>
        )}
      </div>

      <div className="cart-item__info">
        <Link
          className="cart-item__title"
          to={`/store/${group.productId || group.representative?.book_id}`}
        >
          {group.representative?.title}
        </Link>
        <div className="cart-item__meta">{metaText}</div>
        {group.isSoldOut && <span className="cart-item__sold-out-badge">품절</span>}
        {group.isPriceMissing && !group.isSoldOut && (
          <span className="cart-item__sold-out-badge">가격 확인 중</span>
        )}

        <div className="cart-item__price-mobile">
          {!group.isPriceMissing ? formatCurrency(group.lineTotal) : "가격 미등록"}
        </div>

        <div className="cart-item__actions">
          {group.count > 0 && !group.isPriceMissing ? (
            <div className="cart-item__qty">
              <button
                aria-label="수량 줄이기"
                className="cart-item__qty-btn"
                disabled={group.count <= 1 || busy}
                onClick={() => onDecrease(group)}
                type="button"
              >
                −
              </button>
              <span className="cart-item__qty-value" aria-live="polite">
                {group.count}
              </span>
              <button
                aria-label="수량 늘리기"
                className="cart-item__qty-btn"
                disabled={!canIncrease || busy}
                onClick={() => onIncrease(group)}
                type="button"
              >
                +
              </button>
            </div>
          ) : null}
          <button
            className="cart-item__delete-btn"
            disabled={busy}
            onClick={() => onDelete(group)}
            type="button"
          >
            삭제
          </button>
        </div>
      </div>

      <div className="cart-item__price-col">
        <span className="cart-item__line-total">
          {!group.isPriceMissing ? formatCurrency(group.lineTotal) : "—"}
        </span>
        {group.count > 1 && !group.isPriceMissing ? (
          <span className="cart-item__unit-note">개당 {formatCurrency(group.unitPrice)}</span>
        ) : null}
      </div>
    </div>
  );
}

function PublicCartPage() {
  usePageMeta({ title: "장바구니", noindex: true });

  const { isAuthenticated, isLoading: authLoading } = usePublicAuth();
  const { favoriteCount } = usePublicWishlist();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  // 회차별 추가 가능 재고 판단용: productId(string) → 재고 있는 옵션 book 목록.
  const [stockMap, setStockMap] = useState(new Map());
  // 수량 변경 중인 그룹 key — 더블클릭/경쟁 방지로 해당 그룹 버튼 비활성.
  const [busyGroupKeys, setBusyGroupKeys] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState(null);
  // 비로그인 진입 시 갑작스러운 /login 점프 대신 dialog로 맥락 안내 (codex UX 감사 권고).
  const [isMemberGateOpen, setIsMemberGateOpen] = useState(false);

  const showToast = useCallback((message, type = "info", options = null) => {
    setToast({ message, type, options });
    const duration = options?.onAction ? 5000 : 3000;
    setTimeout(() => setToast(null), duration);
  }, []);

  const groups = useMemo(() => groupCartItems(items), [items]);

  // 회차별 재고(추가 가능 여부)를 위해 장바구니에 담긴 상품들의 상세를 받아 재고 book을 모은다.
  // 내 장바구니 add/remove로는 books.status가 안 바뀌므로, 초기 1회만 받아 두고 재사용한다.
  const loadStockMap = useCallback(async (cartItems) => {
    const productIds = [
      ...new Set((cartItems ?? []).map((item) => item.product_id).filter((id) => id !== null && id !== undefined)),
    ];
    const entries = await Promise.all(
      productIds.map(async (productId) => {
        try {
          const detail = await fetchStorefrontProductDetail(productId);
          const options = detail?.product?.options ?? [];
          const inStock = options
            .filter((option) => !option.isSoldOut && option.id !== null && option.id !== undefined)
            .map((option) => ({
              bookId: option.id,
              option: option.option ?? "",
              grade: normalizeCartGrade(option.conditionGrade),
              price: option.price ?? null,
            }));
          return [String(productId), inStock];
        } catch {
          return [String(productId), []];
        }
      }),
    );
    return new Map(entries);
  }, []);

  // GA4 view_cart — 페이지 방문당 1회 (되돌리기 등으로 loadCart가 재실행돼도 재발화 금지)
  const viewCartTrackedRef = useRef(false);

  const loadCart = useCallback(async () => {
    setIsLoading(true);
    const { items: cartItems, error } = await getCartItems();
    setItems(cartItems);

    if (!error && !viewCartTrackedRef.current && cartItems.length > 0) {
      viewCartTrackedRef.current = true;
      trackViewCart(cartItems.map(cartItemToAnalyticsLine));
    }

    // P1-3: 주문 페이지 뒤로가기 시 selection 복원. 살아 있는 구매가능 item만 추려 복원.
    const availableIdsArr = cartItems
      .filter((i) => !i.is_sold_out && i.price !== null && i.price !== undefined)
      .map((i) => i.id);
    const availableIdSet = new Set(availableIdsArr);
    const persisted = readPersistedCartSelection();
    if (persisted && persisted.length > 0) {
      const restored = persisted
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && availableIdSet.has(id));
      setSelectedIds(restored.length > 0 ? new Set(restored) : new Set(availableIdsArr));
    } else {
      setSelectedIds(new Set(availableIdsArr));
    }

    if (error) {
      showToast("장바구니를 불러오지 못했습니다.", "error");
    }
    setIsLoading(false);

    // 재고 맵은 백그라운드로 — 받기 전엔 "+"가 잠시 비활성(재고 미확인).
    const nextStockMap = await loadStockMap(cartItems);
    setStockMap(nextStockMap);
  }, [showToast, loadStockMap]);

  // P1-3: 선택 변경 시 sessionStorage에 영속화 (mount 직후 빈 Set은 skip).
  useEffect(() => {
    if (isLoading) return;
    persistCartSelection(selectedIds);
  }, [selectedIds, isLoading]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setIsMemberGateOpen(true);
      return;
    }
    setIsMemberGateOpen(false);
    void loadCart();
  }, [authLoading, isAuthenticated, loadCart]);

  const handleMemberGateClose = () => {
    setIsMemberGateOpen(false);
    navigate("/");
  };
  const handleMemberGateLogin = () => {
    setIsMemberGateOpen(false);
    navigate("/login", { state: { from: { pathname: "/cart" } } });
  };
  const handleMemberGateSignup = () => {
    setIsMemberGateOpen(false);
    navigate("/signup", { state: { from: { pathname: "/cart" } } });
  };

  // ── 선택(그룹 단위) ────────────────────────────────────────────
  const selectableGroups = useMemo(
    () => groups.filter((group) => group.count > 0 && !group.isPriceMissing),
    [groups],
  );
  const isGroupSelected = useCallback(
    (group) => group.count > 0 && group.purchasableItemIds.every((id) => selectedIds.has(id)),
    [selectedIds],
  );
  const selectedGroupCount = useMemo(
    () => selectableGroups.filter((group) => isGroupSelected(group)).length,
    [selectableGroups, isGroupSelected],
  );
  const allSelected = selectableGroups.length > 0 && selectedGroupCount === selectableGroups.length;

  const handleToggleGroup = (group) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const selected = group.count > 0 && group.purchasableItemIds.every((id) => next.has(id));
      group.purchasableItemIds.forEach((id) => (selected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const handleToggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    const next = new Set();
    selectableGroups.forEach((group) => group.purchasableItemIds.forEach((id) => next.add(id)));
    setSelectedIds(next);
  };

  // ── 수량 −/+ (단일재고: book_id 삭제/추가) ─────────────────────
  const setGroupBusy = (key, busy) => {
    setBusyGroupKeys((prev) => {
      const next = new Set(prev);
      if (busy) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const getGroupAddable = useCallback(
    (group) => {
      const stock = stockMap.get(String(group.productId)) ?? [];
      const cartBookIds = items
        .filter((item) => String(item.product_id) === String(group.productId))
        .map((item) => item.book_id);
      return getAddableBooks(group, stock, cartBookIds);
    },
    [stockMap, items],
  );

  const handleDecrease = async (group) => {
    if (busyGroupKeys.has(group.key) || group.count <= 1) return;
    const target = group.purchasableItems[group.purchasableItems.length - 1];
    if (!target) return;
    setGroupBusy(group.key, true);
    const { error } = await deleteCartItem(target.id);
    setGroupBusy(group.key, false);
    if (error) {
      showToast("수량을 줄이지 못했어요. 잠시 후 다시 시도해 주세요.", "error");
      return;
    }
    trackRemoveFromCart([cartItemToAnalyticsLine(target)]);
    setItems((prev) => prev.filter((item) => item.id !== target.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(target.id);
      return next;
    });
  };

  const handleIncrease = async (group) => {
    if (busyGroupKeys.has(group.key)) return;
    const addable = getGroupAddable(group);
    if (addable.length === 0) {
      showToast("이 옵션은 더 담을 재고가 없어요.", "info");
      return;
    }
    const addBook = addable[0];
    const rep = group.representative;
    const wasSelected = isGroupSelected(group);
    setGroupBusy(group.key, true);
    const { data, error } = await addToCart({
      bookId: addBook.bookId,
      productId: group.productId,
      quantity: 1,
      productMeta: {
        title: rep?.title,
        subject: rep?.subject,
        brand: rep?.brand,
        optionLabel: rep?.option_label,
        conditionGrade: rep?.condition_grade,
        coverImageUrl: rep?.cover_image_url,
        price: addBook.price ?? rep?.price,
      },
    });
    setGroupBusy(group.key, false);
    if (error) {
      showToast("수량을 늘리지 못했어요. 잠시 후 다시 시도해 주세요.", "error");
      return;
    }
    const newId = data?.cart_item_id;
    if (newId === null || newId === undefined) {
      // 신규 cart_item id를 못 받으면 정확한 동기화를 위해 전체 새로고침으로 폴백.
      await loadCart();
      return;
    }
    const newItem = {
      id: newId,
      book_id: addBook.bookId,
      product_id: group.productId,
      quantity: 1,
      title: rep?.title,
      option_label: rep?.option_label,
      subject: rep?.subject,
      brand: rep?.brand,
      condition_grade: rep?.condition_grade,
      price: addBook.price ?? rep?.price ?? null,
      original_price: rep?.original_price ?? null,
      cover_image_url: rep?.cover_image_url ?? null,
      stock_count: rep?.stock_count,
      is_sold_out: false,
      created_at: rep?.created_at ?? null,
    };
    trackAddToCart([cartItemToAnalyticsLine(newItem)]);
    setItems((prev) => [...prev, newItem]);
    if (wasSelected) {
      setSelectedIds((prev) => new Set(prev).add(newId));
    }
  };

  // ── 삭제(그룹 전체) + 되돌리기 ─────────────────────────────────
  const handleDeleteGroup = async (group) => {
    const ids = group.allItemIds;
    const snapshot = group.items;
    const selectedSnapshot = ids.filter((id) => selectedIds.has(id));
    const { error } = await deleteCartItems(ids);
    if (error) {
      showToast("삭제에 실패했습니다.", "error");
      return;
    }
    trackRemoveFromCart(snapshot.map(cartItemToAnalyticsLine));
    setItems((prev) => prev.filter((item) => !ids.includes(item.id)));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    const label = group.optionLabel ? `${group.optionLabel} ` : "";
    showToast(`${label}${snapshot.length}권을 삭제했어요.`, "info", {
      actionLabel: "되돌리기",
      onAction: async () => {
        let failed = 0;
        const restored = [];
        for (const item of snapshot) {
          // book_id로 정확히 같은 권 복구 (product_id만 넘기면 bookId 누락→데모 카트로 샘).
          const { error: restoreError } = await addToCart({
            bookId: item.book_id,
            productId: item.product_id,
            quantity: 1,
            productMeta: cartItemToProductMeta(item),
          });
          if (restoreError) failed += 1;
          else restored.push(item);
        }
        trackAddToCart(restored.map(cartItemToAnalyticsLine));
        await loadCart();
        if (selectedSnapshot.length > 0) {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            selectedSnapshot.forEach((id) => next.add(id));
            return next;
          });
        }
        showToast(
          failed === 0
            ? `${snapshot.length}권을 다시 담았어요.`
            : `${snapshot.length - failed}권 다시 담았어요. ${failed}권은 재고가 변경됐어요.`,
        );
      },
    });
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
    trackRemoveFromCart(snapshot.map(cartItemToAnalyticsLine));
    setItems((prev) => prev.filter((item) => !selectedIds.has(item.id)));
    setSelectedIds(new Set());
    showToast(`${ids.length}개 상품이 삭제되었습니다.`, "info", {
      actionLabel: "되돌리기",
      onAction: async () => {
        let failed = 0;
        const restored = [];
        for (const item of snapshot) {
          const { error: restoreError } = await addToCart({
            bookId: item.book_id,
            productId: item.product_id,
            quantity: 1,
            productMeta: cartItemToProductMeta(item),
          });
          if (restoreError) failed += 1;
          else restored.push(item);
        }
        trackAddToCart(restored.map(cartItemToAnalyticsLine));
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
    const orderItems = items.filter(
      (i) => selectedIds.has(i.id) && !i.is_sold_out && i.price !== null && i.price !== undefined,
    );
    if (orderItems.length === 0) {
      showToast("주문할 상품을 선택해주세요.", "error");
      return;
    }
    const orderPayload = orderItems.map((i) => ({
      bookId: i.book_id,
      productId: i.product_id,
      quantity: 1,
      title: i.title,
      optionLabel: i.option_label,
      conditionGrade: i.condition_grade,
      coverImageUrl: i.cover_image_url,
      price: i.price,
      originalPrice: i.original_price ?? null,
    }));
    navigate("/order", { state: { items: orderPayload } });
  };

  // ── 합계(선택된 구매가능 item 기준) ────────────────────────────
  const selectedItems = items.filter(
    (i) => selectedIds.has(i.id) && !i.is_sold_out && i.price !== null && i.price !== undefined,
  );
  const subtotal = selectedItems.reduce((sum, i) => sum + (i.price ?? 0), 0);
  const shippingFee = selectedItems.length > 0 ? calculateShippingFee(subtotal) : 0;
  const totalAmount = subtotal + shippingFee;

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
                <CartIcon size={48} />
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
                    <span>전체선택 ({selectedGroupCount}/{selectableGroups.length})</span>
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

                {groups.map((group) => (
                  <CartGroupRow
                    busy={busyGroupKeys.has(group.key)}
                    canIncrease={getGroupAddable(group).length > 0}
                    group={group}
                    isSelected={isGroupSelected(group)}
                    key={group.key}
                    onDecrease={handleDecrease}
                    onDelete={handleDeleteGroup}
                    onIncrease={handleIncrease}
                    onToggle={handleToggleGroup}
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
      <PublicMemberGateDialog
        gateReason="cartPage"
        onClose={handleMemberGateClose}
        onLogin={handleMemberGateLogin}
        onSignup={handleMemberGateSignup}
        open={isMemberGateOpen}
      />
    </PublicPageFrame>
  );
}

export default PublicCartPage;
