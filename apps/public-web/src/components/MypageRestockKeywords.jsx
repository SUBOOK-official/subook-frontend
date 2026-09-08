import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "./PublicMypageUi";
import { restockKeywordService } from "../lib/publicRestock";
import { MAX_RESTOCK_KEYWORDS, validateRestockKeyword } from "../lib/restockKeywordService";
import "./MypageRestockKeywords.css";

const demoKeywords = [{ id: "demo-1", keyword: "브릿지 생활과윤리" }, { id: "demo-2", keyword: "강민철" }];

export default function MypageRestockKeywords({ isDemoPreview = false }) {
  const [keywords, setKeywords] = useState(isDemoPreview ? demoKeywords : []);
  const [phase, setPhase] = useState(isDemoPreview ? "ready" : "loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [removeError, setRemoveError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isDemoPreview) return undefined;
    let cancelled = false;
    setPhase("loading");
    restockKeywordService.list().then((result) => {
      if (cancelled) return;
      if (result.error) { setPhase("error"); return; }
      setKeywords(result.keywords);
      setPhase("ready");
    });
    return () => { cancelled = true; };
  }, [isDemoPreview, reloadKey]);

  const addKeyword = async (event) => {
    event.preventDefault();
    if (busyRef.current || phase !== "ready") return;
    setMessage("");
    const validationError = validateRestockKeyword(input, keywords);
    setError(validationError);
    if (validationError) { inputRef.current?.focus(); return; }
    busyRef.current = true;
    setBusy(true);
    try {
      const result = isDemoPreview
        ? { success: true, id: `demo-${Date.now()}`, keyword: input.trim() }
        : await restockKeywordService.subscribe(input);
      if (!result.success) { setError(result.error); return; }
      setKeywords((rows) => [{ id: result.id, keyword: result.keyword }, ...rows.filter((row) => String(row.id) !== String(result.id))]);
      setInput("");
      setMessage("입고 알림을 신청했어요. 관련 교재가 입고되면 수북 알림함에서 알려드려요.");
      inputRef.current?.focus();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const removeKeyword = async () => {
    if (busyRef.current || !pendingRemoval) return;
    busyRef.current = true;
    setBusy(true);
    setRemoveError("");
    try {
      const result = isDemoPreview ? { success: true } : await restockKeywordService.unsubscribe(pendingRemoval.id);
      if (!result.success) { setRemoveError(result.error); return; }
      setKeywords((rows) => rows.filter((row) => row.id !== pendingRemoval.id));
      setPendingRemoval(null);
      setError("");
      setMessage("키워드 입고 알림을 해지했어요.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="public-mypage-section restock-keywords" aria-labelledby="restock-keywords-title">
      <h2 id="restock-keywords-title">키워드 입고 알림</h2>
      <p>기다리는 교재명이나 강사명을 등록해 주세요. 관련 교재가 입고되면 <Link to="/notifications">수북 알림함</Link>으로 알려드려요.</p>
      <p className="restock-keywords__hint">상품별 재입고 알림은 <Link to={isDemoPreview ? "/mypage?demo=1#wishlist" : "/mypage#wishlist"}>찜한 교재</Link>의 품절 상품에서 관리할 수 있어요. 키워드 변경은 기존 알림을 해지한 뒤 새로 등록해 주세요.</p>
      {isDemoPreview && <p className="restock-keywords__hint">데모에서 추가·해지한 내용은 실제로 저장되지 않아요.</p>}
      <form onSubmit={addKeyword}>
        <label htmlFor="restock-keyword-input">새 키워드 <span className="restock-keywords__hint">2~40자 · 최대 {MAX_RESTOCK_KEYWORDS}개</span></label>
        <div className="restock-keywords__form-row">
          <input id="restock-keyword-input" ref={inputRef} value={input} disabled={busy || phase !== "ready"}
            placeholder="예: 브릿지 생활과윤리" aria-invalid={Boolean(error)} aria-describedby={error ? "restock-keyword-error" : undefined}
            onChange={(event) => { setInput(event.target.value); setError(""); setMessage(""); }} />
          <button type="submit" className="public-auth-button public-auth-button--primary" disabled={busy || phase !== "ready"}>{busy && !pendingRemoval ? "신청 중…" : "알림 신청"}</button>
        </div>
        {error && <p id="restock-keyword-error" className="restock-keywords__error" role="alert">{error}</p>}
      </form>
      <p role="status" className="restock-keywords__status">{message}</p>
      <div className="restock-keywords__list-heading">
        <h3>기다리는 키워드{phase === "ready" ? ` (${keywords.length}/${MAX_RESTOCK_KEYWORDS})` : ""}</h3>
        {!isDemoPreview && <button type="button" disabled={busy || phase === "loading"} onClick={() => { setError(""); setMessage(""); setReloadKey((key) => key + 1); }}>새로고침</button>}
      </div>
      {phase === "loading" ? <p role="status">입고 알림을 불러오는 중이에요…</p> : phase === "error" ? (
        <p className="restock-keywords__error" role="alert">입고 알림 목록을 불러오지 못했어요. 새로고침으로 다시 시도해 주세요.</p>
      ) : keywords.length === 0 ? <p className="restock-keywords__empty">아직 기다리는 키워드가 없어요. 위에서 첫 입고 알림을 신청해 보세요.</p> : (
        <ul className="restock-keywords__list">
          {keywords.map((row) => <li key={row.id}>
            <span>{row.keyword}</span>
            <button type="button" disabled={busy} aria-label={`${row.keyword} 알림 해지`} onClick={() => { setRemoveError(""); setPendingRemoval(row); }}>해지</button>
          </li>)}
        </ul>
      )}
      <ConfirmDialog open={Boolean(pendingRemoval)} title="키워드 알림을 해지할까요?" confirmLabel="알림 해지" busy={busy}
        body={<><span>‘{pendingRemoval?.keyword}’ 키워드의 입고 알림을 더 이상 받지 않아요.</span>{removeError && <span className="restock-keywords__error" role="alert"> {removeError}</span>}</>}
        onClose={() => { if (!busyRef.current) setPendingRemoval(null); }} onConfirm={removeKeyword} />
    </section>
  );
}
