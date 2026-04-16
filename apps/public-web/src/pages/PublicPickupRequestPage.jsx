import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import PublicSiteHeader from "../components/PublicSiteHeader";
import PublicFooter from "../components/PublicFooter";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import {
  BANK_LIST,
  BOOK_TYPES,
  BRANDS,
  SUBJECTS,
  YEARS,
  createEmptyManualItem,
  createItemFromProduct,
  searchBooksForPickup,
  submitPickupRequest,
} from "../lib/pickupRequest";
import {
  loadMemberPortalSnapshot,
} from "../lib/memberPortal";
import "./PublicPickupRequestPage.css";

const PICKUP_REQUEST_PATH = "/pickup/new";
const STEPS = ["교재 등록", "수거 정보", "정산 정보", "확인"];

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
              {isDone ? "✓" : index + 1}
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

  const icon = tone === "error" ? "❌" : tone === "success" ? "✅" : "ℹ️";

  return (
    <div className={`pickup-toast pickup-toast--${tone}`} role="alert">
      <span className="pickup-toast__icon">{icon}</span>
      <span className="pickup-toast__message">{message}</span>
    </div>
  );
}

// ─── Step 1: 교재 등록 ───
function StepBooks({ items, setItems, onNext, showToast }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState(createEmptyManualItem);
  const [editingId, setEditingId] = useState(null);
  const searchTimerRef = useRef(null);

  const handleSearch = useCallback((value) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (value.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      setIsSearching(true);
      const { results } = await searchBooksForPickup(value);
      setSearchResults(results);
      setIsSearching(false);
    }, 300);
  }, []);

  const addFromSearch = (product) => {
    if (items.some((item) => item.book_id === product.id)) {
      showToast("이미 추가된 교재입니다.", "error");
      return;
    }
    setItems((prev) => [...prev, createItemFromProduct(product)]);
    showToast("교재가 추가되었습니다.", "success");
    setSearchQuery("");
    setSearchResults([]);
  };

  const openManualForm = () => {
    setManualForm(createEmptyManualItem());
    setEditingId(null);
    setShowManualForm(true);
  };

  const saveManualItem = () => {
    if (!manualForm.title.trim()) {
      showToast("교재명을 입력해주세요.", "error");
      return;
    }

    if (editingId) {
      setItems((prev) =>
        prev.map((item) => (item.localId === editingId ? { ...manualForm, localId: editingId } : item)),
      );
      showToast("교재가 수정되었습니다.", "success");
    } else {
      setItems((prev) => [...prev, manualForm]);
      showToast("교재가 추가되었습니다.", "success");
    }
    setShowManualForm(false);
    setEditingId(null);
  };

  const editItem = (item) => {
    setManualForm({ ...item });
    setEditingId(item.localId);
    setShowManualForm(true);
  };

  const removeItem = (localId) => {
    setItems((prev) => prev.filter((item) => item.localId !== localId));
    showToast("교재가 삭제되었습니다.", "info");
  };

  const updateItemMemo = (localId, memo) => {
    setItems((prev) =>
      prev.map((item) => (item.localId === localId ? { ...item, condition_memo: memo } : item)),
    );
  };

  return (
    <div className="pickup-step">
      <div className="pickup-step__header">
        <h2 className="pickup-step__title">보낼 교재를 등록해주세요</h2>
        <p className="pickup-step__subtitle">교재 DB에서 검색하거나, 직접 입력할 수 있어요.</p>
      </div>

      {/* 교재 검색 */}
      <div className="pickup-search">
        <label className="pickup-field-label" htmlFor="pickup-book-search">교재 검색</label>
        <div className="pickup-search__field">
          <span aria-hidden="true" className="pickup-search__icon">🔍</span>
          <input
            className="pickup-search__input"
            id="pickup-book-search"
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="교재명, 강사명, 브랜드로 검색"
            type="search"
            value={searchQuery}
          />
          {searchQuery && (
            <button
              className="pickup-search__clear"
              onClick={() => { setSearchQuery(""); setSearchResults([]); }}
              type="button"
            >
              ×
            </button>
          )}
        </div>

        {/* 검색 결과 */}
        {(isSearching || searchResults.length > 0) && (
          <div className="pickup-search-results">
            {isSearching && <p className="pickup-search-results__loading">검색 중...</p>}
            {!isSearching && searchResults.length === 0 && searchQuery.trim().length >= 2 && (
              <p className="pickup-search-results__empty">검색 결과가 없습니다.</p>
            )}
            {searchResults.map((product) => (
              <div className="pickup-search-result" key={product.id}>
                <div className="pickup-search-result__info">
                  <span className="pickup-search-result__title">
                    {[product.title, product.option].filter(Boolean).join(" ")}
                  </span>
                  <span className="pickup-search-result__meta">
                    {[product.brand, product.subject, product.book_type,
                      product.original_price ? `정가 ${product.original_price.toLocaleString()}원` : null,
                    ].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <button
                  className="pickup-search-result__add"
                  onClick={() => addFromSearch(product)}
                  type="button"
                >
                  + 추가
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="pickup-field-hint">
          찾는 교재가 없나요?{" "}
          <button className="pickup-link-button" onClick={openManualForm} type="button">
            직접 입력하기 →
          </button>
        </p>
      </div>

      {/* 직접 입력 폼 */}
      {showManualForm && (
        <div className="pickup-overlay" onClick={() => setShowManualForm(false)}>
          <div className="pickup-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="교재 직접 입력">
            <div className="pickup-modal__header">
              <h3 className="pickup-modal__title">{editingId ? "교재 수정" : "교재 직접 입력"}</h3>
              <button className="pickup-modal__close" onClick={() => setShowManualForm(false)} type="button">×</button>
            </div>
            <div className="pickup-modal__body">
              <div className="pickup-form-field">
                <label className="pickup-field-label">교재명 *</label>
                <input
                  className="pickup-input"
                  onChange={(e) => setManualForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="예: 2026 시대인재 수학 N제"
                  value={manualForm.title}
                />
              </div>
              <div className="pickup-form-row">
                <div className="pickup-form-field">
                  <label className="pickup-field-label">브랜드 *</label>
                  <select
                    className="pickup-select"
                    onChange={(e) => setManualForm((f) => ({ ...f, brand: e.target.value }))}
                    value={manualForm.brand}
                  >
                    <option value="">선택해주세요</option>
                    {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="pickup-form-field">
                  <label className="pickup-field-label">과목 *</label>
                  <select
                    className="pickup-select"
                    onChange={(e) => setManualForm((f) => ({ ...f, subject: e.target.value }))}
                    value={manualForm.subject}
                  >
                    <option value="">선택해주세요</option>
                    {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="pickup-form-row">
                <div className="pickup-form-field">
                  <label className="pickup-field-label">연도</label>
                  <select
                    className="pickup-select"
                    onChange={(e) => setManualForm((f) => ({ ...f, published_year: Number(e.target.value) }))}
                    value={manualForm.published_year}
                  >
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="pickup-form-field">
                  <label className="pickup-field-label">교재 유형</label>
                  <select
                    className="pickup-select"
                    onChange={(e) => setManualForm((f) => ({ ...f, book_type: e.target.value }))}
                    value={manualForm.book_type}
                  >
                    <option value="">선택해주세요</option>
                    {BOOK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="pickup-modal__footer">
              <button className="pickup-btn pickup-btn--secondary" onClick={() => setShowManualForm(false)} type="button">
                취소
              </button>
              <button className="pickup-btn pickup-btn--primary" onClick={saveManualItem} type="button">
                {editingId ? "수정하기" : "등록하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 등록된 교재 목록 */}
      {items.length === 0 ? (
        <div className="pickup-empty">
          <span className="pickup-empty__icon">📚</span>
          <p className="pickup-empty__title">아직 추가한 교재가 없어요</p>
          <p className="pickup-empty__description">교재를 검색하거나 직접 입력해서 수거 요청을 시작해보세요.</p>
        </div>
      ) : (
        <div className="pickup-item-list">
          <p className="pickup-item-list__count">등록한 교재 ({items.length}권)</p>
          {items.map((item, index) => (
            <div className="pickup-item-card" key={item.localId}>
              <div className="pickup-item-card__header">
                <span className="pickup-item-card__number">{index + 1}.</span>
                <span className="pickup-item-card__title">{item.title}</span>
                {item.is_manual_entry && <span className="pickup-item-card__badge">직접입력</span>}
              </div>
              <div className="pickup-item-card__meta">
                {[item.brand, item.subject, item.book_type,
                  item.published_year ? `${item.published_year}년` : null,
                  item.original_price ? `정가 ${item.original_price.toLocaleString()}원` : null,
                ].filter(Boolean).join(" · ")}
              </div>
              <div className="pickup-item-card__memo">
                <input
                  className="pickup-input pickup-input--sm"
                  onChange={(e) => updateItemMemo(item.localId, e.target.value)}
                  placeholder="상태 메모 (선택) 예: 필기 거의 없음, 깨끗"
                  value={item.condition_memo}
                />
              </div>
              <div className="pickup-item-card__actions">
                <button className="pickup-link-button" onClick={() => editItem(item)} type="button">수정</button>
                <button className="pickup-link-button pickup-link-button--danger" onClick={() => removeItem(item.localId)} type="button">삭제</button>
              </div>
            </div>
          ))}
          <button className="pickup-btn pickup-btn--ghost" onClick={openManualForm} type="button">
            + 교재 더 추가하기
          </button>
        </div>
      )}

      {/* 하단 액션 */}
      <div className="pickup-step-actions">
        <div />
        <button
          className="pickup-btn pickup-btn--primary"
          disabled={items.length === 0}
          onClick={onNext}
          type="button"
        >
          다음 단계 →
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: 수거 정보 ───
function StepAddress({ address, setAddress, savedAddresses, onPrev, onNext, showToast }) {
  const [selectedSavedId, setSelectedSavedId] = useState(null);
  const [useNewAddress, setUseNewAddress] = useState(savedAddresses.length === 0);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const detailRef = useRef(null);

  useEffect(() => {
    if (savedAddresses.length > 0 && !selectedSavedId && !useNewAddress) {
      const defaultAddr = savedAddresses.find((a) => a.is_default) || savedAddresses[0];
      selectSaved(defaultAddr);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectSaved = (addr) => {
    setSelectedSavedId(addr.id);
    setUseNewAddress(false);
    setAddress({
      recipient_name: addr.recipient_name,
      recipient_phone: addr.recipient_phone,
      postal_code: addr.postal_code,
      address_line1: addr.address_line1,
      address_line2: addr.address_line2 || "",
      memo: addr.delivery_memo || "",
    });
  };

  const startNewAddress = () => {
    setSelectedSavedId(null);
    setUseNewAddress(true);
    setAddress({ recipient_name: "", recipient_phone: "", postal_code: "", address_line1: "", address_line2: "", memo: "" });
  };

  const openDaumPostcode = async () => {
    const loadScript = () =>
      new Promise((resolve, reject) => {
        if (window.daum?.Postcode) { resolve(); return; }
        const existing = document.getElementById("subook-daum-postcode-script");
        if (existing) { existing.addEventListener("load", resolve, { once: true }); existing.addEventListener("error", reject, { once: true }); return; }
        const script = document.createElement("script");
        script.id = "subook-daum-postcode-script";
        script.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
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
    address.postal_code.trim() &&
    address.address_line1.trim();

  return (
    <div className="pickup-step">
      <div className="pickup-step__header">
        <h2 className="pickup-step__title">수거 주소를 입력해주세요</h2>
        <p className="pickup-step__subtitle">택배기사가 방문할 주소를 알려주세요.</p>
      </div>

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
                  <span className="pickup-saved-card__label">{addr.label || "주소"}</span>
                  {addr.is_default && <span className="pickup-saved-card__default">기본</span>}
                </div>
                <span className="pickup-saved-card__name">
                  {addr.recipient_name} · {addr.recipient_phone}
                </span>
                <span className="pickup-saved-card__addr">
                  {addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ""}
                </span>
              </div>
            </label>
          ))}
          <label className={`pickup-saved-card ${useNewAddress ? "is-selected" : ""}`}>
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
                className="pickup-input"
                onChange={(e) => setAddress((p) => ({ ...p, recipient_name: e.target.value }))}
                placeholder="홍길동"
                value={address.recipient_name}
              />
            </div>
            <div className="pickup-form-field">
              <label className="pickup-field-label">연락처 *</label>
              <input
                className="pickup-input"
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                  const formatted = digits.length > 7
                    ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
                    : digits.length > 3
                      ? `${digits.slice(0, 3)}-${digits.slice(3)}`
                      : digits;
                  setAddress((p) => ({ ...p, recipient_phone: formatted }));
                }}
                placeholder="010-1234-5678"
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
              {address.address_line1 || (isSearchingAddress ? "불러오는 중..." : "주소 검색")}
            </button>
            {address.postal_code && (
              <span className="pickup-field-hint">우편번호: {address.postal_code}</span>
            )}
          </div>
          <div className="pickup-form-field">
            <label className="pickup-field-label">상세 주소</label>
            <input
              className="pickup-input"
              onChange={(e) => setAddress((p) => ({ ...p, address_line2: e.target.value }))}
              placeholder="동/호수"
              ref={detailRef}
              value={address.address_line2}
            />
          </div>
        </div>
      )}

      {/* 수거 요청사항 */}
      <div className="pickup-form-field">
        <label className="pickup-field-label">수거 요청사항 (선택)</label>
        <input
          className="pickup-input"
          onChange={(e) => setAddress((p) => ({ ...p, memo: e.target.value }))}
          placeholder="예: 경비실에 맡겨주세요"
          value={address.memo}
        />
      </div>

      {/* 포장 안내 */}
      <div className="pickup-info-box">
        <p className="pickup-info-box__title">📦 포장 안내</p>
        <ul className="pickup-info-box__list">
          <li>빈 공간 없이 딱 맞는 박스에 담아주세요</li>
          <li>20권 이하는 한 박스에 모아주세요</li>
          <li>교재가 흔들리지 않도록 포장해주세요</li>
        </ul>
        <p className="pickup-info-box__tip">💡 잘 포장하면 교재 상태가 보존되어 더 좋은 등급을 받을 수 있어요!</p>
      </div>

      <div className="pickup-step-actions">
        <button className="pickup-btn pickup-btn--secondary" onClick={onPrev} type="button">← 이전</button>
        <button
          className="pickup-btn pickup-btn--primary"
          disabled={!isValid}
          onClick={onNext}
          type="button"
        >
          다음 단계 →
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: 정산 정보 ───
function StepSettlement({ account, setAccount, savedAccounts, policyAgreed, setPolicyAgreed, onPrev, onNext }) {
  const [selectedSavedId, setSelectedSavedId] = useState(null);
  const [useNewAccount, setUseNewAccount] = useState(savedAccounts.length === 0);

  useEffect(() => {
    if (savedAccounts.length > 0 && !selectedSavedId && !useNewAccount) {
      const defaultAcc = savedAccounts.find((a) => a.is_default) || savedAccounts[0];
      selectSaved(defaultAcc);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectSaved = (acc) => {
    setSelectedSavedId(acc.id);
    setUseNewAccount(false);
    setAccount({
      account_id: acc.id,
      bank_name: acc.bank_name,
      account_number: acc.account_number_masked || acc.account_number,
      account_number_last4: acc.account_last4 ?? acc.account_number_last4,
      account_holder: acc.account_holder,
    });
  };

  const startNewAccount = () => {
    setSelectedSavedId(null);
    setUseNewAccount(true);
    setAccount({ account_id: null, bank_name: "", account_number: "", account_number_last4: "", account_holder: "" });
  };

  const isValid =
    account.bank_name.trim() &&
    (account.account_id || account.account_number.trim()) &&
    account.account_holder.trim() &&
    policyAgreed;

  return (
    <div className="pickup-step">
      <div className="pickup-step__header">
        <h2 className="pickup-step__title">정산 계좌를 입력해주세요</h2>
        <p className="pickup-step__subtitle">판매 금액이 정산될 계좌를 알려주세요.</p>
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
                  <span className="pickup-saved-card__label">{acc.bank_name}</span>
                  {acc.is_default && <span className="pickup-saved-card__default">기본</span>}
                </div>
                <span className="pickup-saved-card__name">
                  {acc.account_number_masked || acc.account_number} · {acc.account_holder}
                </span>
              </div>
            </label>
          ))}
          <label className={`pickup-saved-card ${useNewAccount ? "is-selected" : ""}`}>
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
              onChange={(e) => setAccount((p) => ({ ...p, account_id: null, bank_name: e.target.value }))}
              value={account.bank_name}
            >
              <option value="">은행 선택</option>
              {BANK_LIST.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="pickup-form-row">
            <div className="pickup-form-field">
              <label className="pickup-field-label">계좌번호 *</label>
              <input
                className="pickup-input"
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^\d-]/g, "");
                  setAccount((p) => ({ ...p, account_id: null, account_number: cleaned, account_number_last4: "" }));
                }}
                placeholder="110-123-456789"
                value={account.account_number}
              />
            </div>
            <div className="pickup-form-field">
              <label className="pickup-field-label">예금주 *</label>
              <input
                className="pickup-input"
                onChange={(e) => setAccount((p) => ({ ...p, account_id: null, account_holder: e.target.value }))}
                placeholder="홍길동"
                value={account.account_holder}
              />
            </div>
          </div>
        </div>
      )}

      {/* 판매 정책 */}
      <div className="pickup-policy-box">
        <p className="pickup-policy-box__title">📋 판매 정책</p>
        <div className="pickup-policy-box__section">
          <p className="pickup-policy-box__heading">수수료 안내</p>
          <ul className="pickup-policy-box__list">
            <li>1만원 초과 교재: 판매가의 40%</li>
            <li>1만원 이하 교재/모의고사: 판매가의 45%</li>
          </ul>
        </div>
        <div className="pickup-policy-box__section">
          <p className="pickup-policy-box__heading">검수 안내</p>
          <ul className="pickup-policy-box__list">
            <li>전문 검수원이 S/A+/A 등급을 판정합니다</li>
            <li>필기 10% 초과, 심한 훼손 교재는 판매불가</li>
            <li>판매불가 교재는 자체 폐기됩니다</li>
          </ul>
        </div>
        <div className="pickup-policy-box__section">
          <p className="pickup-policy-box__heading">정산 안내</p>
          <ul className="pickup-policy-box__list">
            <li>교재 판매 완료 + 구매자 확정 후 3영업일 이내 정산</li>
            <li>유효 판매 수량 10권 미만 시 초기 수거 배송비 3,500원 차감</li>
          </ul>
        </div>
      </div>

      <label className="pickup-checkbox-label">
        <input
          checked={policyAgreed}
          className="pickup-checkbox"
          onChange={(e) => setPolicyAgreed(e.target.checked)}
          type="checkbox"
        />
        <span>위 판매 정책을 확인하였으며 동의합니다 <span className="pickup-required">[필수]</span></span>
      </label>

      <div className="pickup-step-actions">
        <button className="pickup-btn pickup-btn--secondary" onClick={onPrev} type="button">← 이전</button>
        <button
          className="pickup-btn pickup-btn--primary"
          disabled={!isValid}
          onClick={onNext}
          type="button"
        >
          다음 단계 →
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: 확인 및 제출 ───
function StepConfirm({ items, address, account, isSubmitting, onPrev, onSubmit, goToStep }) {
  return (
    <div className="pickup-step">
      <div className="pickup-step__header">
        <h2 className="pickup-step__title">아래 내용을 확인해주세요</h2>
      </div>

      {/* 교재 요약 */}
      <div className="pickup-confirm-section">
        <div className="pickup-confirm-section__header">
          <span className="pickup-confirm-section__icon">📚</span>
          <span className="pickup-confirm-section__title">보내는 교재 ({items.length}권)</span>
          <button className="pickup-link-button" onClick={() => goToStep(0)} type="button">수정 →</button>
        </div>
        <div className="pickup-confirm-items">
          {items.map((item, i) => (
            <div className="pickup-confirm-item" key={item.localId}>
              <span className="pickup-confirm-item__num">{i + 1}.</span>
              <div className="pickup-confirm-item__info">
                <span className="pickup-confirm-item__title">{item.title}</span>
                <span className="pickup-confirm-item__meta">
                  {[item.brand, item.subject, item.published_year ? `${item.published_year}년` : null].filter(Boolean).join(" · ")}
                </span>
                {item.condition_memo && (
                  <span className="pickup-confirm-item__memo">메모: {item.condition_memo}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 수거 주소 요약 */}
      <div className="pickup-confirm-section">
        <div className="pickup-confirm-section__header">
          <span className="pickup-confirm-section__icon">📍</span>
          <span className="pickup-confirm-section__title">수거 주소</span>
          <button className="pickup-link-button" onClick={() => goToStep(1)} type="button">수정 →</button>
        </div>
        <div className="pickup-confirm-detail">
          <p>{address.recipient_name} · {address.recipient_phone}</p>
          <p>{address.address_line1}{address.address_line2 ? `, ${address.address_line2}` : ""}</p>
          {address.memo && <p className="pickup-confirm-detail__memo">요청: {address.memo}</p>}
        </div>
      </div>

      {/* 정산 계좌 요약 */}
      <div className="pickup-confirm-section">
        <div className="pickup-confirm-section__header">
          <span className="pickup-confirm-section__icon">💰</span>
          <span className="pickup-confirm-section__title">정산 계좌</span>
          <button className="pickup-link-button" onClick={() => goToStep(2)} type="button">수정 →</button>
        </div>
        <div className="pickup-confirm-detail">
          <p>{account.bank_name} · {account.account_number} · {account.account_holder}</p>
        </div>
      </div>

      {/* 안내 */}
      <div className="pickup-info-box">
        <p className="pickup-info-box__tip">
          💡 수거 요청 후 박스를 포장하여 문 앞에 놓아주세요. 택배기사가 1~2일 내에 수거합니다.
        </p>
      </div>

      <div className="pickup-step-actions">
        <button className="pickup-btn pickup-btn--secondary" disabled={isSubmitting} onClick={onPrev} type="button">
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
function PickupSuccess({ result, itemCount }) {
  const navigate = useNavigate();

  return (
    <div className="pickup-success">
      <span className="pickup-success__icon">✅</span>
      <h2 className="pickup-success__title">수거 요청이 완료되었어요!</h2>
      <div className="pickup-success__info">
        <p>요청번호: <strong>{result.request_number}</strong></p>
        <p>교재 {itemCount}권</p>
      </div>
      <div className="pickup-success__guide">
        <p>📦 교재를 박스에 포장하여 문 앞에 놓아주세요.</p>
        <p>1~2일 내 택배기사가 수거합니다.</p>
      </div>
      <div className="pickup-success__actions">
        <button className="pickup-btn pickup-btn--primary" onClick={() => navigate("/mypage#sales")} type="button">
          수거 현황 보기
        </button>
        <button className="pickup-btn pickup-btn--ghost" onClick={() => navigate("/")} type="button">
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
      <div className="pickup-modal pickup-modal--sm" onClick={(e) => e.stopPropagation()} role="alertdialog">
        <div className="pickup-modal__body pickup-modal__body--center">
          <p className="pickup-modal__message">작성 중인 내용이 사라집니다.<br />정말 나가시겠습니까?</p>
        </div>
        <div className="pickup-modal__footer">
          <button className="pickup-btn pickup-btn--secondary" onClick={onCancel} type="button">계속 작성</button>
          <button className="pickup-btn pickup-btn--danger" onClick={onConfirm} type="button">나가기</button>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 페이지 ───
function PublicPickupRequestPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, user } = usePublicAuth();

  const [currentStep, setCurrentStep] = useState(0);
  const [items, setItems] = useState([]);
  const [address, setAddress] = useState({
    recipient_name: "", recipient_phone: "", postal_code: "",
    address_line1: "", address_line2: "", memo: "",
  });
  const [account, setAccount] = useState({ account_id: null, bank_name: "", account_number: "", account_number_last4: "", account_holder: "" });
  const [policyAgreed, setPolicyAgreed] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [toast, setToast] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

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
          setAddress((prev) => ({
            ...prev,
            recipient_name: prev.recipient_name || snapshot.profile.name || "",
            recipient_phone: prev.recipient_phone || snapshot.profile.phone || "",
          }));
        }
      } catch {
        // 로딩 실패 시 빈 상태로 진행
      } finally {
        if (!cancelled) setIsLoadingData(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [user]);

  const handleCancel = () => {
    if (items.length > 0 || address.address_line1) {
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
    const { data, error } = await submitPickupRequest({
      pickupAddress: address,
      settlementAccount: account,
      items,
    });

    setIsSubmitting(false);

    if (error) {
      showToast("요청에 실패했습니다. 다시 시도해주세요.", "error");
      return;
    }

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
          from: { pathname: PICKUP_REQUEST_PATH, search: location.search, hash: location.hash },
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
            <PickupSuccess itemCount={items.length} result={submitResult} />
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
          <button className="pickup-back-btn" onClick={handleCancel} type="button">
            ← {currentStep === 0 ? "취소" : "취소"}
          </button>

          {/* 헤더 + 프로그레스 */}
          <div className="pickup-card">
            <div className="pickup-card__top">
              <div className="pickup-card__top-text">
                <span className="pickup-card__eyebrow">
                  Step {currentStep + 1}/{STEPS.length} {STEPS[currentStep]}
                </span>
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
                    <StepBooks
                      items={items}
                      onNext={() => goToStep(1)}
                      setItems={setItems}
                      showToast={showToast}
                    />
                  )}
                  {currentStep === 1 && (
                    <StepAddress
                      address={address}
                      onNext={() => goToStep(2)}
                      onPrev={() => goToStep(0)}
                      savedAddresses={savedAddresses}
                      setAddress={setAddress}
                      showToast={showToast}
                    />
                  )}
                  {currentStep === 2 && (
                    <StepSettlement
                      account={account}
                      onNext={() => goToStep(3)}
                      onPrev={() => goToStep(1)}
                      policyAgreed={policyAgreed}
                      savedAccounts={savedAccounts}
                      setAccount={setAccount}
                      setPolicyAgreed={setPolicyAgreed}
                    />
                  )}
                  {currentStep === 3 && (
                    <StepConfirm
                      account={account}
                      address={address}
                      goToStep={goToStep}
                      isSubmitting={isSubmitting}
                      items={items}
                      onPrev={() => goToStep(2)}
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
