import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { usePageMeta } from "../lib/usePageMeta";

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
  const [errorMessage, setErrorMessage] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage("");
    const { data, error } = await supabase.rpc("list_my_notifications", {
      p_limit: 100,
      p_offset: 0,
      p_unread_only: false,
    });
    if (error) {
      setErrorMessage(error.message || "알림을 불러오지 못했어요.");
    } else {
      setItems(Array.isArray(data) ? data : []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!hasSession) return;
    void loadNotifications();
  }, [authLoading, hasSession, loadNotifications]);

  const handleItemClick = async (item) => {
    if (!item.read_at && supabase) {
      // 비동기로 읽음 처리 (실패해도 이동은 진행)
      void supabase.rpc("mark_notification_read", { p_id: item.id });
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, read_at: new Date().toISOString() } : it)),
      );
    }
    if (item.ref_url) {
      // hash 포함 절대/상대 처리
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

  if (!authLoading && !hasSession) {
    return <Navigate replace state={{ notice: "알림함을 보려면 로그인이 필요해요." }} to="/login" />;
  }
  if (!authLoading && hasSession && !isAuthenticated) {
    // 약관 미동의 등의 경우 — 다른 가드에서 처리됨, 안전망
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
            <div style={{ padding: "48px 0", textAlign: "center" }}>
              <p style={{ fontSize: 40, marginBottom: 12 }} aria-hidden="true">🔔</p>
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

              <ul className="public-faq-list__items" role="list" style={{ marginTop: 12 }}>
                {items.map((item) => {
                  const icon = TYPE_ICONS[item.type] ?? "🔔";
                  const isUnread = !item.read_at;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => handleItemClick(item)}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "16px 20px",
                          marginBottom: 8,
                          borderRadius: 12,
                          border: `1px solid ${isUnread ? "#DBEAFE" : "#E5E7EB"}`,
                          background: isUnread ? "#EFF6FF" : "#FFFFFF",
                          cursor: "pointer",
                          transition: "background 0.15s ease",
                        }}
                        type="button"
                      >
                        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                          <span aria-hidden="true" style={{ fontSize: 24, lineHeight: 1 }}>
                            {icon}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 8,
                                alignItems: "baseline",
                              }}
                            >
                              <strong
                                style={{
                                  fontSize: 15,
                                  fontWeight: isUnread ? 700 : 600,
                                  color: "#111827",
                                }}
                              >
                                {item.title}
                              </strong>
                              <span style={{ fontSize: 12, color: "#9CA3AF", flexShrink: 0 }}>
                                {formatRelativeTime(item.created_at)}
                              </span>
                            </div>
                            {item.body ? (
                              <p
                                style={{
                                  marginTop: 6,
                                  fontSize: 13,
                                  color: "#4B5563",
                                  whiteSpace: "pre-wrap",
                                  display: "-webkit-box",
                                  WebkitLineClamp: 3,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                }}
                              >
                                {item.body}
                              </p>
                            ) : null}
                          </div>
                          {isUnread ? (
                            <span
                              aria-label="안 읽음"
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: "#3B82F6",
                                flexShrink: 0,
                                marginTop: 8,
                              }}
                            />
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </ContentContainer>

        <PublicFooter />
      </div>
    </PublicPageFrame>
  );
}

export default PublicNotificationsPage;
