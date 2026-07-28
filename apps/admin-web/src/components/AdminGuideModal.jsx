import { useEffect } from "react";
import { useBodyScrollLock } from "@shared-domain/useBodyScrollLock";
import { CloseIcon } from "./icons";

// 탭별 사용 가이드 모달 — AdminShell 타이틀 옆 ? 버튼으로 열린다.
// guide 형태는 lib/adminGuides.js 참고: { title, intro, sections: [{heading, body[], image, imageCaption, tips[]}] }
function AdminGuideModal({ guide, open, onClose }) {
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open || !guide) return null;

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">사용 가이드</p>
            <h2 className="text-xl font-black text-slate-950">{guide.title}</h2>
          </div>
          <button
            aria-label="가이드 닫기"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            <CloseIcon size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-7 overflow-y-auto px-6 py-5">
          {guide.intro ? (
            <p className="text-sm leading-relaxed text-slate-700">{guide.intro}</p>
          ) : null}

          {(guide.sections ?? []).map((section, index) => (
            <section key={section.heading}>
              <h3 className="flex items-center gap-2 text-sm font-black text-slate-900">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
                  {index + 1}
                </span>
                {section.heading}
              </h3>
              <div className="mt-2 space-y-1.5 pl-8">
                {(section.body ?? []).map((line) => (
                  <p className="text-sm leading-relaxed text-slate-700" key={line}>
                    {line}
                  </p>
                ))}
              </div>
              {section.image ? (
                <figure className="mt-3 pl-8">
                  <img
                    alt={section.imageCaption || `${guide.title} 화면 예시`}
                    className="w-full rounded-xl border border-slate-200 shadow-sm"
                    loading="lazy"
                    src={section.image}
                  />
                  {section.imageCaption ? (
                    <figcaption className="mt-1.5 text-xs font-medium text-slate-500">
                      {section.imageCaption}
                    </figcaption>
                  ) : null}
                </figure>
              ) : null}
              {section.tips?.length ? (
                <div className="mt-3 ml-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  {section.tips.map((tip) => (
                    <p className="text-xs font-semibold leading-relaxed text-amber-800" key={tip}>
                      {tip}
                    </p>
                  ))}
                </div>
              ) : null}
            </section>
          ))}
        </div>

        <footer className="flex justify-end border-t border-slate-200 px-6 py-3">
          <button
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700"
            onClick={onClose}
            type="button"
          >
            닫기
          </button>
        </footer>
      </div>
    </div>
  );
}

export default AdminGuideModal;
