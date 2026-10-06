import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminNavigationGroups } from "./adminNavigation";

function readPreference(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value.filter((item) => typeof item === "string") : fallback; } catch { return fallback; }
}

export default function AdminNavigationPanel({ active, counts, onNavigate }) {
  const [closed, setClosed] = useState(() => readPreference("subook.admin.nav.closed", []));
  const [favorites, setFavorites] = useState(() => readPreference("subook.admin.nav.favorites", []));
  const [search, setSearch] = useState("");
  useEffect(() => { const group = adminNavigationGroups.find((g) => g.items.some((i) => i.key === active)); if (group) setClosed((current) => current.filter((key) => key !== group.key)); }, [active]);
  function save(key, value, setter) {
    setter(value);
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 이 세션에서는 동작 */ }
  }
  function itemLink(item, starred = false) {
    const Icon = item.icon;
    const count = counts[item.key];
    return <div key={`${starred ? "star-" : ""}${item.key}`} className={`group flex items-center rounded-lg ${active === item.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
      <Link aria-current={active === item.key ? "page" : undefined} to={item.to} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-[13px] font-semibold">
        <Icon size={16} /><span className="flex-1 truncate">{item.label}</span>
        {Number.isFinite(count) && count > 0 ? <span className="rounded-md bg-rose-500 px-1.5 text-[10px] leading-5 text-white" aria-label={`${item.key === "settlements" ? "미지급 원장" : "대기"} ${count}건`}>{count > 99 ? "99+" : count}</span> : null}
      </Link>
      <button type="button" className={`mr-1 p-1 text-xs ${favorites.includes(item.key) ? "text-amber-500" : "text-slate-400 lg:opacity-0 group-hover:opacity-100 focus:opacity-100"}`} aria-label={`${item.label} 즐겨찾기 ${favorites.includes(item.key) ? "해제" : "추가"}`} onClick={() => save("subook.admin.nav.favorites", favorites.includes(item.key) ? favorites.filter((key) => key !== item.key) : [...favorites, item.key], setFavorites)}>★</button>
    </div>;
  }
  return <nav aria-label="관리자 메뉴" className="space-y-4">
    <input aria-label="메뉴 찾기" placeholder="메뉴 찾기" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-brand" />
    {!search && favorites.length ? <div className="space-y-1"><p className="px-3 text-[10px] font-bold text-slate-400">즐겨찾기</p>{adminNavigationGroups.flatMap((g) => g.items).filter((i) => favorites.includes(i.key)).map((i) => itemLink(i, true))}</div> : null}
    {adminNavigationGroups.map((group) => {
      const items = group.items.filter((item) => !search || `${group.label || ""} ${item.label}`.includes(search));
      if (!items.length) return null;
      const expanded = search || !closed.includes(group.key);
      return <div key={group.key} className="space-y-1">
        {group.label ? <button type="button" aria-expanded={Boolean(expanded)} className="flex w-full items-center justify-between px-3 text-[11px] font-bold text-slate-400" onClick={() => save("subook.admin.nav.closed", closed.includes(group.key) ? closed.filter((key) => key !== group.key) : [...closed, group.key], setClosed)}>{group.label}<span aria-hidden="true">{expanded ? "−" : "+"}</span></button> : null}
        {expanded ? items.map((item) => itemLink(item)) : null}
      </div>;
    })}
  </nav>;
}
