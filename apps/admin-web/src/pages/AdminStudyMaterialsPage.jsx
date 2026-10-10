import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@shared-supabase/adminSupabaseClient";
import { createStudyMaterialUrl, listStudyMaterials, uploadStudyMaterial } from "@shared-supabase/adminStudyMaterialsClient";
import { STUDY_MATERIAL_DETAILS, STUDY_MATERIAL_SUBJECTS, formatMaterialSize, validateStudyMaterialFile } from "@shared-domain/studyMaterials";
import AdminShell from "../components/AdminShell";
import AdminDialog from "../components/AdminDialog";
import { BookIcon, FolderIcon, PlusIcon, SearchIcon } from "../components/icons";
import { InlineLoading } from "../components/Loading";

const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const primaryClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50";
const inputClass = "min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";
const PdfPreview = lazy(() => import("../components/StudyMaterialPdfPreview"));

function MaterialPreview({ row, onClose, onDownload, downloadError }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const signed = await createStudyMaterialUrl(supabase, row);
        if (active) { setUrl(signed); setError(""); }
      } catch { if (active) setError("미리보기를 불러오지 못했습니다. 창을 닫고 다시 시도해 주세요."); }
      finally { if (active) setLoading(false); }
    };
    void load();
    const timer = setInterval(load, 50 * 60 * 1000);
    return () => { active = false; clearInterval(timer); };
  }, [row]);
  return <AdminDialog open title={row.title} onClose={onClose} size="max-w-6xl"
    footer={<div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-slate-500">표시되지 않으면 새 탭에서 열거나 다운로드해 주세요.</p>
      <div className="flex gap-2">{url && <a className={buttonClass} href={url} target="_blank" rel="noopener noreferrer">새 탭에서 열기</a>}
        <button className={primaryClass} onClick={() => onDownload(row)}>다운로드</button></div>
    </div>}>
    <div className="p-4 sm:p-5"><p className="mb-3 text-xs text-slate-500">{[row.subject, row.subject_detail, formatMaterialSize(row.size_bytes)].filter(Boolean).join(" · ")}</p>
    {downloadError && <p role="alert" className="mb-3 text-sm text-red-600">{downloadError}</p>}
    {loading ? <div className="py-16"><InlineLoading /></div> : error ? <p role="alert" className="py-10 text-sm text-red-600">{error}</p>
      : <Suspense fallback={<InlineLoading />}><PdfPreview url={url} title={row.title} size={row.size_bytes} /></Suspense>}</div>
  </AdminDialog>;
}

export default function AdminStudyMaterialsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subject, setSubject] = useState("");
  const [detail, setDetail] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("title");
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState(null);
  const [downloading, setDownloading] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadSubject, setUploadSubject] = useState("수학");
  const [uploadDetail, setUploadDetail] = useState("");
  const [queue, setQueue] = useState([]);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const uploadController = useRef(null);
  const fileInput = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setRows(await listStudyMaterials(supabase)); }
    catch { setError("자료 목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => uploadController.current?.abort(), []);
  useEffect(() => {
    if (!uploading) return undefined;
    const preventLeave = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventLeave);
    return () => window.removeEventListener("beforeunload", preventLeave);
  }, [uploading]);

  const counts = useMemo(() => Object.fromEntries(STUDY_MATERIAL_SUBJECTS.map((value) => [value, rows.filter((row) => row.subject === value).length])), [rows]);
  const details = useMemo(() => [...new Set(rows.filter((row) => !subject || row.subject === subject).map((row) => row.subject_detail).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")), [rows, subject]);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ko");
    return rows.filter((row) => (!subject || row.subject === subject) && (!detail || (detail === "__none" ? !row.subject_detail : row.subject_detail === detail))
      && (!term || `${row.title} ${row.file_name} ${row.subject} ${row.subject_detail}`.toLocaleLowerCase("ko").includes(term)))
      .sort((a, b) => sort === "newest" ? b.created_at.localeCompare(a.created_at) : a.title.localeCompare(b.title, "ko", { numeric: true }));
  }, [rows, subject, detail, query, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / 30));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 30, currentPage * 30);
  const selectSubject = (value) => { setSubject(value); setDetail(""); setPage(1); };

  const download = async (row) => {
    setDownloading(row.id); setError("");
    try {
      const url = await createStudyMaterialUrl(supabase, row, true);
      const link = document.createElement("a");
      link.href = url; link.download = row.file_name; link.rel = "noopener noreferrer";
      document.body.appendChild(link); link.click(); link.remove();
    } catch { setError("다운로드 링크를 만들지 못했습니다. 다시 시도해 주세요."); }
    finally { setDownloading(""); }
  };

  const addFiles = (files) => {
    if (uploading) return;
    setUploadError("");
    if (uploadDetail.trim().length > 80) { setUploadError("세부과목은 80자 이하로 입력해 주세요."); return; }
    const valid = [];
    const errors = [];
    for (const file of Array.from(files)) {
      const validation = validateStudyMaterialFile(file);
      if (validation) { errors.push(`${file.name}: ${validation}`); continue; }
      valid.push({ id: crypto.randomUUID(), file, subject: uploadSubject, subject_detail: uploadDetail.trim(), status: "pending", progress: 0 });
    }
    setQueue((previous) => [...previous, ...valid.filter((item) => !previous.some((old) => old.file.name === item.file.name && old.file.size === item.file.size && old.subject === item.subject && old.subject_detail === item.subject_detail))]);
    if (errors.length) setUploadError(errors.join("\n"));
    if (fileInput.current) fileInput.current.value = "";
  };
  const updateItem = (id, patch) => setQueue((previous) => previous.map((item) => item.id === id ? { ...item, ...patch } : item));
  const startUpload = async () => {
    if (uploadController.current) return;
    const controller = new AbortController();
    uploadController.current = controller;
    setUploading(true); setUploadError("");
    try {
      for (const item of queue.filter((entry) => entry.status !== "done")) {
        if (controller.signal.aborted) break;
        updateItem(item.id, { status: "uploading", error: "" });
        try {
          const row = await uploadStudyMaterial(supabase, item, { signal: controller.signal, onProgress: (progress) => updateItem(item.id, { progress }) });
          updateItem(item.id, { status: "done", progress: 100 });
          setRows((previous) => [row, ...previous.filter((existing) => existing.id !== row.id)]);
        } catch (caught) { updateItem(item.id, { status: "error", error: caught.message || "업로드하지 못했습니다. 다시 시도해 주세요." }); }
      }
    } finally { setUploading(false); uploadController.current = null; }
  };
  const done = queue.filter((item) => item.status === "done").length;

  return <AdminShell title="2028 수능 자료" activeModule="study-materials" actions={<button className={primaryClass} onClick={() => setUploadOpen(true)}><PlusIcon className="h-4 w-4" />PDF 업로드</button>}>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-5 border-b border-slate-100 bg-slate-50 px-5 py-6 sm:px-7">
        <div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-900 text-white"><BookIcon className="h-7 w-7" /></div>
          <div><p className="text-xs font-bold tracking-widest text-slate-400">SUBOOK LIBRARY / 2028</p><h2 className="mt-1 text-xl font-bold text-slate-900">함께 모으는 수능 자료실</h2><p className="mt-1 text-sm text-slate-500">과목별 교재와 해설을 한곳에서 찾아보세요.</p></div></div>
        <div className="flex items-center gap-5 text-right"><div><p className="text-2xl font-bold tabular-nums text-slate-900">{rows.length}<span className="ml-1 text-sm font-medium text-slate-500">개</span></p><p className="mt-1 text-xs text-slate-400">등록된 PDF</p></div><span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">관리자 전용</span></div>
      </div>
      <div className="space-y-5 p-5 sm:p-7">
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="과목 필터">
          {["", ...STUDY_MATERIAL_SUBJECTS.filter((value) => counts[value] || value === subject)].map((value) => <button key={value || "all"} aria-pressed={subject === value} onClick={() => selectSubject(value)}
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-semibold ${subject === value ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}>
            {value || "전체 자료"}<span className={`text-xs tabular-nums ${subject === value ? "text-slate-300" : "text-slate-400"}`}>{value ? counts[value] : rows.length}</span></button>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_130px]">
          <label className="relative"><SearchIcon className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" /><input aria-label="자료 검색" className={`${inputClass} pl-10`} placeholder="교재명, 파일명으로 검색" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
          <select aria-label="세부과목 필터" className={inputClass} value={detail} onChange={(event) => { setDetail(event.target.value); setPage(1); }}><option value="">모든 세부과목</option>{details.map((value) => <option key={value}>{value}</option>)}<option value="__none">공통 자료</option></select>
          <select aria-label="자료 정렬" className={inputClass} value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="title">이름순</option><option value="newest">최근 업로드순</option></select>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500"><span>{subject || "전체 자료"}{detail && ` / ${detail === "__none" ? "공통 자료" : detail}`} <strong className="ml-1 text-slate-800">{filtered.length}개</strong></span><button className="min-h-11 px-2 font-semibold hover:text-slate-900" onClick={load} disabled={loading}>새로고침</button></div>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {loading ? <div className="py-14"><InlineLoading /></div> : !visible.length ? <div className="rounded-xl border border-dashed border-slate-200 px-5 py-16 text-center"><FolderIcon className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-4 font-semibold text-slate-700">{rows.length ? "조건에 맞는 자료가 없습니다." : "첫 번째 PDF 자료를 올려보세요."}</p><p className="mt-2 text-sm text-slate-400">{rows.length ? "검색어나 과목 필터를 바꿔보세요." : "관리자 누구나 과목을 선택해 교재를 업로드할 수 있습니다."}</p></div>
          : <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            <div className="hidden grid-cols-[minmax(0,1fr)_150px_90px_190px] gap-4 rounded-t-xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500 lg:grid"><span>자료명</span><span>과목 / 세부과목</span><span>파일 크기</span><span className="text-right">자료 열기</span></div>
            {visible.map((row) => <div key={row.id} className="grid gap-3 px-4 py-4 hover:bg-slate-50/60 lg:grid-cols-[minmax(0,1fr)_150px_90px_190px] lg:items-center lg:gap-4">
              <button onClick={() => setPreview(row)} className="flex min-w-0 items-center gap-3 text-left"><span className="flex h-11 w-10 shrink-0 items-center justify-center rounded-lg border border-rose-100 bg-rose-50 text-[10px] font-bold tracking-wide text-rose-600">PDF</span><span className="min-w-0"><span className="block break-words text-sm font-semibold leading-6 text-slate-800">{row.title}</span><span className="mt-0.5 block text-xs text-slate-400">{new Date(row.created_at).toLocaleDateString("ko-KR")} 등록</span></span></button>
              <div className="flex items-center gap-2 text-xs lg:block"><span className="font-semibold text-slate-600">{row.subject}</span><span className="text-slate-400 lg:mt-1 lg:block">{row.subject_detail || "공통 자료"}</span><span className="ml-auto text-slate-400 lg:hidden">{formatMaterialSize(row.size_bytes)}</span></div>
              <p className="hidden text-xs tabular-nums text-slate-500 lg:block">{formatMaterialSize(row.size_bytes)}</p>
              <div className="flex justify-end gap-2"><button className={`${buttonClass} px-3`} aria-label={`${row.title} 미리보기`} onClick={() => setPreview(row)}>미리보기</button><button className={`${buttonClass} px-3`} disabled={downloading === row.id} aria-label={`${row.title} 다운로드`} onClick={() => download(row)}>{downloading === row.id ? "준비 중" : "다운로드"}</button></div>
            </div>)}
          </div>}
        {pages > 1 && <nav aria-label="자료 페이지" className="flex items-center justify-center gap-5"><button className={buttonClass} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>이전</button><span className="text-sm tabular-nums text-slate-600">{currentPage} / {pages}</span><button className={buttonClass} disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>다음</button></nav>}
      </div>
    </section>
    {preview && <MaterialPreview key={preview.id} row={preview} onClose={() => setPreview(null)} onDownload={download} downloadError={error} />}
    <AdminDialog open={uploadOpen} title="PDF 자료 업로드" onClose={() => setUploadOpen(false)} busy={uploading} size="xl" footer={<div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-slate-500">{done} / {queue.length}개 완료</span><div className="flex gap-2">{uploading ? <button className={buttonClass} onClick={() => uploadController.current?.abort()}>업로드 중지</button> : <><button className={buttonClass} onClick={() => setUploadOpen(false)}>닫기</button><button className={primaryClass} disabled={!queue.length || done === queue.length} onClick={startUpload}>{queue.some((item) => item.status === "error") ? "남은 파일 다시 업로드" : "업로드 시작"}</button></>}</div></div>}>
      <div className="p-4 sm:p-6"><p className="mb-5 text-sm text-slate-500">과목을 먼저 선택한 뒤 PDF를 추가하세요. 여러 파일을 한 번에 올릴 수 있습니다.</p>
      <div className="mb-4 grid gap-3 sm:grid-cols-2"><label className="space-y-2 text-sm font-semibold text-slate-600"><span>과목</span><select className={inputClass} value={uploadSubject} disabled={uploading} onChange={(event) => { setUploadSubject(event.target.value); setUploadDetail(""); }}>{STUDY_MATERIAL_SUBJECTS.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="space-y-2 text-sm font-semibold text-slate-600"><span>세부과목 <span className="font-normal text-slate-400">선택</span></span><input className={inputClass} list="study-material-details" value={uploadDetail} disabled={uploading} maxLength={80} placeholder="예: 대수 · 비워두면 공통 자료" onChange={(event) => setUploadDetail(event.target.value)} /><datalist id="study-material-details">{[...new Set([...STUDY_MATERIAL_DETAILS[uploadSubject], ...rows.filter((row) => row.subject === uploadSubject).map((row) => row.subject_detail).filter(Boolean)])].map((value) => <option key={value} value={value} />)}</datalist></label></div>
      <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-7 text-center" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}>
        <FolderIcon className="mx-auto mb-3 h-8 w-8 text-slate-400" /><button className={buttonClass} disabled={uploading} onClick={() => fileInput.current?.click()}>PDF 파일 선택</button><p className="mt-3 text-xs text-slate-500">여기에 파일을 끌어 놓으세요 · PDF 전용 · 파일당 최대 1GB</p><input ref={fileInput} type="file" accept=".pdf,application/pdf" multiple className="hidden" aria-label="업로드할 PDF" onChange={(event) => addFiles(event.target.files)} />
      </div>
      {uploadError && <p role="alert" className="mt-3 whitespace-pre-line text-sm text-red-600">{uploadError}</p>}
      {queue.length > 0 && <div className="mt-5 space-y-3"><div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-700">선택한 파일 {queue.length}개</h3>{!uploading && <button className="min-h-11 px-2 text-xs text-slate-500" onClick={() => setQueue((previous) => previous.filter((item) => item.status !== "done"))}>완료 항목 비우기</button>}</div>
        {queue.map((item) => <div key={item.id} className="rounded-lg border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-700">{item.file.name}</p><p className="mt-1 text-xs text-slate-400">{[item.subject, item.subject_detail, formatMaterialSize(item.file.size)].filter(Boolean).join(" · ")}</p></div>{item.status === "done" ? <span className="shrink-0 text-xs font-bold text-emerald-600">완료</span> : !uploading && <button aria-label={`${item.file.name} 선택 취소`} className="min-h-11 shrink-0 px-2 text-xs text-slate-500" onClick={() => setQueue((previous) => previous.filter((entry) => entry.id !== item.id))}>제외</button>}</div>
          {item.status === "uploading" && <div className="mt-3"><div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${item.file.name} 업로드 진행률`} aria-valuenow={item.progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-blue-600 transition-all" style={{ width: `${item.progress}%` }} /></div><p className="mt-1 text-right text-xs text-slate-500">{item.progress === 100 ? "자료 등록 중" : `${item.progress}%`}</p></div>}
          {item.error && <p role="alert" className="mt-2 text-xs text-red-600">{item.error}</p>}</div>)}
      </div>}</div>
    </AdminDialog>
  </AdminShell>;
}
