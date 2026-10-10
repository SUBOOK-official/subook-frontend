import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, PDFDataRangeTransport } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { fetchStudyMaterialRange } from "@shared-supabase/adminStudyMaterialsClient";
import { InlineLoading } from "./Loading";

GlobalWorkerOptions.workerSrc = workerUrl;
const buttonClass = "min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-40";

export default function StudyMaterialPdfPreview({ url, title, size }) {
  const container = useRef(null);
  const canvas = useRef(null);
  const [width, setWidth] = useState(600);
  const [pdf, setPdf] = useState(null);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(180, Math.floor(entry.contentRect.width - 24))));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setPageInput(String(page)); }, [page]);
  useEffect(() => {
    let active = true;
    setBusy(true); setError(""); setPdf(null);
    const controller = new AbortController();
    const range = new PDFDataRangeTransport(Number(size), new Uint8Array(0));
    range.abort = () => controller.abort();
    range.requestDataRange = (begin, end) => {
      void fetchStudyMaterialRange(url, begin, end, controller.signal).then((bytes) => {
        if (active && !controller.signal.aborted) range.onDataRange(begin, bytes);
      }).catch(() => {
        if (active && !controller.signal.aborted) {
          setBusy(false); setError("PDF를 불러오지 못했습니다. 다시 시도해 주세요."); void task.destroy();
        }
      });
    };
    const task = getDocument({ range, length: Number(size), disableAutoFetch: true, disableStream: true, rangeChunkSize: 256 * 1024,
      cMapUrl: "/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdfjs/standard_fonts/", wasmUrl: "/pdfjs/wasm/", iccUrl: "/pdfjs/iccs/", isEvalSupported: false });
    const timer = setTimeout(() => {
      if (!active) return;
      setError("PDF 응답이 지연되고 있습니다. 다시 시도하거나 원본을 다운로드해 주세요."); setBusy(false);
      void task.destroy();
    }, 60000);
    task.promise.then((document) => { if (active) { clearTimeout(timer); setPdf(document); setPage((previous) => Math.min(previous, document.numPages)); } })
      .catch((caught) => { if (active) { clearTimeout(timer); setBusy(false); setError(caught.name === "PasswordException" ? "암호로 보호된 PDF입니다. 원본을 다운로드해 열어 주세요." : "PDF를 표시하지 못했습니다. 다시 시도하거나 원본을 다운로드해 주세요."); } });
    return () => { active = false; clearTimeout(timer); void task.destroy(); };
  }, [url, size, attempt]);
  useEffect(() => {
    if (!pdf) return undefined;
    let active = true;
    let renderTask;
    let pdfPage;
    setBusy(true); setError("");
    const timer = setTimeout(() => { if (active) { active = false; renderTask?.cancel(); setBusy(false); setError("페이지 표시가 지연되고 있습니다. 다시 시도해 주세요."); } }, 60000);
    const render = async () => {
      try {
        pdfPage = await pdf.getPage(page);
        if (!active) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({ scale: Math.min(width, 1200) / base.width * zoom });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const element = canvas.current;
        element.width = Math.ceil(viewport.width * outputScale); element.height = Math.ceil(viewport.height * outputScale);
        element.style.width = `${Math.ceil(viewport.width)}px`; element.style.height = `${Math.ceil(viewport.height)}px`;
        renderTask = pdfPage.render({ canvas: element, canvasContext: element.getContext("2d"), viewport, transform: [outputScale, 0, 0, outputScale, 0, 0] });
        await renderTask.promise;
        if (active) setBusy(false);
      } catch (caught) { if (active && caught.name !== "RenderingCancelledException") { setBusy(false); setError("이 페이지를 표시하지 못했습니다. 다시 시도해 주세요."); } }
      finally { clearTimeout(timer); pdfPage?.cleanup(); }
    };
    void render();
    return () => { active = false; clearTimeout(timer); renderTask?.cancel(); };
  }, [pdf, page, zoom, width]);
  return <div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2"><button className={buttonClass} disabled={!pdf || page <= 1} onClick={() => setPage(page - 1)}>이전</button>
        <form className="flex items-center gap-1 text-sm text-slate-500" onSubmit={(event) => { event.preventDefault(); const next = Math.max(1, Math.min(pdf?.numPages || 1, Number(pageInput) || 1)); setPage(next); setPageInput(String(next)); }}>
          <input aria-label="PDF 페이지 번호" className="h-11 w-14 rounded-lg border border-slate-200 text-center text-slate-800" inputMode="numeric" value={pageInput} onChange={(event) => setPageInput(event.target.value)} disabled={!pdf} /> / {pdf?.numPages || "…"}<button type="submit" className="sr-only">페이지 이동</button>
        </form><button className={buttonClass} disabled={!pdf || page >= pdf.numPages} onClick={() => setPage(page + 1)}>다음</button></div>
      <select aria-label="PDF 확대" className="h-11 rounded-lg border border-slate-200 bg-white px-2 text-sm" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}><option value={1}>너비 맞춤</option><option value={1.5}>150%</option><option value={2}>200%</option></select>
    </div>
    <div ref={container} className="relative h-[58dvh] min-h-60 overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-3" aria-busy={busy}>
      {busy && <div role="status" className="sticky left-0 top-0 z-10 rounded-lg bg-white/95 p-4 text-center text-sm text-slate-500"><InlineLoading />PDF 페이지를 불러오는 중입니다.</div>}
      {error && <div role="alert" className="rounded-lg bg-white p-5 text-sm text-red-600">{error}<button className={`${buttonClass} ml-3`} onClick={() => setAttempt(attempt + 1)}>다시 시도</button></div>}
      <canvas key={`${page}-${zoom}-${width}`} ref={canvas} role="img" aria-label={`${title}, ${page}페이지`} className={`mx-auto bg-white shadow-sm ${error || !pdf ? "hidden" : ""}`} />
    </div>
  </div>;
}
