import { Link } from "react-router-dom";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { usePageMeta } from "../lib/usePageMeta";

function PublicNotFoundPage() {
  usePageMeta({
    title: "페이지를 찾을 수 없어요",
    description: "요청하신 페이지가 존재하지 않습니다.",
    noindex: true,
  });

  return (
    <PublicPageFrame>
      <PublicSiteHeader />
      <ContentContainer as="section" className="py-20 text-center">
        <p className="text-6xl font-black text-slate-300 mb-3">404</p>
        <h1 className="text-2xl font-bold text-slate-900 mb-3">페이지를 찾을 수 없어요</h1>
        <p className="text-sm text-slate-600 mb-8">
          요청하신 페이지가 이동되었거나 더 이상 존재하지 않습니다.<br />
          주소를 다시 확인해 주세요.
        </p>
        <div className="flex justify-center gap-3">
          <Link
            className="px-6 py-3 rounded-lg bg-slate-900 text-white text-sm font-semibold"
            to="/"
          >
            홈으로
          </Link>
          <Link
            className="px-6 py-3 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm font-semibold"
            to="/faq"
          >
            자주 묻는 질문
          </Link>
        </div>
      </ContentContainer>
      <PublicFooter />
    </PublicPageFrame>
  );
}

export default PublicNotFoundPage;
