import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminDialog from "../components/AdminDialog";
import AdminShell from "../components/AdminShell";
import DestructiveConfirmModal from "../components/DestructiveConfirmModal";
import RichTextEditor from "../components/RichTextEditor";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { looksLikeRichHtml, plainTextToHtml, richTextToPlain } from "@shared-domain/richText";
import { computeCardOffset, computeReorderTarget, reorderArray } from "../lib/pointerReorder";
import { BusyText, InlineLoading } from "../components/Loading";

// FAQ 고정 카테고리 (2026-07-14 확정 6종) — 자유 입력 폐지.
// 기존 데이터는 마이그레이션 20260714072449에서 이 목록으로 재분류됨.
const FAQ_CATEGORIES = ["판매·수거", "검수·등급", "정산", "구매·배송", "반품·환불", "서비스 안내"];

const EMPTY_FORM = {
  id: null,
  category: "",
  question: "",
  answer: "",
  display_order: 1,
  is_published: true,
};

// 레거시 plain text 답변은 에디터용 HTML로 변환해서 연다
function toEditorHtml(answer) {
  const value = answer || "";
  return looksLikeRichHtml(value) ? value : plainTextToHtml(value);
}

// 목록 미리보기용 — 리치텍스트는 태그를 벗겨 순수 텍스트로
function toPreviewText(answer) {
  const value = answer || "";
  return looksLikeRichHtml(value) ? richTextToPlain(value) : value;
}

function GripIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <path
        d="M3 5h10M3 8h10M3 11h10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function AdminFaqsPage() {
  const [faqs, setFaqs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [editor, setEditor] = useState(null); // EMPTY_FORM | row(+answer=HTML)
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReorderSaving, setIsReorderSaving] = useState(false);
  // 드래그 상태 — HTML5 DnD 대신 포인터 이벤트 기반 커스텀 구현.
  // (HTML5 DnD는 드래그 중 React가 목록을 재정렬해 소스 노드가 DOM에서 이동하면
  //  브라우저가 드래그를 취소해버려 순서 변경이 동작하지 않았음)
  // { id, sourceIndex, targetIndex, startPageY, delta, slotSize, mids: number[] }
  const [dragState, setDragState] = useState(null);
  // 핸들러 클로저 지연 회피용 최신값 미러
  const faqsRef = useRef(faqs);
  faqsRef.current = faqs;
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;
  const cardRefs = useRef(new Map());

  const loadFaqs = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setErrorMessage("Supabase 환경 변수가 필요합니다.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage("");
    const { data, error } = await supabase
      .from("faqs")
      .select("id, category, question, answer, display_order, is_published, updated_at")
      .order("display_order", { ascending: true })
      .order("id", { ascending: true });
    if (error) {
      setErrorMessage(error.message || "FAQ를 불러오지 못했습니다.");
    } else {
      setFaqs(Array.isArray(data) ? data : []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadFaqs();
  }, [loadFaqs]);

  const openNew = () => setEditor({ ...EMPTY_FORM });
  const openEdit = (row) => setEditor({ ...row, answer: toEditorHtml(row.answer) });
  const closeEditor = () => setEditor(null);

  const editorDirty = useMemo(() => {
    if (!editor) return false;
    const baseline = editor.id ? faqs.find((f) => f.id === editor.id) : null;
    if (baseline) {
      return (
        (editor.category || "") !== (baseline.category || "") ||
        editor.question !== baseline.question ||
        editor.answer !== toEditorHtml(baseline.answer) ||
        Boolean(editor.is_published) !== Boolean(baseline.is_published)
      );
    }
    // 새 FAQ — 어느 한 필드라도 입력되어 있으면 dirty 취급.
    return Boolean(
      editor.category?.trim() || editor.question?.trim() || richTextToPlain(editor.answer),
    );
  }, [editor, faqs]);

  const handleSave = async () => {
    if (!editor) return;
    // 새 FAQ는 맨 뒤에 추가 — 순서는 목록 드래그로 조정.
    const orderNum = editor.id
      ? Number(editor.display_order) || 1
      : Math.max(0, ...faqs.map((f) => Number(f.display_order) || 0)) + 1;
    setIsSaving(true);
    const { error } = await supabase.rpc("admin_upsert_faq", {
      p_id: editor.id,
      p_category: editor.category || null,
      p_question: editor.question,
      p_answer: editor.answer,
      p_display_order: Math.max(1, Math.trunc(orderNum)),
      p_is_published: editor.is_published,
    });
    setIsSaving(false);
    if (error) {
      setErrorMessage(error.message || "저장에 실패했습니다.");
      return;
    }
    closeEditor();
    await loadFaqs();
  };

  const handleDelete = (faq) => {
    setDeleteTarget(faq);
  };

  const performDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const { error } = await supabase.rpc("admin_delete_faq", { p_id: deleteTarget.id });
    setIsDeleting(false);
    if (error) {
      setErrorMessage(error.message || "삭제에 실패했습니다.");
      return;
    }
    setDeleteTarget(null);
    await loadFaqs();
  };

  // ── 드래그 정렬 (포인터 이벤트 기반) ─────────────────────────
  // 드래그 중에는 DOM 순서를 건드리지 않고 transform으로만 움직인다:
  //   · 잡은 카드 = 커서를 따라 translateY (transition 없음)
  //   · 나머지 카드 = 자리 비켜주기 translateY(±슬롯 높이) + transition → 슬라이드 애니메이션
  // 놓는 순간(pointerup)에만 배열을 재정렬하고 서버에 저장한다.
  const CARD_GAP = 8; // space-y-2

  const persistOrder = async (ordered) => {
    setIsReorderSaving(true);
    const { error } = await supabase.rpc("admin_reorder_faqs", {
      p_ids: ordered.map((row) => row.id),
    });
    setIsReorderSaving(false);
    if (error) {
      setErrorMessage(error.message || "순서 저장에 실패했습니다.");
      await loadFaqs(); // 서버 기준으로 원복
      return;
    }
    setFaqs(ordered.map((row, index) => ({ ...row, display_order: index + 1 })));
  };

  const handleGripPointerDown = (event, index) => {
    if (event.button !== 0 || isReorderSaving || dragStateRef.current) return;
    event.preventDefault();
    // 시작 시점의 각 카드 세로 중심(페이지 좌표) — 스크롤돼도 유효하도록 pageY 기준
    const mids = faqsRef.current.map((row) => {
      const el = cardRefs.current.get(row.id);
      const rect = el?.getBoundingClientRect();
      return rect ? rect.top + window.scrollY + rect.height / 2 : 0;
    });
    const sourceRect = cardRefs.current.get(faqsRef.current[index].id)?.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      id: faqsRef.current[index].id,
      sourceIndex: index,
      targetIndex: index,
      startPageY: event.pageY,
      delta: 0,
      slotSize: (sourceRect?.height ?? 0) + CARD_GAP,
      mids,
    });
  };

  const handleGripPointerMove = (event) => {
    if (!dragStateRef.current) return;
    // 뷰포트 가장자리에서 자동 스크롤 (긴 목록 대비)
    if (event.clientY < 90) window.scrollBy(0, -14);
    else if (event.clientY > window.innerHeight - 90) window.scrollBy(0, 14);
    const pageY = event.pageY;
    setDragState((s) => {
      if (!s) return s;
      const delta = pageY - s.startPageY;
      return { ...s, delta, targetIndex: computeReorderTarget(s.mids, s.sourceIndex, delta) };
    });
  };

  const handleGripPointerUp = () => {
    const s = dragStateRef.current;
    setDragState(null);
    if (!s || s.targetIndex === s.sourceIndex) return;
    const next = reorderArray(faqsRef.current, s.sourceIndex, s.targetIndex);
    setFaqs(next);
    void persistOrder(next);
  };

  const handleGripPointerCancel = () => setDragState(null);

  // Esc로 드래그 취소 (카드들이 제자리로 슬라이드 복귀)
  useEffect(() => {
    if (!dragState) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setDragState(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dragState]);

  // 드래그 중 각 카드의 시각적 위치 (transform)
  const getCardStyle = (index) => {
    const s = dragState;
    if (!s) return undefined;
    if (index === s.sourceIndex) {
      return {
        transform: `translateY(${s.delta}px) scale(1.01)`,
        transition: "none",
        zIndex: 20,
        position: "relative",
      };
    }
    const offset = computeCardOffset(index, s.sourceIndex, s.targetIndex, s.slotSize);
    return {
      transform: `translateY(${offset}px)`,
      transition: "transform 200ms cubic-bezier(0.2, 0, 0, 1)",
    };
  };

  return (
    <AdminShell activeModule="faqs" description="자주 묻는 질문 — 사이트의 /faq에 즉시 반영됩니다" title="FAQ 관리">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          전체 {faqs.length}건 · 게시 {faqs.filter((f) => f.is_published).length}건
          <span className="ml-2 text-slate-400">
            {isReorderSaving ? <BusyText>순서 저장 중...</BusyText> : "카드를 드래그해서 노출 순서를 바꿀 수 있어요"}
          </span>
        </p>
        <button className="btn-primary !w-auto !px-4 !py-2 text-sm" onClick={openNew} type="button">
          + FAQ 추가
        </button>
      </div>

      {errorMessage ? (
        <p className="mb-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700 px-4 py-3">
          {errorMessage}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-slate-400 py-8 text-center"><InlineLoading /></p>
      ) : faqs.length === 0 ? (
        <p className="text-sm text-slate-400 py-12 text-center">등록된 FAQ가 없습니다.</p>
      ) : (
        <div className={`space-y-2 ${dragState ? "select-none cursor-grabbing" : ""}`}>
          {faqs.map((row, index) => (
            <div
              className={`rounded-xl border bg-white p-4 flex items-start gap-3 ${
                dragState?.id === row.id
                  ? "border-blue-400 shadow-lg"
                  : "border-slate-200"
              }`}
              key={row.id}
              ref={(el) => {
                if (el) cardRefs.current.set(row.id, el);
                else cardRefs.current.delete(row.id);
              }}
              style={getCardStyle(index)}
            >
              <div
                className="shrink-0 -m-1 mt-0 p-1 flex flex-col items-center gap-1 text-slate-300 cursor-grab active:cursor-grabbing"
                onPointerCancel={handleGripPointerCancel}
                onPointerDown={(event) => handleGripPointerDown(event, index)}
                onPointerMove={handleGripPointerMove}
                onPointerUp={handleGripPointerUp}
                style={{ touchAction: "none" }}
                title="드래그해서 순서 변경"
              >
                <GripIcon />
                <span className="text-[10px] font-bold text-slate-400">{index + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {row.category ? (
                    <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                      {row.category}
                    </span>
                  ) : null}
                  {!row.is_published ? (
                    <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      미게시
                    </span>
                  ) : null}
                </div>
                <p className="font-bold text-slate-900">{row.question}</p>
                <p className="mt-1 text-sm text-slate-600 line-clamp-3 whitespace-pre-wrap">
                  {toPreviewText(row.answer)}
                </p>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button
                  className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 hover:bg-slate-50"
                  onClick={() => openEdit(row)}
                  type="button"
                >
                  편집
                </button>
                <button
                  className="px-3 py-1.5 rounded-lg text-sm text-rose-600 border border-rose-200 hover:bg-rose-50"
                  onClick={() => handleDelete(row)}
                  type="button"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AdminDialog
        busy={isSaving}
        dirty={editorDirty}
        onClose={closeEditor}
        open={Boolean(editor)}
        title={editor?.id ? "FAQ 편집" : "FAQ 추가"}
      >
        {editor ? (
          <div className="space-y-4 p-6">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">카테고리</label>
              <select
                className="input-base"
                onChange={(e) => setEditor((p) => ({ ...p, category: e.target.value }))}
                value={editor.category || ""}
              >
                <option value="">카테고리 선택</option>
                {/* 고정 목록 외 레거시 값이면 보존을 위해 함께 노출 */}
                {editor.category && !FAQ_CATEGORIES.includes(editor.category) ? (
                  <option value={editor.category}>{editor.category} (이전 분류)</option>
                ) : null}
                {FAQ_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">질문 *</label>
              <input
                className="input-base"
                onChange={(e) => setEditor((p) => ({ ...p, question: e.target.value }))}
                placeholder="예: 수거 신청 후 며칠 안에 픽업되나요?"
                type="text"
                value={editor.question}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">답변 *</label>
              <RichTextEditor
                onChange={(html) => setEditor((p) => ({ ...p, answer: html }))}
                placeholder="답변 본문 — 굵게·밑줄·목록·링크를 쓸 수 있어요"
                value={editor.answer}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                checked={editor.is_published}
                onChange={(e) => setEditor((p) => ({ ...p, is_published: e.target.checked }))}
                type="checkbox"
              />
              <span>게시 (체크 해제 시 사이트에 노출되지 않음)</span>
            </label>

            <div className="flex gap-2 pt-2">
              <button className="btn-ghost flex-1" onClick={closeEditor} type="button">
                취소
              </button>
              <button
                className="btn-primary flex-1"
                disabled={isSaving || !editor.question?.trim() || !richTextToPlain(editor.answer)}
                onClick={handleSave}
                type="button"
              >
                {isSaving ? <BusyText>저장 중...</BusyText> : "저장"}
              </button>
            </div>
          </div>
        ) : null}
      </AdminDialog>

      <DestructiveConfirmModal
        busy={isDeleting}
        cancelLabel="취소"
        confirmLabel="FAQ 삭제"
        confirmPhrase="삭제"
        description={
          deleteTarget
            ? `[${deleteTarget.category || "분류 없음"}] ${deleteTarget.question}\n\n· 이 작업은 되돌릴 수 없습니다.\n· 정말 삭제하려면 아래 문구를 입력하세요.`
            : ""
        }
        onCancel={() => (isDeleting ? null : setDeleteTarget(null))}
        onConfirm={performDelete}
        open={Boolean(deleteTarget)}
        title="FAQ 삭제"
      />
    </AdminShell>
  );
}

export default AdminFaqsPage;
