import { useCallback, useEffect, useMemo, useState } from "react";
import AdminDialog from "../components/AdminDialog";
import AdminShell from "../components/AdminShell";
import DestructiveConfirmModal from "../components/DestructiveConfirmModal";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { formatDate } from "@shared-domain/format";

const EMPTY_FORM = {
  id: null,
  title: "",
  body: "",
  is_pinned: false,
  is_published: true,
  published_at: "",
  expires_at: "",
};

function toLocalInput(value) {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function fromLocalInput(value) {
  if (!value) return null;
  try {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

function AdminNoticesPage() {
  const [notices, setNotices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [editor, setEditor] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadNotices = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setErrorMessage("Supabase 환경 변수가 필요합니다.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage("");
    const { data, error } = await supabase
      .from("notices")
      .select("id, title, body, is_pinned, is_published, published_at, expires_at, updated_at")
      .order("is_pinned", { ascending: false })
      .order("published_at", { ascending: false });
    if (error) {
      setErrorMessage(error.message || "공지를 불러오지 못했습니다.");
    } else {
      setNotices(Array.isArray(data) ? data : []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadNotices();
  }, [loadNotices]);

  const openNew = () =>
    setEditor({
      ...EMPTY_FORM,
      published_at: toLocalInput(new Date().toISOString()),
    });

  const openEdit = (row) =>
    setEditor({
      id: row.id,
      title: row.title,
      body: row.body,
      is_pinned: row.is_pinned,
      is_published: row.is_published,
      published_at: toLocalInput(row.published_at),
      expires_at: toLocalInput(row.expires_at),
    });

  const closeEditor = () => setEditor(null);

  const editorDirty = useMemo(() => {
    if (!editor) return false;
    const baseline = editor.id ? notices.find((n) => n.id === editor.id) : null;
    if (baseline) {
      return (
        editor.title !== baseline.title ||
        editor.body !== baseline.body ||
        Boolean(editor.is_pinned) !== Boolean(baseline.is_pinned) ||
        Boolean(editor.is_published) !== Boolean(baseline.is_published) ||
        editor.published_at !== toLocalInput(baseline.published_at) ||
        editor.expires_at !== toLocalInput(baseline.expires_at)
      );
    }
    return Boolean(editor.title?.trim() || editor.body?.trim() || editor.expires_at);
  }, [editor, notices]);

  const handleSave = async () => {
    if (!editor) return;
    setIsSaving(true);
    const { error } = await supabase.rpc("admin_upsert_notice", {
      p_id: editor.id,
      p_title: editor.title,
      p_body: editor.body,
      p_is_pinned: editor.is_pinned,
      p_is_published: editor.is_published,
      p_published_at: fromLocalInput(editor.published_at),
      p_expires_at: fromLocalInput(editor.expires_at),
    });
    setIsSaving(false);
    if (error) {
      setErrorMessage(error.message || "저장에 실패했습니다.");
      return;
    }
    closeEditor();
    await loadNotices();
  };

  const handleDelete = (notice) => {
    setDeleteTarget(notice);
  };

  const performDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const { error } = await supabase.rpc("admin_delete_notice", { p_id: deleteTarget.id });
    setIsDeleting(false);
    if (error) {
      setErrorMessage(error.message || "삭제에 실패했습니다.");
      return;
    }
    setDeleteTarget(null);
    await loadNotices();
  };

  return (
    <AdminShell
      activeModule="notices"
      description="게시한 공지는 고객 사이트 하단 푸터의 '공지사항' 링크(/notices)에 노출 · 핀 공지는 목록 상단 고정"
      title="공지사항 관리"
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          전체 {notices.length}건 · 게시 {notices.filter((n) => n.is_published).length}건 · 핀 {notices.filter((n) => n.is_pinned && n.is_published).length}건
          {/* subook.kr은 아직 구 사이트(식스샵) — 정식 도메인 전환 후 subook.kr/notices로 교체 */}
          <a
            className="ml-3 font-semibold text-blue-600 hover:underline"
            href="https://subook-public-web-temp.vercel.app/notices"
            rel="noreferrer"
            target="_blank"
          >
            사이트에서 보기 ↗
          </a>
        </p>
        <button className="btn-primary !w-auto !px-4 !py-2 text-sm" onClick={openNew} type="button">
          + 공지 추가
        </button>
      </div>

      {errorMessage ? (
        <p className="mb-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700 px-4 py-3">
          {errorMessage}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-slate-400 py-8 text-center">불러오는 중...</p>
      ) : notices.length === 0 ? (
        <p className="text-sm text-slate-400 py-12 text-center">등록된 공지가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {notices.map((row) => {
            const expired = row.expires_at && new Date(row.expires_at) < new Date();
            return (
              <div
                className={`rounded-xl border border-slate-200 bg-white p-4 flex items-start gap-4 ${
                  expired ? "opacity-50" : ""
                }`}
                key={row.id}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {row.is_pinned ? (
                      <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                        📌 핀
                      </span>
                    ) : null}
                    {!row.is_published ? (
                      <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        미게시
                      </span>
                    ) : null}
                    {expired ? (
                      <span className="text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                        만료
                      </span>
                    ) : null}
                    <span className="text-xs text-slate-400">
                      {formatDate(row.published_at)}
                      {row.expires_at ? ` ~ ${formatDate(row.expires_at)}` : ""}
                    </span>
                  </div>
                  <p className="font-bold text-slate-900">{row.title}</p>
                  <p className="mt-1 text-sm text-slate-600 line-clamp-2 whitespace-pre-wrap">{row.body}</p>
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
            );
          })}
        </div>
      )}

      <AdminDialog
        busy={isSaving}
        dirty={editorDirty}
        onClose={closeEditor}
        open={Boolean(editor)}
        title={editor?.id ? "공지 편집" : "공지 추가"}
      >
        {editor ? (
          <div className="space-y-4 p-6">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">제목 *</label>
              <input
                className="input-base"
                onChange={(e) => setEditor((p) => ({ ...p, title: e.target.value }))}
                placeholder="예: 추석 연휴 배송 일정 안내"
                type="text"
                value={editor.title}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">본문 *</label>
              <textarea
                className="input-base !h-48 resize-y"
                onChange={(e) => setEditor((p) => ({ ...p, body: e.target.value }))}
                placeholder="공지 본문 (줄바꿈 가능)"
                value={editor.body}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">게시 시각</label>
                <input
                  className="input-base"
                  onChange={(e) => setEditor((p) => ({ ...p, published_at: e.target.value }))}
                  type="datetime-local"
                  value={editor.published_at}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">만료 시각 (선택)</label>
                <input
                  className="input-base"
                  onChange={(e) => setEditor((p) => ({ ...p, expires_at: e.target.value }))}
                  type="datetime-local"
                  value={editor.expires_at}
                />
              </div>
            </div>

            <div className="flex gap-4 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={editor.is_pinned}
                  onChange={(e) => setEditor((p) => ({ ...p, is_pinned: e.target.checked }))}
                  type="checkbox"
                />
                <span>📌 상단 고정 (핀 공지)</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={editor.is_published}
                  onChange={(e) => setEditor((p) => ({ ...p, is_published: e.target.checked }))}
                  type="checkbox"
                />
                <span>게시</span>
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <button className="btn-ghost flex-1" onClick={closeEditor} type="button">
                취소
              </button>
              <button
                className="btn-primary flex-1"
                disabled={isSaving || !editor.title?.trim() || !editor.body?.trim()}
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
        confirmLabel="공지 삭제"
        confirmPhrase="삭제"
        description={
          deleteTarget
            ? `${deleteTarget.title}\n\n· 공개된 공지가 즉시 사라집니다.\n· 이 작업은 되돌릴 수 없습니다.\n· 정말 삭제하려면 아래 문구를 입력하세요.`
            : ""
        }
        onCancel={() => (isDeleting ? null : setDeleteTarget(null))}
        onConfirm={performDelete}
        open={Boolean(deleteTarget)}
        title="공지 삭제"
      />
    </AdminShell>
  );
}

export default AdminNoticesPage;
