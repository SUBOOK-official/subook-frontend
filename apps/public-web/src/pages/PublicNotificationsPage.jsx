import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { usePageMeta } from "../lib/usePageMeta";
import "./PublicNotificationsPage.css";

const TYPE_ICONS = {
  pickup_accepted: "📦",
  arrived: "📥",
  inspection_done: "🔍",
  sold: "💰",
  settlement_done: "🏦",
  order_confirmed: "💳",
  shipping_started: "🚚",
  delivery_done: "📬",
  restock: "🔔",
};

// P1-6: 카테고리 필터 칩. 각 카테고리에 매핑되는 알림 type 집합 정의.
const CATEGORY_FILTERS = [
  { key: "all", label: "전체", types: null },
  { key: "pickup", label: "수거", types: ["pickup_accepted", "arrived"] },
  { key: "inspection", label: "검수", types: ["inspection_done"] },
  { key: "settlement", label: "정산", types: ["sold", "settlement_done"] },
  { key: "order", label: "주문", types: ["order_confirmed", "shipping_started", "delivery_done"] },
  { key: "restock", label: "재입고", types: ["restock"] },
];

const PAGE_SIZE = 30;

function formatRelativeTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function PublicNotificationsPage() {
  usePageMeta({
    title: "알림함",
    description: "수북 알림함 — 주문, 검수, 정산, 재입고 등 알림 모음.",
    noindex: true,
  });

  const navigate = useNavigate();
  const { isLoading: authLoading, hasSession, isAuthenticated } = usePublicAuth();

  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [categoryKey, setCategoryKey] = useState("all");

  const loadNotifications = useCallback(async ({ offset = 0, append = false } = {}) => {
    if (!isSupabaseConfigured || !supabase) {
      setIsLoading(false);
      return;
    }
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage("");
    const { data, error } = await supabase.rpc("list_my_notifications", {
      p_limit: PAGE_SIZE,
      p_offset: offset,
      p_unread_only: false,
    });
    if (error) {
      setErrorMessage(error.message || "알림을 불러오지 못했어요.");
      setHasMore(false);
    } else {
      const rows = Array.isArray(data) ? data : [];
      setItems((prev) => (append ? [...prev, ...rows] : rows));
      // 더 가져올 게 있는지 — PAGE_SIZE보다 적게 왔으면 끝.
      setHasMore(rows.length === PAGE_SIZE);
    }
    setIsLoading(false);
    setIsLoadingMore(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!hasSession) return;
    void loadNotifications({ offset: 0, append: false });
  }, [authLoading, hasSession, loadNotifications]);

  const handleLoadMore = () => {
    if (isLoadingMore || !hasMore) return;
    void loadNotifications({ offset: items.length, append: true });
  };

  const handleItemClick = async (item) => {
    if (!item.read_at && supabase) {
      // 비동기로 읽음 처리 (실패해도 이동은 진행)
      void supabase.rpc("mark_notification_read", { p_id: item.id });
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, read_at: new Date().toISOString() } : it)),
      );
    }
    if (item.ref_url) {
      if (item.ref_url.startsWith("/")) {
        navigate(item.ref_url);
      } else {
        window.location.assign(item.ref_url);
      }
    }
  };

  const handleMarkAllRead = async () => {
    if (!supabase) return;
    setBulkBusy(true);
    const { error } = await supabase.rpc("mark_all_notifications_read");
    setBulkBusy(false);
    if (error) {
      setErrorMessage(error.message || "처리에 실패했어요.");
      return;
    }
    const now = new Date().toISOString();
    setItems((prev) => prev.map((it) => ({ ...it, read_at: it.read_at ?? now })));
  };

  const filteredItems = useMemo(() => {
    const filter = CATEGORY_FILTERS.find((c) => c.key === categoryKey);
    if (!filter || !filter.types) return items;
    return items.filter((it) => filter.types.includes(it.type));
  }, [items, categoryKey]);

  if (!authLoading && !hasSession) {
    return <Navigate replace state={{ notice: "알림함을 보려면 로그인이 필요해요." }} to="/login" />;
  }
  if (!authLoading && hasSession && !isAuthenticated) {
    return <Navigate replace to="/" />;
  }

  const unreadCount = items.filter((it) => !it.read_at).length;

  return (
    <PublicPageFrame>
      <div className="public-faq-page">
        <PublicSiteHeader />

        <ContentContainer as="section" className="public-faq-route" aria-label="페이지 경로">
          <div className="public-faq-route__crumbs">
            <Link className="public-faq-route__crumb-link" to="/">
              홈
            </Link>
            <span aria-hidden="true">›</span>
            <span className="is-muted">알림함</span>
          </div>
        </ContentContainer>

        <ContentContainer as="section" className="public-faq-hero" aria-label="페이지 안내">
          <p className="public-faq-hero__eyebrow">NOTIFICATIONS</p>
          <h1 className="public-faq-hero__title">알림함</h1>
          <p className="public-faq-hero__subtitle">
            주문/검수/정산/재입고 등 활동 알림을 한 곳에서 확인하세요.
          </p>
        </ContentContainer>

        <ContentContainer as="section" className="public-faq-list" aria-label="알림 목록">
          {errorMessage ? (
            <p className="public-faq-list__count" role="alert">{errorMessage}</p>
          ) : null}

          {isLoading ? (
            <p className="public-faq-list__count">불러오는 중...</p>
          ) : items.length === 0 ? (
            <div className="public-notifications-empty">
              <p className="public-notifications-empty__icon" aria-hidden="true">🔔</p>
              <p className="public-faq-list__count">아직 받은 알림이 없어요.</p>
            </div>
          ) : (
            <>
              <div className="public-faq-list__toolbar">
                <span className="public-faq-list__count">
                  총 {items.length}건 {unreadCount > 0 ? `· 안 읽음 ${unreadCount}건` : ""}
                </span>
                {unreadCount > 0 ? (
                  <div className="public-faq-list__actions">
                    <button
                      className="public-faq-list__action"
                      disabled={bulkBusy}
                      onClick={handleMarkAllRead}
                      type="button"
                    >
                      {bulkBusy ? "처리 중..." : "모두 읽음 처리"}
                    </button>
                  </div>
                ) : null}
              </div>

              {/* P1-6: 카테고리 필터 */}
              <div className="public-notifications-filter" role="tablist" aria-label="알림 카테고리">
                {CATEGORY_FILTERS.map((filter) => (
                  <button
                    aria-selected={categoryKey === filter.key}
                    className={`public-notifications-filter__chip ${categoryKey === filter.key ? "is-active" : ""}`}
                    key={filter.key}
                    onClick={() => setCategoryKey(filter.key)}
                    role="tab"
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              {filteredItems.length === 0 ? (
                <div className="public-notifications-empty">
                  <p className="public-faq-list__count">선택한 카테고리에 알림이 없어요.</p>
                </div>
              ) : (
                <ul className="public-faq-list__items" role="list">
                  {filteredItems.map((item) => {
                    const icon = TYPE_ICONS[item.type] ?? "🔔";
                    const isUnread = !item.read_at;
                    return (
                      <li className="public-notifications-item" key={item.id}>
                        <button
                          className={`public-notifications-item__button ${isUnread ? "is-unread" : ""}`}
                          onClick={() => handleItemClick(item)}
                          type="button"
                        >
                          <div className="public-notifications-item__body">
                            <span aria-hidden="true" className="public-notifications-item__icon">
                              {icon}
                            </span>
                            <div className="public-notifications-item__content">
                              <div className="public-notifications-item__head">
                                <strong className={`public-notifications-item__title ${isUnread ? "is-unread" : ""}`}>
                                  {item.title}
                                </strong>
                                <span className="public-notifications-item__time">
                                  {formatRelativeTime(item.created_at)}
                                </span>
                              </div>
                              {item.body ? (
                                <p className="public-notifications-item__excerpt">{item.body}</p>
                              ) : null}
                            </div>
                            {isUnread ? (
                              <span aria-label="안 읽음" className="public-notifications-item__dot" />
                            ) : null}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* P1-6: 더 보기 버튼 (30건씩 페이지네이션).
                  필터는 클라이언트에서만 적용되므로, 받아온 페이지에 해당 카테고리가
                  0건이어도 뒤 페이지에 있을 수 있다 — filteredItems가 아닌 items 기준. */}
              {hasMore && items.length > 0 ? (
                <button
                  className="public-notifications-loadmore"
                  disabled={isLoadingMore}
                  onClick={handleLoadMore}
                  type="button"
                >
                  {isLoadingMore ? "불러오는 중..." : "더 보기"}
                </button>
              ) : null}
            </>
          )}
        </ContentContainer>

        <PublicFooter />
      </div>
    </PublicPageFrame>
  );
}

export default PublicNotificationsPage;
