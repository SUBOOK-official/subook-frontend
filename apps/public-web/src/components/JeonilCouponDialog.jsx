import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import { trackJeonilLaunchAlert } from "../lib/analytics";
import {
  formatPhoneNumber,
  isValidKoreanMobile,
} from "../lib/publicAuthFormUtils";
import "./JeonilCouponDialog.css";

// submit_event_subscription RPC의 이벤트 키 allowlist와 동일해야 함
const EVENT_KEY = "jeonil-2026-09";

// 전일학원 이벤트 출시 알림 신청 팝업 — 전화번호 + 마케팅 수신 동의.
function JeonilCouponDialog({ open, onClose }) {
  const [phone, setPhone] = useState("");
  const [agree, setAgree] = useState(true);
  const [termsOpen, setTermsOpen] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setPhone("");
      setAgree(true);
      setTermsOpen(false);
      setError("");
      setSubmitting(false);
      setDone(false);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleChange = (event) => {
    setPhone(formatPhoneNumber(event.target.value));
    if (error) {
      setError("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isValidKoreanMobile(phone)) {
      setError("올바른 휴대전화 번호를 입력해 주세요.");
      return;
    }
    if (!agree) {
      setError("개인정보 마케팅 수신에 동의해 주세요.");
      return;
    }
    if (!isSupabaseConfigured || !supabase) {
      setError("신청에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("submit_event_subscription", {
        p_event_key: EVENT_KEY,
        p_phone: phone,
        p_marketing_consent: agree,
      });
      if (rpcError || !data?.success) {
        setError(
          data?.code === "INVALID_PHONE"
            ? "올바른 휴대전화 번호를 입력해 주세요."
            : "신청에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }
      // 재신청(ALREADY)도 완료 화면은 보여주되 리드 이벤트는 최초 신청만 집계
      if (data.code === "SUBSCRIBED") {
        trackJeonilLaunchAlert();
      }
      setDone(true);
    } catch {
      setError("신청에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="jeonil-coupon"
      role="dialog"
      aria-modal="true"
      aria-label="출시 알림 신청"
      onClick={onClose}
    >
      <div className="jeonil-coupon__panel" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="jeonil-coupon__close" onClick={onClose} aria-label="닫기">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        {done ? (
          <div className="jeonil-coupon__done">
            <p className="jeonil-coupon__done-title">신청이 완료되었어요!</p>
            <p className="jeonil-coupon__done-desc">
              입력해주신 번호로 출시 알림과 할인쿠폰을 보내드릴게요.
            </p>
            <button type="button" className="jeonil-coupon__submit" onClick={onClose}>
              확인
            </button>
          </div>
        ) : (
          <form className="jeonil-coupon__form" onSubmit={handleSubmit} noValidate>
            <p className="jeonil-coupon__title">알림 받으실 전화번호를 입력해주세요.</p>
            <input
              className="jeonil-coupon__input"
              type="tel"
              inputMode="numeric"
              placeholder="010-1234-5678"
              value={phone}
              onChange={handleChange}
              autoFocus
              aria-label="전화번호"
              aria-invalid={Boolean(error)}
            />

            <div className="jeonil-coupon__consent">
              <label className="jeonil-coupon__check">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => {
                    setAgree(e.target.checked);
                    if (error) setError("");
                  }}
                />
                <span className="jeonil-coupon__check-box" aria-hidden="true" />
                <span>개인정보 마케팅 수신 동의</span>
              </label>
              <button
                type="button"
                className="jeonil-coupon__terms"
                onClick={() => setTermsOpen((v) => !v)}
                aria-expanded={termsOpen}
              >
                약관보기
                <svg
                  className={`jeonil-coupon__terms-arrow${termsOpen ? " is-open" : ""}`}
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {termsOpen ? (
              <div className="jeonil-coupon__terms-body">
                <p className="jeonil-coupon__terms-title">개인정보 마케팅 수신 동의 (선택)</p>
                <ul>
                  <li>수집 항목: 휴대전화번호</li>
                  <li>
                    수집·이용 목적: 전일학원 × 수북 콜라보 교재 출시 알림 및 할인 혜택·이벤트
                    정보 안내
                  </li>
                  <li>보유·이용 기간: 동의 철회 시 또는 이벤트 종료 후 6개월까지</li>
                  <li>
                    본 동의는 선택 사항이며, 동의하지 않으실 경우 출시 알림·할인 혜택 안내를 받지
                    못할 수 있습니다.
                  </li>
                </ul>
              </div>
            ) : null}

            <p className="jeonil-coupon__note">
              *전일학원 교재 출시 10분 전에 위 번호로 알림 문자를 보내드릴 예정이며, 알림 문자에는
              전일학원 교재 한정 3천 원 할인쿠폰 코드가 함께 발송됩니다.
              <br />
              *할인쿠폰 코드는 수북 홈페이지 마이페이지에서 등록 가능하며, 전일학원 교재를 구매하시는
              모든 분들이 최소주문 금액과 상관없이 사용하실 수 있습니다.
            </p>

            {error ? (
              <p className="jeonil-coupon__error" role="alert">
                {error}
              </p>
            ) : null}

            <button type="submit" className="jeonil-coupon__submit" disabled={submitting}>
              {submitting ? "신청 중..." : "신청하기"}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default JeonilCouponDialog;
