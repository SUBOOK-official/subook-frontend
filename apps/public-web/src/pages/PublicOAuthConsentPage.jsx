import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import PublicAgreementDialog from "../components/PublicAgreementDialog";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { usePageMeta } from "../lib/usePageMeta";

const agreementItems = [
  {
    key: "terms",
    label: "이용약관",
    required: true,
    tagLabel: "[필수]",
    title: "이용약관",
    paragraphs: [
      "SUBOOK은 회원이 등록한 수능 교재를 위탁 판매하고, 구매자는 상태와 가격 정보를 확인한 뒤 안전하게 거래할 수 있도록 중개합니다.",
      "회원은 가입 시 정확한 정보를 입력해야 하며, 타인의 정보를 도용하거나 허위 정보를 등록할 수 없습니다.",
      "플랫폼 운영 정책과 검수 결과에 따라 등록 상품의 판매 여부, 가격, 노출 상태가 조정될 수 있습니다.",
    ],
  },
  {
    key: "privacy",
    label: "개인정보 수집 및 이용",
    required: true,
    tagLabel: "[필수]",
    title: "개인정보 수집 및 이용 동의",
    paragraphs: [
      "수북은 회원 식별, 주문 처리, 배송, 정산, 고객 응대를 위해 이름, 이메일, 연락처 등 최소한의 정보를 수집합니다.",
      "수집한 정보는 서비스 제공 목적 범위 안에서만 사용하며, 관련 법령 또는 회원 동의 없이 제3자에게 임의 제공하지 않습니다.",
      "회원은 언제든지 개인정보 열람, 수정, 삭제를 요청할 수 있으며, 법령상 보관 의무가 있는 정보는 해당 기간 동안 안전하게 보관됩니다.",
    ],
  },
  {
    key: "marketing",
    label: "마케팅 정보 수신",
    required: false,
    tagLabel: "[선택]",
    title: "마케팅 정보 수신 동의",
    paragraphs: [
      "이벤트, 할인, 신규 서비스 안내를 이메일 또는 SNS 알림으로 받아볼 수 있습니다.",
      "선택 동의이며, 거부해도 회원가입과 기본 서비스 이용에는 제한이 없습니다.",
      "마이페이지 또는 알림 설정에서 언제든지 수신 동의를 철회할 수 있습니다.",
    ],
  },
];

function PublicOAuthConsentPage() {
  usePageMeta({
    title: "서비스 이용 약관 동의",
    description: "수북 서비스 이용을 위해 약관에 동의해 주세요.",
    noindex: true,
  });

  const location = useLocation();
  const navigate = useNavigate();
  const { isLoading, hasSession, needsOAuthConsent, isAuthenticated, refreshProfile, signOut } = usePublicAuth();

  const search = new URLSearchParams(location.search);
  const next = search.get("next") || "/";

  const [agreements, setAgreements] = useState({ terms: false, privacy: false, marketing: false });
  const [activeAgreementKey, setActiveAgreementKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const isAllAgreed = agreementItems.every((item) => agreements[item.key]);
  const hasRequiredAgreements = agreementItems
    .filter((item) => item.required)
    .every((item) => agreements[item.key]);

  // 이미 인증 완료된 사용자는 next로 즉시 이동
  useEffect(() => {
    if (isLoading) return;
    if (!hasSession) {
      navigate("/login", { replace: true });
      return;
    }
    if (isAuthenticated && !needsOAuthConsent) {
      navigate(next, { replace: true });
    }
  }, [isLoading, hasSession, isAuthenticated, needsOAuthConsent, next, navigate]);

  const handleToggleAgreement = (key) => {
    setAgreements((prev) => ({ ...prev, [key]: !prev[key] }));
    setErrorMessage("");
  };

  const handleToggleAllAgreements = () => {
    const nextValue = !isAllAgreed;
    setAgreements({ terms: nextValue, privacy: nextValue, marketing: nextValue });
    setErrorMessage("");
  };

  const activeAgreement = agreementItems.find((item) => item.key === activeAgreementKey) ?? null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    if (!hasRequiredAgreements) {
      setErrorMessage("필수 약관에 모두 동의해 주세요.");
      return;
    }
    if (!supabase) {
      setErrorMessage("일시적으로 동의 처리가 어렵습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.rpc("complete_oauth_signup", {
        p_marketing_opt_in: agreements.marketing,
      });
      if (error) {
        setErrorMessage(`동의 처리에 실패했어요. ${error.message ?? ""}`);
        setIsSubmitting(false);
        return;
      }
      await refreshProfile();
      navigate(next, { replace: true });
    } catch (err) {
      console.error("complete_oauth_signup failed", err);
      setErrorMessage("동의 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setShowCancelConfirm(true);
  };

  const handleConfirmCancel = async () => {
    setShowCancelConfirm(false);
    await signOut();
    navigate("/login", { replace: true });
  };

  if (isLoading) {
    return (
      <main className="public-auth-route">
        <div className="public-auth-shell">
          <section className="public-auth-card">
            <div className="public-auth-card__body" style={{ textAlign: "center", padding: "48px 0" }}>
              <span className="public-auth-spinner" aria-hidden="true" />
              <p>로그인 정보를 확인하는 중...</p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (!hasSession) {
    return <Navigate replace to="/login" />;
  }

  return (
    <>
      <main className="public-auth-route">
        <div className="public-auth-shell">
          <section aria-labelledby="public-oauth-consent-heading" className="public-auth-card public-auth-card--signup">
            <div className="public-auth-brand-lockup">
              <Link className="public-auth-brand" to="/">
                SUBOOK
              </Link>
              <p className="public-auth-brand-lockup__tagline">수능 교재, 똑똑하게 거래</p>
            </div>

            <div className="public-auth-card__body">
              <div className="public-auth-card__heading">
                <h1 className="public-auth-card__title" id="public-oauth-consent-heading">
                  거의 다 왔어요!
                </h1>
                <p className="public-auth-card__description">
                  서비스를 이용하시려면 아래 약관에 동의해 주세요.
                  <br />
                  한 번만 동의하시면 다음부터는 바로 이용하실 수 있어요.
                </p>
              </div>

              {errorMessage ? (
                <div className="public-auth-alert public-auth-alert--error">{errorMessage}</div>
              ) : null}

              <form className="public-auth-form-card" noValidate onSubmit={handleSubmit}>
                <div className="public-auth-agreement-box">
                  <label className="public-auth-agreement-box__all">
                    <span className="public-auth-checkmark">
                      <input
                        checked={isAllAgreed}
                        onChange={handleToggleAllAgreements}
                        type="checkbox"
                      />
                      <span aria-hidden="true" className="public-auth-checkmark__indicator">
                        ✓
                      </span>
                    </span>
                    <span>전체 동의</span>
                  </label>

                  <div aria-hidden="true" className="public-auth-agreement-box__divider" />

                  <div className="public-auth-agreement-box__list">
                    {agreementItems.map((item) => (
                      <div className="public-auth-agreement-box__item" key={item.key}>
                        <label className="public-auth-agreement-box__item-label">
                          <span className="public-auth-checkmark">
                            <input
                              checked={agreements[item.key]}
                              onChange={() => handleToggleAgreement(item.key)}
                              type="checkbox"
                            />
                            <span aria-hidden="true" className="public-auth-checkmark__indicator">
                              ✓
                            </span>
                          </span>
                          <span className="public-auth-agreement-box__item-copy">
                            <span className="public-auth-agreement-box__item-tag">{item.tagLabel}</span>
                            <span>{item.label}</span>
                          </span>
                        </label>
                        <button
                          className="public-auth-agreement-box__view"
                          onClick={() => setActiveAgreementKey(item.key)}
                          type="button"
                        >
                          보기
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  className="public-auth-button public-auth-button--primary"
                  disabled={isSubmitting || !hasRequiredAgreements}
                  type="submit"
                >
                  {isSubmitting ? (
                    <>
                      <span aria-hidden="true" className="public-auth-spinner public-auth-spinner--button" />
                      <span>처리 중...</span>
                    </>
                  ) : (
                    "동의하고 시작하기"
                  )}
                </button>

                <button
                  className="public-auth-button public-auth-button--ghost"
                  disabled={isSubmitting}
                  onClick={handleCancel}
                  type="button"
                >
                  취소하고 나가기
                </button>
              </form>
            </div>
          </section>
        </div>
      </main>

      <PublicAgreementDialog
        documentItem={activeAgreement}
        onClose={() => setActiveAgreementKey("")}
        open={Boolean(activeAgreement)}
      />

      {showCancelConfirm ? (
        <div
          className="public-sheet-backdrop"
          onClick={() => setShowCancelConfirm(false)}
          role="presentation"
        >
          <section
            aria-labelledby="public-oauth-consent-cancel-title"
            aria-modal="true"
            className="public-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="public-sheet__drag-handle" />
            <div className="public-sheet__header">
              <div>
                <p className="public-sheet__eyebrow">[확인]</p>
                <h2 className="public-sheet__title" id="public-oauth-consent-cancel-title">
                  동의를 취소할까요?
                </h2>
              </div>
              <button
                aria-label="닫기"
                className="public-sheet__close"
                onClick={() => setShowCancelConfirm(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="public-sheet__body">
              <p className="public-sheet__paragraph">
                동의를 취소하면 로그아웃 처리되며, 약관 동의 없이는 수북 서비스 이용이 어려워요.
                다시 로그인하면 이 화면으로 돌아옵니다.
              </p>
            </div>
            <div className="public-sheet__footer">
              <button
                className="public-auth-button public-auth-button--secondary"
                onClick={() => setShowCancelConfirm(false)}
                type="button"
              >
                돌아가기
              </button>
              <button
                className="public-auth-button public-auth-button--primary"
                onClick={handleConfirmCancel}
                type="button"
              >
                동의 취소하고 로그아웃
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export default PublicOAuthConsentPage;
