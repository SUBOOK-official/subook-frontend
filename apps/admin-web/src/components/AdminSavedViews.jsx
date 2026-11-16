import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@shared-supabase/adminSupabaseClient";
import AdminDialog from "./AdminDialog";

const stripQuestion = (search) => search.replace(/^\?/, "");

/**
 * 저장한 보기 — 현재 주소의 조회 조건(검색·필터)을 이름 붙여 이 브라우저에 저장한다.
 *
 * - 기본: "전체" + presets + 개인 저장 보기를 칩으로 나열 (수거·상품 화면).
 * - customOnly: 화면이 자체 업무 탭(AdminViewTabs)을 가진 경우. 개인 저장 보기만 보여주고,
 *   canSave(저장할 조건이 있음)일 때만 저장 버튼을 낸다. 보여줄 것이 없으면 아무것도 그리지 않는다.
 */
export default function AdminSavedViews({ presets = [], customOnly = false, canSave = true }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [userId, setUserId] = useState(null);
  const [views, setViews] = useState([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const storageKey = userId ? `subook.admin.views.${userId}.${location.pathname}` : null;

  useEffect(() => {
    let active = true;
    supabase?.auth.getSession().then(({ data }) => { if (active) setUserId(data.session?.user.id ?? null); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      setViews(Array.isArray(saved) ? saved.filter((v) => typeof v.name === "string" && typeof v.search === "string").slice(0, 20) : []);
    } catch { setViews([]); }
  }, [storageKey]);

  function persist(next) {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setViews(next); setError(""); return true; }
    catch { setError("브라우저 저장 공간을 사용할 수 없습니다."); return false; }
  }

  const fixed = customOnly ? [] : [{ name: "전체", search: "" }, ...presets];
  const chips = [
    ...fixed.map((view) => ({ ...view, custom: false })),
    ...views.map((view, index) => ({ ...view, custom: true, index })),
  ];
  const showSave = customOnly ? canSave : true;

  if (customOnly && !chips.length && !showSave && !open) return null;

  const current = stripQuestion(location.search);

  return (
    <div aria-label="저장한 보기" className="flex flex-wrap items-center gap-2">
      {customOnly && chips.length ? <span className="text-xs font-semibold text-slate-400">저장한 보기</span> : null}
      {chips.map((view) => {
        const selected = current === stripQuestion(view.search);
        return (
          <div
            className={`inline-flex items-center rounded-full border ${selected ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}
            key={`${view.custom ? "custom" : "fixed"}-${view.name}`}
          >
            <button
              className={`rounded-full px-3.5 py-2 text-[13px] font-semibold ${selected ? "text-blue-600" : "text-slate-600 hover:text-slate-900"}`}
              onClick={() => navigate({ pathname: location.pathname, search: view.search })}
              type="button"
            >
              {view.name}
            </button>
            {view.custom ? (
              <button
                aria-label={`${view.name} 저장한 보기 삭제`}
                className="pr-3 text-slate-400 hover:text-slate-700"
                onClick={() => persist(views.filter((_, index) => index !== view.index))}
                type="button"
              >
                ×
              </button>
            ) : null}
          </div>
        );
      })}
      {showSave ? (
        <button
          className="px-2 py-2 text-[13px] font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-40"
          disabled={!storageKey || views.length >= 20}
          onClick={() => { setName(""); setOpen(true); }}
          type="button"
        >
          + 현재 조건 저장
        </button>
      ) : null}
      {error ? <p className="text-xs text-rose-600" role="alert">{error}</p> : null}
      <AdminDialog onClose={() => setOpen(false)} open={open} size="sm" title="보기 저장">
        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            const params = new URLSearchParams(location.search);
            ["page", "ipage", "detail", "product", "member"].forEach((key) => params.delete(key));
            if (persist([...views.filter((v) => v.name !== name.trim()), { name: name.trim(), search: params.toString() }])) setOpen(false);
          }}
        >
          <label className="block text-sm font-semibold">
            이름
            <input autoFocus className="input-base" maxLength={40} onChange={(e) => setName(e.target.value)} required value={name} />
          </label>
          <p className="text-xs text-slate-500">이 계정의 현재 브라우저에 저장됩니다.</p>
          <button className="btn-primary" disabled={!name.trim()} type="submit">저장</button>
        </form>
      </AdminDialog>
    </div>
  );
}
