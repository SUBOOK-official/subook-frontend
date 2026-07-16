import { useEffect, useRef } from "react";
import { sanitizeRichHtml } from "@shared-domain/richText";

// 운영자용 경량 리치텍스트 에디터 (FAQ 답변 등).
// contentEditable + execCommand 기반 — 외부 의존성 없음.
// - 출력(onChange)은 항상 sanitizeRichHtml을 거친 HTML 문자열
// - 붙여넣기는 서식을 버리고 plain text로 삽입 (워드/한글 잔여 마크업 방지)
// - value가 바깥에서 바뀌면(모달 재오픈 등) 포커스가 없을 때만 DOM을 갱신해
//   타이핑 중 캐럿 튐을 방지한다

const TOOLBAR_BUTTONS = [
  { command: "bold", label: <b>B</b>, title: "굵게 (Ctrl+B)" },
  { command: "italic", label: <i>I</i>, title: "기울임 (Ctrl+I)" },
  { command: "underline", label: <u>U</u>, title: "밑줄 (Ctrl+U)" },
  { command: "strikeThrough", label: <s>S</s>, title: "취소선" },
  { command: "insertUnorderedList", label: "• 목록", title: "글머리 기호 목록" },
  { command: "insertOrderedList", label: "1. 목록", title: "번호 목록" },
];

function RichTextEditor({ minHeightClass = "min-h-40", onChange, placeholder = "", value }) {
  const editorRef = useRef(null);

  // 외부 value → DOM 반영 (포커스 중이 아닐 때만)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    const next = value || "";
    if (el.innerHTML !== next) {
      el.innerHTML = next;
    }
  }, [value]);

  const emitChange = () => {
    const el = editorRef.current;
    if (!el) return;
    onChange?.(sanitizeRichHtml(el.innerHTML));
  };

  const exec = (command, arg = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    emitChange();
  };

  const handleLink = () => {
    const url = window.prompt("연결할 주소(URL)를 입력하세요", "https://");
    if (!url) return;
    const trimmed = url.trim();
    if (!/^(https?:\/\/|mailto:)/i.test(trimmed)) {
      window.alert("http:// 또는 https:// 로 시작하는 주소만 사용할 수 있습니다.");
      return;
    }
    exec("createLink", trimmed);
  };

  const handleClearFormat = () => {
    exec("removeFormat");
    document.execCommand("unlink", false, null);
    emitChange();
  };

  const handlePaste = (event) => {
    // 서식 있는 붙여넣기 차단 — plain text만 삽입
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") ?? "";
    document.execCommand("insertText", false, text);
    emitChange();
  };

  return (
    <div className="rounded-lg border border-slate-300 focus-within:border-slate-500">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5 rounded-t-lg">
        {TOOLBAR_BUTTONS.map((button) => (
          <button
            className="rounded px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
            key={button.command}
            onMouseDown={(event) => {
              // 버튼 클릭으로 에디터 선택 영역이 풀리지 않도록
              event.preventDefault();
              exec(button.command);
            }}
            title={button.title}
            type="button"
          >
            {button.label}
          </button>
        ))}
        <button
          className="rounded px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
          onMouseDown={(event) => {
            event.preventDefault();
            handleLink();
          }}
          title="링크 삽입"
          type="button"
        >
          링크
        </button>
        <div className="flex-1" />
        <button
          className="rounded px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-200"
          onMouseDown={(event) => {
            event.preventDefault();
            handleClearFormat();
          }}
          title="선택 영역의 서식 제거"
          type="button"
        >
          서식 지우기
        </button>
      </div>
      <div
        className={`w-full px-3 py-2.5 text-sm leading-relaxed outline-none ${minHeightClass} rich-text-editor-body`}
        contentEditable
        data-placeholder={placeholder}
        onBlur={emitChange}
        onInput={emitChange}
        onPaste={handlePaste}
        ref={editorRef}
        role="textbox"
        suppressContentEditableWarning
      />
    </div>
  );
}

export default RichTextEditor;
