import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@shared-supabase/adminSupabaseClient";
import AdminDialog from "./AdminDialog";

export default function AdminSavedViews({ presets = [] }) {
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
  return <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3" aria-label="작업 보기">
    {[{ name: "전체", search: "" }, ...presets, ...views].map((view, i) => <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white" key={`${view.name}-${i}`}>
      <button type="button" className={`px-3 py-2 text-xs font-semibold ${location.search.replace(/^\?/, "") === view.search.replace(/^\?/, "") ? "text-brand bg-brand/5" : "text-slate-600"}`} onClick={() => navigate({ pathname: location.pathname, search: view.search })}>{view.name}</button>
      {i > presets.length ? <button type="button" className="px-2 text-slate-400" aria-label={`${view.name} 저장한 보기 삭제`} onClick={() => persist(views.filter((_, index) => index !== i - presets.length - 1))}>×</button> : null}
    </div>)}
    <button type="button" disabled={!storageKey || views.length >= 20} className="px-2 py-2 text-xs font-semibold text-slate-500 disabled:opacity-40" onClick={() => { setName(""); setOpen(true); }}>+ 현재 조건 저장</button>
    {error ? <p role="alert" className="text-xs text-rose-600">{error}</p> : null}
    <AdminDialog open={open} onClose={() => setOpen(false)} title="작업 보기 저장" size="sm">
      <form className="space-y-4 p-5" onSubmit={(event) => {
        event.preventDefault();
        const params = new URLSearchParams(location.search);
        ["page", "ipage", "detail", "product", "member"].forEach((key) => params.delete(key));
        if (persist([...views.filter((v) => v.name !== name.trim()), { name: name.trim(), search: params.toString() }])) setOpen(false);
      }}>
        <label className="block text-sm font-semibold">이름<input autoFocus required maxLength={40} className="input-base" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <p className="text-xs text-slate-500">이 계정의 현재 브라우저에 저장됩니다.</p>
        <button disabled={!name.trim()} className="btn-primary" type="submit">저장</button>
      </form>
    </AdminDialog>
  </div>;
}
