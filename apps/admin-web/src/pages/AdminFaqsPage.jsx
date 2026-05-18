import { useCallback, useEffect, useMemo, useState } from "react";
import AdminDialog from "../components/AdminDialog";
import AdminShell from "../components/AdminShell";
import DestructiveConfirmModal from "../components/DestructiveConfirmModal";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";

const EMPTY_FORM = {
  id: null,
  category: "",
  question: "",
  answer: "",
  display_order: 0,
  is_published: true,
};

function AdminFaqsPage() {
  const [faqs, setFaqs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [editor, setEditor] = useState(null); // EMPTY_FORM | row
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
  const openEdit = (row) => setEditor({ ...row });
  const closeEditor = () => setEditor(null);

  const editorDirty = useMemo(() => {
    if (!editor) return false;
    const baseline = editor.id ? faqs.find((f) => f.id === editor.id) : null;
    if (baseline) {
      return (
        (editor.category || "") !== (baseline.category || "") ||
        editor.question !== baseline.question ||
        editor.answer !== baseline.answer ||
        Number(editor.display_order) !== Number(baseline.display_order) ||
        Boolean(editor.is_published) !== Boolean(baseline.is_published)
      );
    }
    // 새 FAQ — 어느 한 필드라도 입력되어 있으면 dirty 취급.
    return Boolean(
      editor.category?.trim() || editor.question?.trim() || editor.answer?.trim(),
    );
  }, [editor, faqs]);

  const handleSave = async () => {
    if (!editor) return;
    setIsSaving(true);
    const { error } = await supabase.rpc("admin_upsert_faq", {
      p_id: editor.id,
      p_category: editor.category || null,
      p_question: editor.question,
      p_answer: editor.answer,
      p_display_order: Number(editor.display_order) || 0,
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

  return (
    <AdminShell activeModule="faqs" description="자주 묻는 질문 — 사이트의 /faq에 즉시 반영됩니다" title="FAQ 관리">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          전체 {faqs.length}건 · 게시 {faqs.filter((f) => f.is_published).length}건
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
        <p className="text-sm text-slate-400 py-8 text-center">불러오는 중...</p>
      ) : faqs.length === 0 ? (
        <p className="text-sm text-slate-400 py-12 text-center">등록된 FAQ가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {faqs.map((row) => (
            <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-start gap-4" key={row.id}>
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
                  <span className="text-xs text-slate-400">순서 {row.display_order}</span>
                </div>
                <p className="font-bold text-slate-900">{row.question}</p>
                <p className="mt-1 text-sm text-slate-600 line-clamp-3 whitespace-pre-wrap">{row.answer}</p>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">카테고리 (선택)</label>
                <input
                  className="input-base"
                  onChange={(e) => setEditor((p) => ({ ...p, category: e.target.value }))}
                  placeholder="예: 수거 / 검수 / 정산"
                  type="text"
                  value={editor.category || ""}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">표시 순서</label>
                <input
                  className="input-base"
                  inputMode="numeric"
                  onChange={(e) => setEditor((p) => ({ ...p, display_order: e.target.value }))}
                  type="number"
                  value={editor.display_order}
                />
              </div>
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
              <textarea
                className="input-base !h-40 resize-y"
                onChange={(e) => setEditor((p) => ({ ...p, answer: e.target.value }))}
                placeholder="답변 본문 (줄바꿈 가능)"
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
                disabled={isSaving || !editor.question?.trim() || !editor.answer?.trim()}
                onClick={handleSave}
                type="button"
              >
                {isSaving ? "저장 중..." : "저장"}
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
