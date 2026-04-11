import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ContentContainer from "../ContentContainer";
import {
  createEmptyHomeSubjectCounts,
  fetchHomeSubjectCounts,
  getCachedHomeSubjectCounts,
  getTotalHomeSubjectCount,
} from "../../lib/publicHomeSubjectCounts";

const SUBJECT_QUICK_LINKS = [
  {
    key: "수학",
    label: "수학",
    href: "/store?subject=수학",
    iconBackground: "#DBEAFE",
    iconForeground: "#2563EB",
    iconType: "math",
  },
  {
    key: "국어",
    label: "국어",
    href: "/store?subject=국어",
    iconBackground: "#D1FAE5",
    iconForeground: "#059669",
    iconType: "korean",
  },
  {
    key: "영어",
    label: "영어",
    href: "/store?subject=영어",
    iconBackground: "#E0E7FF",
    iconForeground: "#7C3AED",
    iconType: "english",
  },
  {
    key: "과학",
    label: "과학",
    href: "/store?subject=과학",
    iconBackground: "#FEE2E2",
    iconForeground: "#DC2626",
    iconType: "science",
  },
  {
    key: "사회",
    label: "사회",
    href: "/store?subject=사회",
    iconBackground: "#FEF3C7",
    iconForeground: "#D97706",
    iconType: "society",
  },
  {
    key: "한국사",
    label: "한국사",
    href: "/store?subject=한국사",
    iconBackground: "#FFEDD5",
    iconForeground: "#C2410C",
    iconType: "history",
  },
  {
    key: "기타",
    label: "기타",
    href: "/store?subject=기타",
    iconBackground: "#F3F4F6",
    iconForeground: "#6B7280",
    iconType: "etc",
  },
  {
    key: "전체",
    label: "전체",
    href: "/store",
    iconBackground: "#F3F4F6",
    iconForeground: "#475569",
    iconType: "all",
    isAllCard: true,
  },
];

function SubjectIcon({ type }) {
  switch (type) {
    case "math":
      return (
        <svg aria-hidden="true" className="public-home-subject-card__icon-svg" viewBox="0 0 24 24">
          <path
            d="M5 18.5 15.8 7.7a1.8 1.8 0 0 1 2.5 0l.8.8a1.8 1.8 0 0 1 0 2.5L8.3 21.8H5z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          <path d="M14.5 9l3.5 3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          <path d="M5 18.5h3.3V22" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      );
    case "korean":
      return (
        <svg aria-hidden="true" className="public-home-subject-card__icon-svg" viewBox="0 0 24 24">
          <path
            d="M7.5 4.5h9A2.5 2.5 0 0 1 19 7v12.5H7.5A2.5 2.5 0 0 1 5 17V7a2.5 2.5 0 0 1 2.5-2.5Z"
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          <path d="M9 9h6M9 12.5h6M9 16h4.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          <path d="m15.5 4.8 2.7 2.7" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      );
    case "english":
      return (
        <svg aria-hidden="true" className="public-home-subject-card__icon-svg" viewBox="0 0 24 24">
          <text fill="currentColor" fontFamily="Inter, sans-serif" fontSize="7.5" fontWeight="800" x="3.1" y="15.4">
            ABC
          </text>
          <path
            d="M4.5 18.5h15"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeOpacity=".3"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "science":
      return (
        <svg aria-hidden="true" className="public-home-subject-card__icon-svg" viewBox="0 0 24 24">
          <path
            d="M9 5.5h5M12 5.5v5l4.8 4.8a2.2 2.2 0 0 1-1.5 3.7H8.7a2.2 2.2 0 0 1-1.5-3.7L12 10.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          <path d="M9.5 14.2h5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      );
    case "society":
      return (
        <svg aria-hidden="true" className="public-home-subject-card__icon-svg" viewBox="0 0 24 24">
          <circle cx="12" cy="12" fill="none" r="7" stroke="currentColor" strokeWidth="1.8" />
          <path d="M5 12h14M12 5c2 2 3 4.5 3 7s-1 5-3 7c-2-2-3-4.5-3-7s1-5 3-7Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case "history":
      return (
        <svg aria-hidden="true" className="public-home-subject-card__icon-svg" viewBox="0 0 24 24">
          <path
            d="M7 6.2c1 1.1 2.3 1.6 3.8 1.6h4.2A1.8 1.8 0 0 1 16.8 9v6.5a1.8 1.8 0 0 1-1.8 1.8h-4.4c-1.4 0-2.7.5-3.6 1.5V6.2Z"
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          <path d="M7 6.2v12.6M17 7.8c-.8-.9-1.9-1.3-3.2-1.3" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      );
    case "etc":
      return (
        <svg aria-hidden="true" className="public-home-subject-card__icon-svg" viewBox="0 0 24 24">
          <path
            d="M6.5 7.5h8a1.8 1.8 0 0 1 1.8 1.8v8.2h-8a1.8 1.8 0 0 1-1.8-1.8V7.5Zm3-3h8A1.8 1.8 0 0 1 19.3 6.3v8.2"
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "all":
      return (
        <svg aria-hidden="true" className="public-home-subject-card__icon-svg" viewBox="0 0 24 24">
          <circle cx="10.5" cy="10.5" fill="none" r="5.8" stroke="currentColor" strokeWidth="1.8" />
          <path d="m15 15 4.2 4.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      );
    default:
      return null;
  }
}

function SubjectCard({ countLabel, item, totalCount }) {
  const ariaLabel = item.isAllCard
    ? `전체 교재 ${totalCount.toLocaleString("ko-KR")}권 보러가기`
    : `${item.label} 교재 ${totalCount.toLocaleString("ko-KR")}권 보러가기`;

  return (
    <Link
      aria-label={ariaLabel}
      className={`public-home-subject-card ${item.isAllCard ? "public-home-subject-card--all" : ""}`}
      to={item.href}
    >
      <span
        aria-hidden="true"
        className="public-home-subject-card__icon"
        style={{
          "--public-home-subject-icon-bg": item.iconBackground,
          "--public-home-subject-icon-color": item.iconForeground,
        }}
      >
        <SubjectIcon type={item.iconType} />
      </span>
      <span className="public-home-subject-card__label">{item.label}</span>
      <span
        className={`public-home-subject-card__meta ${countLabel === "—" ? "public-home-subject-card__meta--loading" : ""}`}
      >
        {countLabel}
      </span>
    </Link>
  );
}

function SubjectGrid() {
  const [subjectCounts, setSubjectCounts] = useState(() => createEmptyHomeSubjectCounts());
  const [isLoading, setIsLoading] = useState(true);
  const [hasFatalError, setHasFatalError] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    const cachedCounts = getCachedHomeSubjectCounts();

    if (cachedCounts) {
      setSubjectCounts(cachedCounts.counts);
      setIsLoading(false);

      if (!cachedCounts.isStale) {
        return undefined;
      }
    }

    const loadSubjectCounts = async () => {
      try {
        const result = await fetchHomeSubjectCounts();
        if (isCancelled) {
          return;
        }

        setSubjectCounts(result.counts);
        setIsLoading(false);
        setHasFatalError(false);
      } catch {
        if (isCancelled) {
          return;
        }

        if (!cachedCounts) {
          setHasFatalError(true);
          setIsLoading(false);
        }
      }
    };

    loadSubjectCounts();

    return () => {
      isCancelled = true;
    };
  }, []);

  if (hasFatalError) {
    return null;
  }

  const totalCount = getTotalHomeSubjectCount(subjectCounts);

  return (
    <section aria-busy={isLoading} aria-labelledby="public-home-subjects-title" className="public-home-subjects">
      <ContentContainer className="public-home-subjects__shell">
        <h2 className="public-home-subjects__title" id="public-home-subjects-title">
          과목별 교재 보기
        </h2>

        <div className="public-home-subjects__grid">
          {SUBJECT_QUICK_LINKS.map((item) => {
            const countLabel = item.isAllCard
              ? "보기"
              : isLoading
                ? "—"
                : subjectCounts[item.key].toLocaleString("ko-KR");
            const cardCount = item.isAllCard ? totalCount : subjectCounts[item.key];

            return <SubjectCard countLabel={countLabel} item={item} key={item.key} totalCount={cardCount} />;
          })}
        </div>
      </ContentContainer>
    </section>
  );
}

export default SubjectGrid;
