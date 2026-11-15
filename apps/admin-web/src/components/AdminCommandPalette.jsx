import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useBodyScrollLock } from "@shared-domain/useBodyScrollLock";
import { useFocusTrap } from "@shared-domain/useFocusTrap";
import { buildAdminCommands, buildEntitySearches, searchAdminCommands } from "../lib/adminMenu";
import { readRecentAdminPages } from "../lib/adminRecentPages";
import { adminMenuIcons } from "./adminNavigation";
import { EnterIcon, SearchIcon } from "./icons";

const COMMANDS = buildAdminCommands();
const COMMAND_BY_TO = new Map(COMMANDS.filter((command) => command.kind !== "shortcut").map((command) => [command.to, command]));
const MAX_COMMAND_RESULTS = 8;

// 아무것도 입력하지 않았을 때 보여줄 기본 목록: 최근 방문 → 자주 찾는 업무
const DEFAULT_SHORTCUTS = ["/admin/orders?view=fulfillment", "/admin/orders?view=refunds", "/admin/pickups?tab=inspection", "/admin/register", "/admin/settlements"];

function buildSections(query) {
  const text = query.trim();
  if (!text) {
    const recent = readRecentAdminPages().map((to) => COMMAND_BY_TO.get(to)).filter(Boolean);
    const frequent = DEFAULT_SHORTCUTS.map((to) => COMMANDS.find((command) => command.to === to)).filter(Boolean);
    return [
      { title: "최근 방문", items: recent },
      { title: "자주 찾는 업무", items: frequent.filter((command) => !recent.includes(command)) },
    ].filter((section) => section.items.length);
  }
  return [
    { title: "메뉴·기능", items: searchAdminCommands(text, COMMANDS).slice(0, MAX_COMMAND_RESULTS) },
    { title: "데이터 찾기", items: buildEntitySearches(text) },
  ].filter((section) => section.items.length);
}

/**
 * 통합 검색 (Ctrl+K).
 * - 메뉴·탭·화면 안 기능을 이름·찾기 낱말·초성으로 찾아 바로 이동한다.
 * - 주문번호·이름·연락처 등을 입력하면 각 목록 화면의 검색 결과로 바로 이동한다.
 *
 * 열릴 때마다 안쪽 대화상자를 새로 마운트한다 — 이전 검색어가 남아 새 입력 앞에 붙는 일을 막는다.
 */
export default function AdminCommandPalette({ open, onClose }) {
  if (!open || typeof document === "undefined") return null;
  return <CommandPaletteDialog onClose={onClose} />;
}

function CommandPaletteDialog({ onClose }) {
  const navigate = useNavigate();
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  useBodyScrollLock(true);
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    // 포털은 같은 커밋에서 그려지므로 바로 포커스한다.
    // (requestAnimationFrame은 창이 가려져 있으면 실행되지 않아 입력이 유실된다)
    inputRef.current?.focus();
  }, []);

  const sections = useMemo(() => buildSections(query), [query]);
  const flat = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const activeIndex = Math.min(cursor, Math.max(flat.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, sections]);

  const go = (item) => {
    if (!item) return;
    onClose();
    navigate(item.to);
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor(flat.length ? (activeIndex + 1) % flat.length : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor(flat.length ? (activeIndex - 1 + flat.length) % flat.length : 0);
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      // 한글 조합 중 Enter는 글자 확정이므로 이동하지 않는다.
      event.preventDefault();
      go(flat[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  let optionIndex = -1;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/40 px-4 pt-[12vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        aria-label="통합 검색"
        aria-modal="true"
        className="animate-admin-pop flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-5">
          <SearchIcon className="text-slate-400" size={20} />
          <input
            aria-activedescendant={flat.length ? `${listId}-${activeIndex}` : undefined}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded="true"
            aria-label="메뉴, 기능, 주문번호, 이름, 연락처 검색"
            autoComplete="off"
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400"
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            placeholder="메뉴, 기능, 주문번호, 이름, 연락처"
            ref={inputRef}
            role="combobox"
            spellCheck={false}
            type="text"
            value={query}
          />
          <kbd className="admin-kbd">Esc</kbd>
        </div>

        <div className="admin-thin-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-2" id={listId} ref={listRef} role="listbox">
          {sections.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              맞는 메뉴가 없어요. 주문번호나 이름은 두 글자 이상 입력해 주세요.
            </p>
          ) : null}
          {sections.map((section) => (
            <div key={section.title} role="group" aria-label={section.title}>
              <p className="px-3 pb-1 pt-3 text-xs font-semibold text-slate-400">{section.title}</p>
              {section.items.map((item) => {
                optionIndex += 1;
                const index = optionIndex;
                const selected = index === activeIndex;
                const Icon = item.kind === "entity" ? SearchIcon : adminMenuIcons[item.icon] || SearchIcon;
                return (
                  <button
                    aria-selected={selected}
                    className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors ${
                      selected ? "bg-blue-50" : "hover:bg-slate-50"
                    }`}
                    id={`${listId}-${index}`}
                    key={item.id}
                    onClick={() => go(item)}
                    onMouseMove={() => setCursor(index)}
                    role="option"
                    tabIndex={-1}
                    type="button"
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        selected ? "bg-white text-blue-600" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[15px] font-semibold ${selected ? "text-blue-700" : "text-slate-900"}`}>
                        {item.label}
                      </span>
                      {item.trail ? <span className="block truncate text-xs text-slate-500">{item.trail}</span> : null}
                    </span>
                    {selected ? <EnterIcon className="shrink-0 text-blue-500" size={16} /> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="hidden items-center gap-4 border-t border-slate-100 px-5 py-2.5 text-xs text-slate-500 sm:flex">
          <span className="inline-flex items-center gap-1.5"><kbd className="admin-kbd">↑</kbd><kbd className="admin-kbd">↓</kbd>이동</span>
          <span className="inline-flex items-center gap-1.5"><kbd className="admin-kbd">Enter</kbd>열기</span>
          <span className="ml-auto">초성으로도 찾을 수 있어요 · 예: ㅈㅅ → 정산</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
