import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { usePageMeta } from "../lib/usePageMeta";
import {
  STORE_RECENT_SEARCH_STORAGE_KEY,
  normalizeRecentSearches,
} from "../lib/publicStoreSearch";

// 인기 검색어 — 최근 검색어가 있으면 우선, 없으면 학생 친화 fallback.
const FALLBACK_POPULAR_KEYWORDS = ["수학", "강기원", "시대인재", "EBS 수능특강", "기출"];

function readRecentSearches() {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORE_RECENT_SEARCH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return normalizeRecentSearches(parsed);
  } catch {
    return [];
  }
}

function PublicNotFoundPage() {
  usePageMeta({
    title: "페이지를 찾을 수 없어요",
    description: "요청하신 페이지가 존재하지 않습니다.",
    noindex: true,
  });

  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState("");

  const popularKeywords = useMemo(() => {
    const recent = readRecentSearches();
    if (recent.length > 0) return recent;
    return FALLBACK_POPULAR_KEYWORDS;
  }, []);

  const navigateToSearch = (query) => {
    const trimmed = String(query ?? "").trim();
    if (!trimmed) return;
    navigate(`/?q=${encodeURIComponent(trimmed)}`, {
      state: { scrollToStorefront: true },
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    navigateToSearch(searchValue);
  };

  return (
    <PublicPageFrame>
      <PublicSiteHeader />
      <ContentContainer as="section" className="public-notfound">
        <p className="public-notfound__code">404</p>
        <h1 className="public-notfound__title">페이지를 찾을 수 없어요</h1>
        <p className="public-notfound__lead">
          요청하신 페이지가 이동되었거나 더 이상 존재하지 않습니다.<br />
          찾으시는 교재를 직접 검색해 보세요.
        </p>

        <form
          aria-label="교재 검색"
          className="public-notfound__search"
          onSubmit={handleSubmit}
          role="search"
        >
          <input
            aria-label="교재명 또는 강사명 검색"
            className="public-notfound__search-input"
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="교재명, 강사명으로 검색"
            type="search"
            value={searchValue}
          />
          <button className="public-notfound__search-submit" type="submit">검색</button>
        </form>

        <div className="public-notfound__popular">
          <span className="public-notfound__popular-label">인기 검색어</span>
          <div className="public-notfound__popular-list">
            {popularKeywords.map((term) => (
              <button
                className="public-notfound__popular-chip"
                key={`popular-${term}`}
                onClick={() => navigateToSearch(term)}
                type="button"
              >
                {term}
              </button>
            ))}
          </div>
        </div>

        <div className="public-notfound__actions">
          <Link className="public-notfound__cta public-notfound__cta--primary" to="/">
            홈으로
          </Link>
          <Link className="public-notfound__cta public-notfound__cta--secondary" to="/faq">
            자주 묻는 질문
          </Link>
        </div>
      </ContentContainer>
      <PublicFooter />
    </PublicPageFrame>
  );
}

export default PublicNotFoundPage;
