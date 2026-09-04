import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { usePageMeta } from "../lib/usePageMeta";
import { trackEmptyState, trackEvent, trackException } from "../lib/analytics";
import { looksLikeRichHtml, sanitizeRichHtml } from "@shared-domain/richText";
import { ChevronRightIcon, ChevronUpIcon, PinIcon } from "../components/icons";
// 공지 페이지는 FAQ 아코디언 스타일(public-faq-*)을 재사용한다.
// lazy 청크가 분리돼 있어 이 import가 없으면 /notices 직접 진입 시 무스타일로 렌더됨.
import "./PublicFaqPage.css";

function formatKstDate(iso) {
  if (!iso) return "";
  try {
    const formatter = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

// 게시일이 최근 14일 이내면 NEW 뱃지 노출
const NOTICE_NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function isNoticeNew(publishedAt, now = Date.now()) {
  if (!publishedAt) return false;
  const timestamp = new Date(publishedAt).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return now - timestamp < NOTICE_NEW_WINDOW_MS;
}

function PublicNoticesPage() {
  usePageMeta({
    title: "공지사항",
    description: "수북 서비스 공지 · 운영 정책 · 시스템 점검 등 안내.",
  });

  const [notices, setNotices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [openIds, setOpenIds] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupabaseConfigured || !supabase) {
        if (!cancelled) {
          setNotices([]);
          setIsLoading(false);
        }
        return;
      }
      const { data, error } = await supabase.rpc("list_public_notices", {
        p_limit: 100,
        p_offset: 0,
      });
      if (cancelled) return;
      if (error) {
        // GA4 exception — 공지 조회 실패(안내 문구만 남고 조용히 끝나는 화면)
        trackException("notices_fetch_failed", { errorMessage: error.message });
        setErrorMessage("공지를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      } else {
        const rows = Array.isArray(data) ? data : [];
        if (rows.length === 0) {
          trackEmptyState("notices");
        }
        setNotices(rows);
        // 핀 공지는 기본 펼침
        setOpenIds(new Set(rows.filter((n) => n.is_pinned).map((n) => n.id)));
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleOpen = (id) => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <PublicPageFrame>
      <div className="public-faq-page">
        <PublicSiteHeader />

        <ContentContainer as="section" className="public-faq-route" aria-label="페이지 경로">
          <div className="public-faq-route__crumbs">
            <Link className="public-faq-route__crumb-link" to="/">
              홈
            </Link>
            <span aria-hidden="true"><ChevronRightIcon size={12} /></span>
            <span className="is-muted">공지사항</span>
          </div>
        </ContentContainer>

        <ContentContainer as="section" className="public-faq-hero" aria-label="페이지 안내">
          <p className="public-faq-hero__eyebrow">수북 소식</p>
          <h1 className="public-faq-hero__title">공지사항</h1>
          <p className="public-faq-hero__subtitle">
            서비스 운영, 점검, 정책 변경 등 안내드릴 사항이 있을 때 게시됩니다.
          </p>
        </ContentContainer>

        <ContentContainer as="section" className="public-faq-list" aria-label="공지사항 목록">
          {isLoading ? (
            <p className="public-faq-list__count">불러오는 중...</p>
          ) : errorMessage ? (
            <p className="public-faq-list__count" role="alert">{errorMessage}</p>
          ) : notices.length === 0 ? (
            <p className="public-faq-list__count">등록된 공지가 없습니다.</p>
          ) : (
            <>
              <div className="public-faq-list__toolbar">
                <span className="public-faq-list__count">총 {notices.length}건</span>
              </div>
              <ul className="public-faq-list__items" role="list">
                {notices.map((notice) => {
                  const isOpen = openIds.has(notice.id);
                  return (
                    <li className="public-faq-item" key={notice.id}>
                      <button
                        aria-controls={`notice-panel-${notice.id}`}
                        aria-expanded={isOpen}
                        className={`public-faq-item__head ${isOpen ? "is-open" : ""}`}
                        onClick={() => {
                          // GA4 notice_open — 접힘 → 펼침 전환만 (어떤 공지가 실제로 읽히는지)
                          if (!isOpen) {
                            trackEvent("notice_open", {
                              noticeId: String(notice.id),
                              noticeTitle: notice.title,
                              isPinned: Boolean(notice.is_pinned),
                              isNew: isNoticeNew(notice.published_at),
                            });
                          }
                          toggleOpen(notice.id);
                        }}
                        type="button"
                      >
                        <span className="public-faq-item__category">
                          {notice.is_pinned ? (
                            <><PinIcon size={12} /> 공지</>
                          ) : (
                            formatKstDate(notice.published_at)
                          )}
                        </span>
                        <span className="public-faq-item__question">
                          {notice.title}
                          {isNoticeNew(notice.published_at) ? (
                            <span aria-label="새 공지" className="public-notice-new-badge">NEW</span>
                          ) : null}
                        </span>
                        <span
                          aria-hidden="true"
                          className={`public-faq-item__chevron ${isOpen ? "is-open" : ""}`}
                        >
                          <ChevronUpIcon size={14} style={{ transform: "rotate(180deg)" }} />
                        </span>
                      </button>
                      {isOpen ? (
                        <div
                          className="public-faq-item__panel"
                          id={`notice-panel-${notice.id}`}
                          role="region"
                        >
                          {looksLikeRichHtml(notice.body) ? (
                            /* 어드민 리치텍스트 — sanitizeRichHtml(화이트리스트) 통과 HTML만 주입 */
                            <div
                              className="public-faq-item__rich"
                              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(notice.body) }}
                            />
                          ) : (
                            notice.body
                              .split(/\n+/)
                              .map((para) => para.trim())
                              .filter(Boolean)
                              .map((para, idx) => (
                                <p className="public-faq-item__text" key={idx}>
                                  {para}
                                </p>
                              ))
                          )}
                          <p className="public-faq-item__note" style={{ marginTop: 12 }}>
                            게시일 {formatKstDate(notice.published_at)}
                          </p>
                        </div>
                      ) : null}
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

export default PublicNoticesPage;
