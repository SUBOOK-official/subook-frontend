import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import PublicSiteHeader from "../components/PublicSiteHeader";
import PublicFooter from "../components/PublicFooter";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BoxIcon,
  CheckCircleIcon,
  CheckIcon,
  CoinIcon,
  InfoIcon,
  MapPinIcon,
  SearchIcon,
} from "../components/icons";
import boxIconPng from "../assets/icons/box.png";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { BANK_LIST, submitPickupRequest } from "../lib/pickupRequest";
import { loadMemberPortalSnapshot } from "../lib/memberPortal";
import { isValidKoreanMobile } from "../lib/publicAuthFormUtils";
import { usePageMeta } from "../lib/usePageMeta";
import "./PublicPickupRequestPage.css";

const PICKUP_REQUEST_PATH = "/pickup/new";
const STEPS = ["수거 정보", "정산 정보", "확인"];

// ─── 작성 중 신청서 임시 저장 ───
const DRAFT_STORAGE_KEY = "subook.pickup.draft.v2";
const DRAFT_TTL_MS = 1000 * 60 * 60 * 24; // 24시간

function readDraft() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeDraft(payload) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ ...payload, savedAt: Date.now() }),
    );
  } catch {
    /* ignore quota */
  }
}

function clearDraft() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// ─── 영업일 계산 (간단 — 주말 제외, 법정공휴일은 백엔드 확정 시 보강) ───
function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function addBusinessDays(date, days) {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    if (!isWeekend(result)) added += 1;
  }
  return result;
}

function getMinPickupDateISO() {
  return addBusinessDays(new Date(), 1).toISOString().split("T")[0];
}

// ─── 프로그레스 바 ───
function ProgressBar({ currentStep }) {
  return (
    <ol aria-label="수거 요청 단계" className="pickup-progress">
      {STEPS.map((label, index) => {
        const isDone = index < currentStep;
        const isCurrent = index === currentStep;
        let cls = "pickup-progress__item";
        if (isDone) cls += " is-done";
        if (isCurrent) cls += " is-current";

        return (
          <li className={cls} key={label}>
            <span aria-hidden="true" className="pickup-progress__marker">
              {isDone ? <CheckIcon size={13} /> : index + 1}
            </span>
            <span className="pickup-progress__label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ─── 토스트 ───
function Toast({ message, tone, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icon =
    tone === "error" ? (
      <AlertTriangleIcon size={16} />
    ) : tone === "success" ? (
      <CheckCircleIcon size={16} />
    ) : (
      <InfoIcon size={16} />
    );

  return (
    <div className={`pickup-toast pickup-toast--${tone}`} role="alert">
      <span className="pickup-toast__icon">{icon}</span>
      <span className="pickup-toast__message">{message}</span>
    </div>
  );
}

// ─── 신청 전 핵심 정책 카드 ───
// 2026-05-19 정책: 신규 입고는 모두 "안 쓴(미사용) 교재"만 수령.
// 2026-06-08 모델 변경: 사용자는 교재를 개별 등록하지 않고 예상 권수/박스 수만 보냄.
// 책별 가격·등급은 검수 후 운영팀이 정해 마이페이지에서 안내.
function PickupPolicyPreview() {
  return (
    <div
      className="pickup-policy-preview"
      role="region"
      aria-label="신청 전 꼭 알아두세요"
    >
      <p className="pickup-policy-preview__title">신청 전 꼭 알아두세요.</p>
      <div className="pickup-policy-preview__highlight">
        <strong>안 쓴 새 책(미사용)</strong>,{" "}
        <strong>수능 기준 3개년 이내</strong> 교재만 받습니다.
        <span>
          {" "}
          비닐 개봉은 괜찮지만 필기·형광펜이 있거나 표지·내지가 손상된 책은
          판매불가입니다.
        </span>
      </div>
      <ul className="pickup-policy-preview__list">
        <li>
          <strong>교재 정보 불필요</strong> 어떤 책을 보내는지 일일이 적지
          않아도 돼요. 검수 과정에서 수북이 대신 등록해 드려요.
        </li>
        <li>
          <strong>무료 수거</strong> 별도의 수거 비용은 없어요.
        </li>
        <li>
          <strong>상품화 비용</strong> 박스 1개당 상품화 비용 5,000원이 정산 시
          차감돼요. 여러 박스보다 큰 박스 하나에 담는 게 유리해요.
        </li>
        <li>
          <strong>가격 책정</strong> 교재별 판매가는 검수 완료 후 운영팀이
          산정하며, 마이페이지를 통해 안내해 드려요.
        </li>
        <li>
          <strong>정산</strong> 구매확정이 완료된 판매 건에 한해,{" "}
          <strong>매월 1일</strong>등록하신 계좌로 정산 금액이 입금돼요.
        </li>
        <li>
          <strong>검수 폐기·반송 없음</strong> 기준 미달 교재는 판매불가 → 자체
          폐기(반송 없음)
        </li>
      </ul>
    </div>
  );
}

// ─── 공동현관 비밀번호 보기/숨기기 토글 ───
function PickupPasswordField({ value, onChange }) {
  const [reveal, setReveal] = useState(false);
  return (
    <div className="pickup-form-field">
      <label className="pickup-field-label">공동현관 비밀번호</label>
      <div className="pickup-input-with-toggle">
        <input
          autoComplete="new-password"
          className="pickup-input"
          name="pickup-entrance-password"
          onChange={(e) => onChange(e.target.value)}
          placeholder="#1234종"
          type={reveal ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={reveal ? "비밀번호 숨기기" : "비밀번호 보기"}
          className="pickup-input-toggle"
          onClick={() => setReveal((v) => !v)}
          type="button"
        >
          {reveal ? "숨기기" : "보기"}
        </button>
      </div>
    </div>
  );
}

// ─── Step 1: 수거 정보 (주소 + 예상 권수/박스 수) ───
function StepAddress({
  address,
  setAddress,
  savedAddresses,
  onNext,
  showToast,
}) {
  const [selectedSavedId, setSelectedSavedId] = useState(null);
  const [useNewAddress, setUseNewAddress] = useState(
    savedAddresses.length === 0,
  );
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const detailRef = useRef(null);
  const minPickupDate = useMemo(() => getMinPickupDateISO(), []);
  const pickupDateNotice = useMemo(() => {
    if (!address.desired_pickup_date) return "";
    const picked = new Date(address.desired_pickup_date);
    if (Number.isNaN(picked.getTime())) return "";
    if (isWeekend(picked))
      return "주말은 수거가 어렵습니다. 다음 영업일로 변경해주세요.";
    return "";
  }, [address.desired_pickup_date]);
  const expectedCountNumber = Number.parseInt(address.expected_book_count, 10);
  const boxCountNumber = Number.parseInt(address.box_count, 10);

  useEffect(() => {
    if (savedAddresses.length > 0 && !selectedSavedId && !useNewAddress) {
      const defaultAddr =
        savedAddresses.find((a) => a.is_default) || savedAddresses[0];
      selectSaved(defaultAddr);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectSaved = (addr) => {
    setSelectedSavedId(addr.id);
    // 저장된 주소에 상세 주소(동/호수)가 없으면 사용자가 채워야 하므로
    // 새 주소 입력 폼을 열어 address_line2를 노출한다.
    const detail = addr.address_line2 || "";
    setUseNewAddress(!detail.trim());
    // 새 주소 입력 도중 다른 저장 주소를 고르면 잔존 필드(공동현관 비밀번호/이메일 등)가
    // 이전 입력값 그대로 전송될 수 있으므로 모두 빈 값으로 명시 reset.
    setAddress({
      recipient_name: addr.recipient_name,
      recipient_phone: addr.recipient_phone,
      postal_code: addr.postal_code,
      address_line1: addr.address_line1,
      address_line2: detail,
      memo: addr.delivery_memo || "",
      email: "",
      entrance_password: "",
      desired_pickup_date: "",
      expected_book_count: "",
      box_count: "",
    });
  };

  const startNewAddress = () => {
    setSelectedSavedId(null);
    setUseNewAddress(true);
    // 새 주소 입력으로 전환할 때 프로필 기본값(수령인 이름/전화)은 보존하고 주소만 비운다.
    setAddress((prev) => ({
      recipient_name: prev.recipient_name || "",
      recipient_phone: prev.recipient_phone || "",
      postal_code: "",
      address_line1: "",
      address_line2: "",
      memo: "",
      email: prev.email || "",
      entrance_password: "",
      desired_pickup_date: prev.desired_pickup_date || "",
      expected_book_count: prev.expected_book_count || "",
      box_count: prev.box_count || "",
    }));
  };

  const openDaumPostcode = async () => {
    const loadScript = () =>
      new Promise((resolve, reject) => {
        if (window.daum?.Postcode) {
          resolve();
          return;
        }
        const existing = document.getElementById("subook-daum-postcode-script");
        if (existing) {
          existing.addEventListener("load", resolve, { once: true });
          existing.addEventListener("error", reject, { once: true });
          return;
        }
        const script = document.createElement("script");
        script.id = "subook-daum-postcode-script";
        script.src =
          "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
        script.async = true;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });

    try {
      setIsSearchingAddress(true);
      await loadScript();
      setIsSearchingAddress(false);

      new window.daum.Postcode({
        oncomplete: (data) => {
          setAddress((prev) => ({
            ...prev,
            postal_code: data.zonecode ?? "",
            address_line1: data.roadAddress || data.jibunAddress || "",
          }));
          setTimeout(() => detailRef.current?.focus(), 50);
        },
      }).open();
    } catch {
      setIsSearchingAddress(false);
      showToast("주소 검색을 불러오지 못했습니다.", "error");
    }
  };

  const isValid =
    address.recipient_name.trim() &&
    address.recipient_phone.trim() &&
    isValidKoreanMobile(address.recipient_phone) &&
    address.postal_code.trim() &&
    address.address_line1.trim() &&
    address.address_line2.trim() &&
    Number.isFinite(expectedCountNumber) &&
    expectedCountNumber > 0 &&
    Number.isFinite(boxCountNumber) &&
    boxCountNumber > 0;

  return (
    <div className="pickup-step">
      <div className="pickup-step__header">
        <h2 className="pickup-step__title">수거 정보를 입력해주세요</h2>
      </div>

      <PickupPolicyPreview />

      {/* 저장된 주소 선택 */}
      {savedAddresses.length > 0 && (
        <div className="pickup-saved-list">
          {savedAddresses.map((addr) => (
            <label
              className={`pickup-saved-card ${selectedSavedId === addr.id && !useNewAddress ? "is-selected" : ""}`}
              key={addr.id}
            >
              <input
                checked={selectedSavedId === addr.id && !useNewAddress}
                className="pickup-saved-card__radio"
                name="pickup-address"
                onChange={() => selectSaved(addr)}
                type="radio"
              />
              <div className="pickup-saved-card__content">
                <div className="pickup-saved-card__top">
                  <span className="pickup-saved-card__label">
                    {addr.label || "주소"}
                  </span>
                  {addr.is_default && (
                    <span className="pickup-saved-card__default">기본</span>
                  )}
                </div>
                <span className="pickup-saved-card__name">
                  {addr.recipient_name} · {addr.recipient_phone}
                </span>
                <span className="pickup-saved-card__addr">
                  {addr.address_line1}
                  {addr.address_line2 ? `, ${addr.address_line2}` : ""}
                </span>
              </div>
            </label>
          ))}
          <label
            className={`pickup-saved-card ${useNewAddress ? "is-selected" : ""}`}
          >
            <input
              checked={useNewAddress}
              className="pickup-saved-card__radio"
              name="pickup-address"
              onChange={startNewAddress}
              type="radio"
            />
            <span className="pickup-saved-card__new">+ 새 주소 입력</span>
          </label>
        </div>
      )}

      {/* 새 주소 입력 폼 */}
      {useNewAddress && (
        <div className="pickup-address-form">
          <div className="pickup-form-row">
            <div className="pickup-form-field">
              <label className="pickup-field-label">수령인 *</label>
              <input
                autoComplete="name"
                className="pickup-input"
                onChange={(e) =>
                  setAddress((p) => ({ ...p, recipient_name: e.target.value }))
                }
                placeholder="홍길동"
                value={address.recipient_name}
              />
            </div>
            <div className="pickup-form-field">
              <label className="pickup-field-label">연락처 *</label>
              <input
                autoComplete="tel"
                className="pickup-input"
                inputMode="tel"
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                  const formatted =
                    digits.length > 7
                      ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
                      : digits.length > 3
                        ? `${digits.slice(0, 3)}-${digits.slice(3)}`
                        : digits;
                  setAddress((p) => ({ ...p, recipient_phone: formatted }));
                }}
                placeholder="010-1234-5678"
                type="tel"
                value={address.recipient_phone}
              />
            </div>
          </div>
          <div className="pickup-form-field">
            <label className="pickup-field-label">주소 *</label>
            <button
              className="pickup-input pickup-input--clickable"
              onClick={openDaumPostcode}
              type="button"
            >
              {address.address_line1 ||
                (isSearchingAddress ? "불러오는 중..." : "주소 검색")}
            </button>
            {address.postal_code && (
              <span className="pickup-field-hint">
                우편번호: {address.postal_code}
              </span>
            )}
          </div>
          <div className="pickup-form-field">
            <label className="pickup-field-label">상세 주소 *</label>
            <input
              className="pickup-input"
              onChange={(e) =>
                setAddress((p) => ({ ...p, address_line2: e.target.value }))
              }
              placeholder="동/호수"
              ref={detailRef}
              value={address.address_line2}
            />
          </div>
        </div>
      )}

      {/* 이메일 / 공동현관 비밀번호 */}
      <div className="pickup-form-row">
        <div className="pickup-form-field">
          <label className="pickup-field-label">이메일 주소</label>
          <input
            className="pickup-input"
            onChange={(e) =>
              setAddress((p) => ({ ...p, email: e.target.value }))
            }
            placeholder="example@subook.kr"
            type="email"
            value={address.email}
          />
        </div>
        <PickupPasswordField
          value={address.entrance_password}
          onChange={(value) =>
            setAddress((p) => ({ ...p, entrance_password: value }))
          }
        />
      </div>

      {/* 희망 수거일 */}
      <div className="pickup-form-field">
        <label className="pickup-field-label">희망 수거일</label>
        <input
          className="pickup-input"
          min={minPickupDate}
          onChange={(e) =>
            setAddress((p) => ({ ...p, desired_pickup_date: e.target.value }))
          }
          type="date"
          value={address.desired_pickup_date}
        />
        <span className="pickup-field-hint">
          오늘 신청 시 가장 빠른 수거일은 <strong>{minPickupDate}</strong>
          이에요. 주말·공휴일은 수거가 어려워요.
        </span>
        {pickupDateNotice && (
          <span className="pickup-field-hint pickup-field-hint--warn">
            {pickupDateNotice}
          </span>
        )}
      </div>

      {/* 예상권수 / 박스개수 (필수) */}
      <div className="pickup-form-row">
        <div className="pickup-form-field">
          <label className="pickup-field-label">예상 권수 *</label>
          <input
            className="pickup-input"
            inputMode="numeric"
            min="1"
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
              setAddress((p) => ({ ...p, expected_book_count: digits }));
            }}
            placeholder="예: 25"
            type="text"
            value={address.expected_book_count}
          />
          <span className="pickup-field-hint">
            실제 정산 권수는 검수 후 확정돼요.
          </span>
        </div>
        <div className="pickup-form-field">
          <label className="pickup-field-label">박스 개수 *</label>
          <input
            className="pickup-input"
            inputMode="numeric"
            min="1"
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
              setAddress((p) => ({ ...p, box_count: digits }));
            }}
            placeholder="예: 2"
            type="text"
            value={address.box_count}
          />
          <span className="pickup-field-hint">
            정산 시 박스당 <strong>5,000원</strong>의 비용이 차감돼요.
          </span>
        </div>
      </div>

      {/* 포장 안내 */}
      <div className="pickup-info-box">
        <p className="pickup-info-box__title">
          <img
            src={boxIconPng}
            alt=""
            aria-hidden="true"
            className="pickup-info-box__title-icon"
          />{" "}
          포장 안내
        </p>
        <ul className="pickup-info-box__list">
          <li>빈 공간 없이 딱 맞는 박스에 담아주세요.</li>
          <li>여러 박스로 나누지 말고 가장 큰 박스 하나에 담는게 유리해요.</li>
          <li>교재가 흔들리지 않도록 포장해주세요.</li>
        </ul>
      </div>

      {!isValid && (
        <p className="pickup-step__invalid-hint">
          {!address.recipient_name.trim() ||
          !address.recipient_phone.trim() ||
          !isValidKoreanMobile(address.recipient_phone)
            ? "수령인 이름과 휴대폰 번호를 정확히 입력해주세요."
            : !address.postal_code.trim() || !address.address_line1.trim()
              ? "주소 검색으로 도로명/지번 주소를 선택해주세요."
              : !address.address_line2.trim()
                ? "상세 주소(동/호수)를 입력해주세요."
                : !(
                      Number.isFinite(expectedCountNumber) &&
                      expectedCountNumber > 0
                    )
                  ? "예상 권수를 입력해주세요."
                  : !(Number.isFinite(boxCountNumber) && boxCountNumber > 0)
                    ? "박스 개수를 입력해주세요."
                    : "필수 입력값을 모두 채워주세요."}
        </p>
      )}

      <div className="pickup-step-actions">
        <div />
        <button
          className="pickup-btn pickup-btn--primary"
          disabled={!isValid}
          onClick={onNext}
          type="button"
        >
          다음 단계 <ArrowRightIcon size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: 정산 정보 ───
function StepSettlement({
  account,
  setAccount,
  savedAccounts,
  memberProfileName = "",
  policyAgreed,
  setPolicyAgreed,
  onPrev,
  onNext,
}) {
  const [selectedSavedId, setSelectedSavedId] = useState(null);
  const [useNewAccount, setUseNewAccount] = useState(
    savedAccounts.length === 0,
  );
  const [showPolicyDetail, setShowPolicyDetail] = useState(false);

  // 신규 작성이면 기본 계좌 자동 선택. draft 복구 / 단계 이동(Step3→Step2 재진입) 시에는
  // 복구된 부모 account(저장계좌 account_id 또는 직접입력)에 맞춰 로컬 선택 상태를 동기화한다.
  // (이게 없으면 selectedSavedId가 null이라 어느 카드도 선택 안 되고 새 계좌 폼도 안 열리는 "유령 상태"가 됨)
  const settlementInitRef = useRef(false);
  useEffect(() => {
    if (settlementInitRef.current) return;
    const hasRestoredAccount =
      Boolean(account.account_id) || Boolean(account.account_number?.trim());
    // 저장계좌도 복구계좌도 아직 없으면 데이터 도착 후 재시도.
    if (savedAccounts.length === 0 && !hasRestoredAccount) return;
    settlementInitRef.current = true;

    if (account.account_id) {
      // 저장계좌를 골랐던 상태 — 해당 카드를 선택 표시(account 값은 그대로 유지).
      const matched = savedAccounts.some(
        (a) => String(a.id) === String(account.account_id),
      );
      setSelectedSavedId(matched ? account.account_id : null);
      setUseNewAccount(!matched); // 저장계좌가 사라졌으면 새 계좌 입력으로 폴백
      return;
    }
    if (account.account_number?.trim()) {
      // 새 계좌를 직접 입력 중이던 상태.
      setSelectedSavedId(null);
      setUseNewAccount(true);
      return;
    }
    // 신규 작성 — 기본 계좌 자동 선택.
    if (savedAccounts.length > 0) {
      const defaultAcc =
        savedAccounts.find((a) => a.is_default) || savedAccounts[0];
      selectSaved(defaultAcc);
    } else {
      setUseNewAccount(true);
    }
  }, [savedAccounts, account.account_id, account.account_number]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectSaved = (acc) => {
    setSelectedSavedId(acc.id);
    setUseNewAccount(false);
    // P0-2: 저장된 계좌 선택 시 account_number를 빈 값으로 두고 account_id만 식별자로 보존.
    // 마스킹된 계좌번호를 페이로드에 실어 보내면 잘못된 계좌번호가 RPC에 전달될 수 있음.
    setAccount({
      account_id: acc.id,
      bank_name: acc.bank_name,
      account_number: "",
      account_number_masked: acc.account_number_masked || acc.account_number,
      account_number_last4: acc.account_last4 ?? acc.account_number_last4,
      account_holder: acc.account_holder,
    });
  };

  const startNewAccount = () => {
    setSelectedSavedId(null);
    setUseNewAccount(true);
    setAccount({
      account_id: null,
      bank_name: "",
      account_number: "",
      account_number_masked: "",
      account_number_last4: "",
      account_holder: "",
    });
  };

  const allAgreed =
    policyAgreed.consignment && policyAgreed.privacy && policyAgreed.disposal;
  const togglePolicy = (key) => (event) => {
    setPolicyAgreed((prev) => ({ ...prev, [key]: event.target.checked }));
  };
  const toggleAll = (event) => {
    const checked = event.target.checked;
    setPolicyAgreed({
      consignment: checked,
      privacy: checked,
      disposal: checked,
    });
  };

  const isValid =
    account.bank_name.trim() &&
    (account.account_id || account.account_number.trim()) &&
    account.account_holder.trim() &&
    allAgreed;

  return (
    <div className="pickup-step">
      <div className="pickup-step__header">
        <h2 className="pickup-step__title">정산 계좌를 입력해주세요</h2>
        <p className="pickup-step__subtitle">
          판매 금액이 정산될 계좌를 알려주세요.
        </p>
      </div>

      {/* 저장된 계좌 선택 */}
      {savedAccounts.length > 0 && (
        <div className="pickup-saved-list">
          {savedAccounts.map((acc) => (
            <label
              className={`pickup-saved-card ${selectedSavedId === acc.id && !useNewAccount ? "is-selected" : ""}`}
              key={acc.id}
            >
              <input
                checked={selectedSavedId === acc.id && !useNewAccount}
                className="pickup-saved-card__radio"
                name="pickup-account"
                onChange={() => selectSaved(acc)}
                type="radio"
              />
              <div className="pickup-saved-card__content">
                <div className="pickup-saved-card__top">
                  <span className="pickup-saved-card__label">
                    {acc.bank_name}
                  </span>
                  {acc.is_default && (
                    <span className="pickup-saved-card__default">기본</span>
                  )}
                </div>
                <span className="pickup-saved-card__name">
                  {acc.account_number_masked ||
                    (acc.account_last4 || acc.account_number_last4
                      ? `****${acc.account_last4 ?? acc.account_number_last4}`
                      : acc.account_number)}
                  {" · "}
                  {acc.account_holder}
                </span>
              </div>
            </label>
          ))}
          <label
            className={`pickup-saved-card ${useNewAccount ? "is-selected" : ""}`}
          >
            <input
              checked={useNewAccount}
              className="pickup-saved-card__radio"
              name="pickup-account"
              onChange={startNewAccount}
              type="radio"
            />
            <span className="pickup-saved-card__new">+ 새 계좌 등록</span>
          </label>
        </div>
      )}

      {/* 새 계좌 입력 */}
      {useNewAccount && (
        <div className="pickup-address-form">
          <div className="pickup-form-field">
            <label className="pickup-field-label">은행 *</label>
            <select
              className="pickup-select"
              onChange={(e) =>
                setAccount((p) => ({
                  ...p,
                  account_id: null,
                  bank_name: e.target.value,
                }))
              }
              value={account.bank_name}
            >
              <option value="">은행 선택</option>
              {BANK_LIST.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div className="pickup-form-row">
            <div className="pickup-form-field">
              <label className="pickup-field-label">계좌번호 *</label>
              <input
                className="pickup-input"
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^\d-]/g, "");
                  setAccount((p) => ({
                    ...p,
                    account_id: null,
                    account_number: cleaned,
                    account_number_last4: "",
                  }));
                }}
                placeholder="110-123-456789"
                value={account.account_number}
              />
            </div>
            <div className="pickup-form-field">
              <label className="pickup-field-label">예금주 *</label>
              <input
                autoComplete="name"
                className="pickup-input"
                onChange={(e) =>
                  setAccount((p) => ({
                    ...p,
                    account_id: null,
                    account_holder: e.target.value,
                  }))
                }
                placeholder="홍길동"
                value={account.account_holder}
              />
              {/* 본인명 검증 경고 — 정산 사고 1순위는 "예금주 다르게 적어 정산금 분쟁".
                  강제 차단은 미성년자가 부모 계좌 쓰는 케이스가 있어 안 함. 명시적 경고로 의식적 선택 유도. */}
              {memberProfileName &&
              account.account_holder.trim().length > 0 &&
              account.account_holder.trim() !== memberProfileName ? (
                <p className="pickup-field-hint pickup-field-hint--warning">
                  <AlertTriangleIcon size={13} /> 예금주 "
                  {account.account_holder.trim()}"가 가입자명 "
                  {memberProfileName}"과 달라요. 가족 계좌가 맞다면 그대로
                  진행하셔도 됩니다. 본인 계좌라면 다시 확인해주세요.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* 판매 정책 — 전체동의 + 펼치기 패턴 */}
      <div className="pickup-policy-agree">
        <label className="pickup-checkbox-label pickup-checkbox-label--all">
          <input
            checked={allAgreed}
            className="pickup-checkbox"
            onChange={toggleAll}
            type="checkbox"
          />
          <span>
            전체 동의 <span className="pickup-required">[필수]</span>
          </span>
        </label>

        <ul className="pickup-policy-agree__list">
          <li>
            <label className="pickup-checkbox-label pickup-checkbox-label--sub">
              <input
                checked={policyAgreed.consignment}
                className="pickup-checkbox"
                onChange={togglePolicy("consignment")}
                type="checkbox"
              />
              <span>
                (필수) 위탁판매 약관 동의 — 수수료(1만원 초과 40%, 이하 45%) ·
                매월 1일 정산
              </span>
            </label>
          </li>
          <li>
            <label className="pickup-checkbox-label pickup-checkbox-label--sub">
              <input
                checked={policyAgreed.privacy}
                className="pickup-checkbox"
                onChange={togglePolicy("privacy")}
                type="checkbox"
              />
              <span>
                (필수) 개인정보 제3자 제공 동의 — CJ대한통운에 수령인
                이름·연락처·주소 전달
              </span>
            </label>
          </li>
          <li>
            <label className="pickup-checkbox-label pickup-checkbox-label--sub">
              <input
                checked={policyAgreed.disposal}
                className="pickup-checkbox"
                onChange={togglePolicy("disposal")}
                type="checkbox"
              />
              <span>
                (필수) 판매불가 교재 자체 폐기 동의 — 필기·형광펜이 있거나
                표지·내지 손상 시 폐기
              </span>
            </label>
          </li>
        </ul>

        <button
          className="pickup-link-button pickup-policy-agree__toggle"
          onClick={() => setShowPolicyDetail((v) => !v)}
          type="button"
        >
          {showPolicyDetail ? "약관 자세히 닫기 ▲" : "약관 자세히 보기 ▼"}
        </button>

        {showPolicyDetail && (
          <div className="pickup-policy-box">
            <div className="pickup-policy-box__section">
              <p className="pickup-policy-box__heading">수수료 안내</p>
              <ul className="pickup-policy-box__list">
                <li>1만원 초과 교재: 판매가의 40%</li>
                <li>1만원 이하 교재·모의고사: 판매가의 45%</li>
              </ul>
            </div>
            <div className="pickup-policy-box__section">
              <p className="pickup-policy-box__heading">검수 안내</p>
              <ul className="pickup-policy-box__list">
                <li>새 교재 + 현재 수능 기준 3개년 이내 교재만 접수</li>
                <li>
                  새 책 기준: 비닐 개봉 OK, 필기·형광펜 0%, 표지·내지 양호
                </li>
                <li>
                  위 기준 미달 교재(필기·형광펜 있음, 표지·내지 손상 등)는
                  판매불가 → 자체 폐기(반송 없음)
                </li>
              </ul>
            </div>
            <div className="pickup-policy-box__section">
              <p className="pickup-policy-box__heading">수거·정산 안내</p>
              <ul className="pickup-policy-box__list">
                <li>수거는 무료 (별도 수거 비용 없음)</li>
                <li>
                  박스 1개당 상품화 비용 5,000원 — 정산 시 차감 (박스 수 ×
                  5,000원)
                </li>
                <li>구매확정된 판매분은 매월 1일 계좌이체</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="pickup-step-actions">
        <button
          className="pickup-btn pickup-btn--secondary"
          onClick={onPrev}
          type="button"
        >
          ← 이전
        </button>
        <button
          className="pickup-btn pickup-btn--primary"
          disabled={!isValid}
          onClick={onNext}
          type="button"
        >
          다음 단계 <ArrowRightIcon size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: 확인 및 제출 ───
function StepConfirm({
  address,
  account,
  isSubmitting,
  onPrev,
  onSubmit,
  goToStep,
}) {
  const expectedCount = Number.parseInt(address.expected_book_count, 10) || 0;
  const boxCount = Number.parseInt(address.box_count, 10) || 0;

  return (
    <div className="pickup-step">
      <div className="pickup-step__header">
        <h2 className="pickup-step__title">아래 내용을 확인해주세요</h2>
      </div>

      {/* 수거 수량 요약 */}
      <div className="pickup-confirm-section">
        <div className="pickup-confirm-section__header">
          <span className="pickup-confirm-section__icon">
            <BoxIcon size={18} />
          </span>
          <span className="pickup-confirm-section__title">수거 수량</span>
          <button
            className="pickup-link-button"
            onClick={() => goToStep(0)}
            type="button"
          >
            수정 <ArrowRightIcon size={13} />
          </button>
        </div>
        <div className="pickup-confirm-detail">
          <p>
            예상 권수 <strong>{expectedCount}권</strong> · 박스{" "}
            <strong>{boxCount}개</strong>
          </p>
          <p className="pickup-confirm-detail__memo">
            어떤 교재인지는 따로 적지 않으셔도 돼요. 검수 과정에서 수북이 대신
            등록하고, 교재별 판매가는 마이페이지를 통해 안내해 드려요.
          </p>
        </div>
      </div>

      {/* 수거 주소 요약 */}
      <div className="pickup-confirm-section">
        <div className="pickup-confirm-section__header">
          <span className="pickup-confirm-section__icon">
            <MapPinIcon size={18} />
          </span>
          <span className="pickup-confirm-section__title">수거 주소</span>
          <button
            className="pickup-link-button"
            onClick={() => goToStep(0)}
            type="button"
          >
            수정 <ArrowRightIcon size={13} />
          </button>
        </div>
        <div className="pickup-confirm-detail">
          <p>
            {address.recipient_name} · {address.recipient_phone}
          </p>
          <p>
            {address.address_line1}
            {address.address_line2 ? `, ${address.address_line2}` : ""}
          </p>
          {address.desired_pickup_date && (
            <p>희망 수거일: {address.desired_pickup_date}</p>
          )}
          {address.memo && (
            <p className="pickup-confirm-detail__memo">요청: {address.memo}</p>
          )}
        </div>
      </div>

      {/* 정산 계좌 요약 — account_number는 P0-2로 인해 비어있음, 마스킹된 표시 사용 */}
      <div className="pickup-confirm-section">
        <div className="pickup-confirm-section__header">
          <span className="pickup-confirm-section__icon">
            <CoinIcon size={18} />
          </span>
          <span className="pickup-confirm-section__title">정산 계좌</span>
          <button
            className="pickup-link-button"
            onClick={() => goToStep(1)}
            type="button"
          >
            수정 <ArrowRightIcon size={13} />
          </button>
        </div>
        <div className="pickup-confirm-detail">
          <p>
            {account.bank_name} ·{" "}
            {account.account_number ||
              account.account_number_masked ||
              (account.account_number_last4
                ? `****${account.account_number_last4}`
                : "")}
            {" · "}
            {account.account_holder}
          </p>
          <p className="pickup-confirm-detail__memo">
            정산 예상 시점: <strong>매월 1일</strong>
          </p>
        </div>
      </div>

      {/* 박스 포장 및 발송 규정 + 검수 탈락 교재 처리 안내 (제출 직전 정책 고지) */}
      <div className="pickup-confirm-section">
        <div className="pickup-confirm-section__header">
          <span className="pickup-confirm-section__icon">
            <BoxIcon size={18} />
          </span>
          <span className="pickup-confirm-section__title">
            박스 포장 및 발송 규정
          </span>
        </div>
        <div className="pickup-confirm-detail">
          <p>
            박스 1개당 상품화 비용 <strong>5,000원</strong>
            {boxCount > 0
              ? ` · 현재 ${boxCount}박스 기준 ${(boxCount * 5000).toLocaleString()}원`
              : ""}
          </p>
          <p className="pickup-confirm-detail__memo">
            교재 권수와 무관하게 “박스당” 비용이 부과돼요. 여러 박스에 나눠
            보내면 박스 수 × 5,000원이 부과되니, 가능하면{" "}
            <strong>가장 큰 박스 하나에</strong> 담아주세요.
          </p>
          <p className="pickup-confirm-detail__memo">
            사전 결제가 아니라, 교재 판매 후 <strong>정산 과정에서 차감</strong>
            되는 구조예요.
          </p>
          <p className="pickup-confirm-detail__memo">
            별도의 수거 비용은 없습니다. (무료 수거)
          </p>
        </div>
      </div>

      <div className="pickup-confirm-section">
        <div className="pickup-confirm-section__header">
          <span className="pickup-confirm-section__icon">
            <SearchIcon size={18} />
          </span>
          <span className="pickup-confirm-section__title">
            검수 탈락 교재 처리 안내
          </span>
        </div>
        <div className="pickup-confirm-detail">
          <p className="pickup-confirm-detail__memo">
            실제 판매로 등록되는 교재 수량은 검수가 완료된 후 마이페이지에서
            직접 확인하실 수 있어요.
          </p>
          <p className="pickup-confirm-detail__memo">
            검수 기준 미달로 탈락한 교재는 수북에서 자체 폐기되며,{" "}
            <strong>반송은 진행되지 않습니다.</strong>
          </p>
          <p className="pickup-confirm-detail__memo">
            반드시 <strong>새 교재 + 현재 수능 기준 3개년 이내</strong>의 교재만
            접수해 주세요.
          </p>
        </div>
      </div>

      {/* 안내 */}
      <div className="pickup-info-box">
        <p className="pickup-info-box__tip">
          <InfoIcon size={13} /> 수거 요청 후 박스를 포장하여 문 앞에
          놓아주세요. 택배기사가 1~2일 내에 수거합니다.
        </p>
      </div>

      <div className="pickup-step-actions">
        <button
          className="pickup-btn pickup-btn--secondary"
          disabled={isSubmitting}
          onClick={onPrev}
          type="button"
        >
          ← 이전
        </button>
        <button
          className="pickup-btn pickup-btn--primary"
          disabled={isSubmitting}
          onClick={onSubmit}
          type="button"
        >
          {isSubmitting ? "요청 중..." : "수거 요청하기"}
        </button>
      </div>
    </div>
  );
}

// ─── 성공 페이지 ───
function PickupSuccess({ result, expectedCount, boxCount }) {
  const navigate = useNavigate();

  return (
    <div className="pickup-success">
      <span
        className="pickup-success__icon"
        style={{ color: "var(--public-ds-success)" }}
      >
        <CheckCircleIcon size={56} />
      </span>
      <h2 className="pickup-success__title">수거 요청이 완료되었어요!</h2>
      <div className="pickup-success__info">
        <p>
          요청번호: <strong>{result.request_number}</strong>
        </p>
        <p>
          예상 {expectedCount}권 · 박스 {boxCount}개
        </p>
      </div>
      <div className="pickup-success__guide">
        <p className="pickup-success__guide-step">
          <strong>1. 운송장은 택배기사가 가져옵니다.</strong>
          <span> 별도로 인쇄하지 않으셔도 돼요.</span>
        </p>
        <p className="pickup-success__guide-step">
          <strong>
            2. 박스 겉면에 신청번호 ({result.request_number})와 셀러 이름을
            매직으로 적어주세요.
          </strong>
          <span> 다른 셀러 박스와 섞이는 사고를 막아요.</span>
        </p>
        <p className="pickup-success__guide-step">
          <strong>
            3. 비 오는 날에는 비닐로 한 번 더 감싸 문 안쪽이나 경비실에 두세요.
          </strong>
          <span> 책 습기로 인한 폐기 판정을 줄여요.</span>
        </p>
        <p className="pickup-success__guide-hint">
          1~2일 내 CJ대한통운 택배기사가 수거합니다. 문제가 생기면{" "}
          <a
            className="pickup-success__guide-link"
            href="https://pf.kakao.com/_subook"
            rel="noopener noreferrer"
            target="_blank"
          >
            카카오톡 채널
          </a>
          로 문의해주세요.
        </p>
      </div>
      <div className="pickup-success__actions">
        <button
          className="pickup-btn pickup-btn--primary"
          onClick={() => navigate("/mypage#sales")}
          type="button"
        >
          수거 현황 보기
        </button>
        <button
          className="pickup-btn pickup-btn--ghost"
          onClick={() => navigate("/")}
          type="button"
        >
          홈으로
        </button>
      </div>
    </div>
  );
}

// ─── 취소 확인 모달 ───
function CancelConfirmModal({ onConfirm, onCancel }) {
  return (
    <div className="pickup-overlay" onClick={onCancel}>
      <div
        className="pickup-modal pickup-modal--sm"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
      >
        <div className="pickup-modal__body pickup-modal__body--center">
          <p className="pickup-modal__message">
            작성 중인 내용이 사라집니다.
            <br />
            정말 나가시겠습니까?
          </p>
        </div>
        <div className="pickup-modal__footer">
          <button
            className="pickup-btn pickup-btn--secondary"
            onClick={onCancel}
            type="button"
          >
            계속 작성
          </button>
          <button
            className="pickup-btn pickup-btn--danger"
            onClick={onConfirm}
            type="button"
          >
            나가기
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 페이지 ───
function PublicPickupRequestPage() {
  usePageMeta({
    title: "교재 위탁판매 신청",
    description:
      "안 쓰는 수능 교재를 CJ 픽업으로 보내고 검수 후 정산까지. 예상 권수와 박스 수만 알려주면 끝.",
  });
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, user } = usePublicAuth();

  const [currentStep, setCurrentStep] = useState(0);
  const [address, setAddress] = useState({
    recipient_name: "",
    recipient_phone: "",
    postal_code: "",
    address_line1: "",
    address_line2: "",
    memo: "",
    email: "",
    entrance_password: "",
    desired_pickup_date: "",
    expected_book_count: "",
    box_count: "",
  });
  const [account, setAccount] = useState({
    account_id: null,
    bank_name: "",
    account_number: "",
    account_number_masked: "",
    account_number_last4: "",
    account_holder: "",
  });
  const [policyAgreed, setPolicyAgreed] = useState({
    consignment: false,
    privacy: false,
    disposal: false,
  });
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [memberProfileName, setMemberProfileName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [toast, setToast] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  // 작성 중인 draft 복구 안내
  const [draftPrompt, setDraftPrompt] = useState(null); // { address, account, step, savedAt } | null
  const draftDecidedRef = useRef(false);
  const draftReadyRef = useRef(false);

  const showToast = useCallback((message, tone = "info") => {
    setToast({ message, tone, key: Date.now() });
  }, []);

  // 저장된 주소/계좌 로딩
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      try {
        const snapshot = await loadMemberPortalSnapshot({ user });
        if (cancelled) return;
        setSavedAddresses(snapshot.shippingAddresses ?? []);
        setSavedAccounts(snapshot.settlementAccounts ?? []);

        // 프로필에서 이름/전화번호 기본값 설정
        if (snapshot.profile) {
          setMemberProfileName(String(snapshot.profile.name ?? "").trim());
          setAddress((prev) => ({
            ...prev,
            recipient_name: prev.recipient_name || snapshot.profile.name || "",
            recipient_phone:
              prev.recipient_phone || snapshot.profile.phone || "",
          }));
        }
      } catch {
        // 로딩 실패 시 빈 상태로 진행
      } finally {
        if (!cancelled) setIsLoadingData(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // 마운트 시 draft 복구 후보 확인 (한 번만)
  useEffect(() => {
    if (draftDecidedRef.current) return;
    const draft = readDraft();
    if (
      draft &&
      draft.address &&
      (draft.address.recipient_name ||
        draft.address.address_line1 ||
        draft.address.expected_book_count)
    ) {
      setDraftPrompt(draft);
    } else {
      draftDecidedRef.current = true;
      draftReadyRef.current = true;
    }
  }, []);

  // 사용자가 결정 후에만 작성 내용을 sessionStorage에 debounce 저장
  useEffect(() => {
    if (!draftReadyRef.current) return;
    // 빈 상태(처음 진입)에서는 저장하지 않음
    if (
      !address.address_line1 &&
      !address.recipient_name &&
      !address.expected_book_count
    )
      return;
    const timer = setTimeout(() => {
      writeDraft({ address, account, policyAgreed, step: currentStep });
    }, 500);
    return () => clearTimeout(timer);
  }, [address, account, policyAgreed, currentStep]);

  const handleDraftContinue = () => {
    if (!draftPrompt) return;
    if (draftPrompt.address && typeof draftPrompt.address === "object") {
      setAddress((prev) => ({ ...prev, ...draftPrompt.address }));
    }
    if (draftPrompt.account && typeof draftPrompt.account === "object") {
      setAccount((prev) => ({ ...prev, ...draftPrompt.account }));
    }
    if (
      draftPrompt.policyAgreed &&
      typeof draftPrompt.policyAgreed === "object"
    ) {
      setPolicyAgreed((prev) => ({ ...prev, ...draftPrompt.policyAgreed }));
    }
    if (Number.isFinite(draftPrompt.step))
      setCurrentStep(Math.min(2, Math.max(0, draftPrompt.step)));
    setDraftPrompt(null);
    draftDecidedRef.current = true;
    draftReadyRef.current = true;
  };

  const handleDraftDiscard = () => {
    clearDraft();
    setDraftPrompt(null);
    draftDecidedRef.current = true;
    draftReadyRef.current = true;
  };

  const handleCancel = () => {
    if (
      address.address_line1 ||
      address.recipient_name ||
      address.expected_book_count
    ) {
      setShowCancelModal(true);
    } else {
      navigate(-1);
    }
  };

  const goToStep = (step) => {
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const allAgreed =
      policyAgreed.consignment && policyAgreed.privacy && policyAgreed.disposal;
    const { data, error } = await submitPickupRequest({
      pickupAddress: address,
      settlementAccount: account,
      policyAgreed: allAgreed,
    });

    setIsSubmitting(false);

    if (error) {
      showToast("요청에 실패했습니다. 다시 시도해주세요.", "error");
      return;
    }

    // 신청 성공 시 draft cleanup
    clearDraft();
    setSubmitResult(data);
  };

  // 인증 체크
  if (isLoading) {
    return (
      <div className="pickup-page">
        <PublicSiteHeader />
        <main className="pickup-route">
          <div className="pickup-shell">
            <div className="pickup-loading">
              <span className="pickup-loading__icon">⏳</span>
              <p>수거 요청 화면을 준비하고 있어요</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        replace
        state={{
          from: {
            pathname: PICKUP_REQUEST_PATH,
            search: location.search,
            hash: location.hash,
          },
          notice: "수거 요청을 진행하려면 로그인해 주세요.",
        }}
        to="/login"
      />
    );
  }

  // 제출 성공
  if (submitResult) {
    return (
      <div className="pickup-page">
        <PublicSiteHeader />
        <main className="pickup-route">
          <div className="pickup-shell">
            <PickupSuccess
              boxCount={Number.parseInt(address.box_count, 10) || 0}
              expectedCount={
                Number.parseInt(address.expected_book_count, 10) || 0
              }
              result={submitResult}
            />
          </div>
        </main>
        <PublicFooter />
      </div>
    );
  }

  return (
    <div className="pickup-page">
      <PublicSiteHeader />

      <main className="pickup-route">
        <div className="pickup-shell">
          {/* 상단 뒤로/취소 */}
          <button
            className="pickup-back-btn"
            onClick={handleCancel}
            type="button"
          >
            <span aria-hidden="true">←</span>
            <span>돌아가기</span>
          </button>

          {/* 작성 중 신청서 이어쓰기 안내 */}
          {draftPrompt && (
            <div className="pickup-draft-banner" role="status">
              <div className="pickup-draft-banner__text">
                <strong>작성 중이던 신청서가 있어요.</strong>
                <span>이어서 작성할까요?</span>
              </div>
              <div className="pickup-draft-banner__actions">
                <button
                  className="pickup-btn pickup-btn--secondary pickup-btn--sm"
                  onClick={handleDraftDiscard}
                  type="button"
                >
                  새로 시작
                </button>
                <button
                  className="pickup-btn pickup-btn--primary pickup-btn--sm"
                  onClick={handleDraftContinue}
                  type="button"
                >
                  이어서 작성
                </button>
              </div>
            </div>
          )}

          {/* 헤더 + 프로그레스 */}
          <div className="pickup-card">
            <div className="pickup-card__top">
              <div className="pickup-card__top-text">
                <h1 className="pickup-card__page-title">수거 요청</h1>
              </div>
              <ProgressBar currentStep={currentStep} />
            </div>

            <div className="pickup-card__content">
              {isLoadingData ? (
                <div className="pickup-loading">
                  <span className="pickup-loading__icon">⏳</span>
                  <p>회원 정보를 불러오는 중...</p>
                </div>
              ) : (
                <>
                  {currentStep === 0 && (
                    <StepAddress
                      address={address}
                      onNext={() => goToStep(1)}
                      savedAddresses={savedAddresses}
                      setAddress={setAddress}
                      showToast={showToast}
                    />
                  )}
                  {currentStep === 1 && (
                    <StepSettlement
                      account={account}
                      memberProfileName={memberProfileName}
                      onNext={() => goToStep(2)}
                      onPrev={() => goToStep(0)}
                      policyAgreed={policyAgreed}
                      savedAccounts={savedAccounts}
                      setAccount={setAccount}
                      setPolicyAgreed={setPolicyAgreed}
                    />
                  )}
                  {currentStep === 2 && (
                    <StepConfirm
                      account={account}
                      address={address}
                      goToStep={goToStep}
                      isSubmitting={isSubmitting}
                      onPrev={() => goToStep(1)}
                      onSubmit={handleSubmit}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />

      {/* 토스트 */}
      {toast && (
        <Toast
          key={toast.key}
          message={toast.message}
          onClose={() => setToast(null)}
          tone={toast.tone}
        />
      )}

      {/* 취소 확인 모달 */}
      {showCancelModal && (
        <CancelConfirmModal
          onCancel={() => setShowCancelModal(false)}
          onConfirm={() => {
            setShowCancelModal(false);
            if (window.history.length > 1) navigate(-1);
            else navigate("/", { replace: true });
          }}
        />
      )}
    </div>
  );
}

export default PublicPickupRequestPage;
