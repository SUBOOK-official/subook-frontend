import { useEffect, useRef, useState } from "react";
import { getCheckoutBookPricing } from "@shared-supabase/curatedContentClient";
import { getRecommendationOptions, isCheckoutBookAvailable } from "../lib/checkoutRecommendations";
import { getThumbnailImageUrl } from "../lib/storageImage";
import { trackSelectItem, trackViewItemList } from "../lib/analytics";
import { useInViewOnce } from "../lib/useInViewOnce";
import { fetchStorefrontProducts, fetchStorefrontProductDetail } from "../lib/storefront";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import { rankPersonalizedProducts } from "@shared-domain/recommendations";
import { FREE_SHIPPING_THRESHOLD } from "../lib/cart";
import "./home/UiFirstUpdate.css";

export default function CheckoutRecommendations({ items, onAdd, disabled = false, onBusyChange }) {
  const subtotal = items.reduce((sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 1), 0);
  const remainingForFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const listRef = useRef(null);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useInViewOnce(listRef, () => trackViewItemList("주문 추천", products.slice(0, expanded ? products.length : 3).map((product, index) => ({ ...product, productId: product.id, index }))), { enabled: !loading && products.length > 0, resetKey: `${refreshIndex}:${expanded}` });
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(""); setExpanded(false); setSelected({});
    const ids = new Set(items.map((item) => String(item.productId)));
    (async () => {
      const sources = await Promise.all([...ids].filter((id) => id !== "undefined").slice(0, 8).map((id) => fetchStorefrontProductDetail(id)));
      const signals = sources.map((entry) => entry.product).filter(Boolean);
      const subjects = [...new Set(signals.map((product) => product.subject).filter(Boolean))];
      const groups = await Promise.all(subjects.map((subject) => fetchStorefrontProducts({ subject, sort: "popular", limit: 24 })));
      const unique = [...new Map(groups.flatMap((group) => group.products).map((product) => [String(product.id), product])).values()];
      const ranked = rankPersonalizedProducts(unique, signals, [...ids]);
      const offset = ranked.length ? (refreshIndex * 3) % ranked.length : 0;
      const candidates = [...ranked.slice(offset), ...ranked.slice(0, offset)].slice(0, 8);
      const detailed = await Promise.all(candidates.map((product) => fetchStorefrontProductDetail(product.id)));
      if (!cancelled) setProducts(detailed.map((item) => item.product).filter(Boolean));
    })().catch(() => { if (!cancelled) setError("추천 교재를 불러오지 못했어요. 주문은 계속 진행하실 수 있어요."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // Snapshot the basket on initial load and explicit refresh; additions keep the current suggestions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshIndex]);
  async function add(product, option) {
    if (busyRef.current || disabled || !option || items.some((item) => String(item.bookId) === String(option.id))) return;
    busyRef.current = true;
    setBusy(true); onBusyChange?.(true); setError("");
    try {
      const data = await getCheckoutBookPricing(supabase, [option.id]);
      const fresh = data?.find((row) => String(row.id) === String(option.id));
      if (!isCheckoutBookAvailable(fresh)) throw new Error("재고·가격을 확인할 수 없는 교재입니다. 다른 교재를 선택해주세요.");
      if (!mountedRef.current) return;
      onAdd({ bookId: option.id, productId: product.id, title: product.title, optionLabel: option.option, conditionGrade: option.conditionGrade, coverImageUrl: option.coverImageUrl || product.coverImageUrl, price: Number(fresh.price), originalPrice: option.originalPrice, quantity: 1, isRecommendation: true });
    } catch (failure) { if (mountedRef.current) setError(failure.message); }
    finally { busyRef.current = false; if (mountedRef.current) { setBusy(false); onBusyChange?.(false); } }
  }
  if (!loading && !error && !products.length) return null;
  return <section className="checkout-similar" aria-labelledby="checkout-similar-title">
    <div className="checkout-similar__heading"><h2 id="checkout-similar-title" aria-live="polite">{remainingForFreeShipping > 0 ? `${remainingForFreeShipping.toLocaleString("ko-KR")}원 이상 담으면 무료배송이에요` : "함께 보면 좋아요"}</h2>
      <button type="button" className="checkout-similar__refresh" aria-label="추천 교재 새로고침" title="다른 추천 교재 보기" disabled={loading || busy || disabled} onClick={() => setRefreshIndex((current) => current + 1)}>
        <svg className={loading ? "is-loading" : undefined} xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 12C22 17.5228 17.5229 22 12 22C6.4772 22 2 17.5228 2 12C2 6.47715 6.4772 2 12 2V4C7.5817 4 4 7.58172 4 12C4 16.4183 7.5817 20 12 20C16.4183 20 20 16.4183 20 12C20 9.53614 18.8862 7.33243 17.1346 5.86492L15 8V2L21 2L18.5535 4.44656C20.6649 6.28002 22 8.9841 22 12Z" /></svg>
      </button>
    </div>
    <p className="checkout-similar__hint">주문한 교재와 과목·유형이 비슷한 교재를 골랐어요.</p>
    {loading && <p role="status">추천 교재를 불러오는 중…</p>}
    {error && <p role="alert">{error}</p>}
    <div className="checkout-similar__list" ref={listRef}>
      {products.slice(0, expanded ? products.length : 3).map((product) => {
        const options = getRecommendationOptions(product.options);
        const option = options.find((item) => String(item.id) === selected[product.id]) ?? options[0];
        const added = items.some((item) => String(item.bookId) === String(option?.id));
        return <div className="checkout-similar__item" key={product.id}>
          {product.coverImageUrl && <a className="checkout-similar__cover-link" href={`/store/${product.id}`} target="_blank" rel="noopener noreferrer" onClick={() => trackSelectItem("주문 추천", { ...product, productId: product.id })} aria-label={`${product.title} 상세 보기 (새 탭)`}><img src={getThumbnailImageUrl(product.coverImageUrl)} alt="" loading="lazy" /></a>}
          <div className="checkout-similar__info"><a className="checkout-similar__title-link" href={`/store/${product.id}`} target="_blank" rel="noopener noreferrer" onClick={() => trackSelectItem("주문 추천", { ...product, productId: product.id })} aria-label={`${product.title} 상세 보기 (새 탭)`}><strong>{product.title}</strong></a>
            <span>{option?.price?.toLocaleString()}원</span>
            {options.length > 1 && <select disabled={busy || disabled} aria-label={`${product.title} 옵션`} value={option?.id ?? ""} onChange={(event) => setSelected((current) => ({ ...current, [product.id]: event.target.value }))}>{options.map((item) => <option key={item.id} value={item.id}>{[item.option, item.conditionGradeLabel || item.conditionGrade].filter(Boolean).join(" · ")} · {item.price?.toLocaleString()}원</option>)}</select>}
          </div>
          <button className="checkout-similar__add" type="button" aria-label={`${product.title} ${added ? "추가됨" : "추가"}`} disabled={disabled || loading || busy || added || !option} onClick={() => add(product, option)}>{added ? "✓" : "+"}</button>
        </div>;
      })}
      {products.length > 3 && <button className="checkout-similar__more" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><span>{expanded ? "접기" : "더보기"}</span><svg className={expanded ? "is-expanded" : undefined} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.9999 13.1714L16.9497 8.22168L18.3639 9.63589L11.9999 15.9999L5.63599 9.63589L7.0502 8.22168L11.9999 13.1714Z" /></svg></button>}
    </div>
    <span className="checkout-similar__hint" role="status">{busy ? "교재 가격과 재고를 확인하고 있어요." : ""}</span>
  </section>;
}
