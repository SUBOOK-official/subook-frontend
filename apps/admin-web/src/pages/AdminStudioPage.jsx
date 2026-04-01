import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSectionTabs from "../components/AdminSectionTabs";
import { useAdminStudio } from "../contexts/AdminStudioContext";
import { getSellerLookupOrigin } from "../lib/portalLinks";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";

function formatEstimatedTime(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "곧 완료";
  }

  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }

  if (minutes > 0) {
    return `${minutes}분 ${seconds}초`;
  }

  return `${seconds}초`;
}

function getDialogFocusableElements(container) {
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled"));
}

function AdminStudioPage() {
  const navigate = useNavigate();
  const studioInputRef = useRef(null);
  const selectModeDialogRef = useRef(null);
  const appendActionButtonRef = useRef(null);
  const sellerPortalUrl = getSellerLookupOrigin();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const {
    jobs,
    summary,
    notice,
    error,
    isGenerating,
    studioProgress,
    requestTimeoutMs,
    supportsDirectoryDownload,
    replaceFiles,
    appendFiles,
    clearJobs,
    startGeneration,
    retryFailedJobs,
    retryJob,
    downloadJob,
    downloadAllGenerated,
  } = useAdminStudio();

  const isGenerateDisabled = isGenerating || summary.ready + summary.error === 0;
  const isRetryDisabled = isGenerating || summary.error === 0;
  const isClearDisabled = isGenerating || jobs.length === 0;
  const isBatchDownloadDisabled = summary.done === 0;
  const [isSelectModeModalOpen, setIsSelectModeModalOpen] = useState(false);
  const [pendingSelectedFiles, setPendingSelectedFiles] = useState([]);
  const batchDownloadLabel = supportsDirectoryDownload
    ? "생성 완료 항목 폴더 저장"
    : "생성 완료 항목 일괄 다운로드";
  const batchDownloadHint = supportsDirectoryDownload
    ? "지원 브라우저에서는 선택한 폴더에 결과를 한 번에 저장합니다."
    : "현재 브라우저에서는 여러 다운로드 허용이 필요할 수 있습니다.";

  const handleOpenStudioPicker = () => {
    studioInputRef.current?.click();
  };

  const handleStudioFileChange = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = "";

    if (selectedFiles.length === 0) {
      return;
    }

    if (jobs.length > 0) {
      setPendingSelectedFiles(selectedFiles);
      setIsSelectModeModalOpen(true);
      return;
    }

    replaceFiles(selectedFiles);
  };

  const closeSelectModeModal = () => {
    setIsSelectModeModalOpen(false);
    setPendingSelectedFiles([]);
  };

  const handleReplaceSelectedFiles = () => {
    if (pendingSelectedFiles.length === 0) {
      closeSelectModeModal();
      return;
    }

    replaceFiles(pendingSelectedFiles);
    closeSelectModeModal();
  };

  const handleAppendSelectedFiles = () => {
    if (pendingSelectedFiles.length === 0) {
      closeSelectModeModal();
      return;
    }

    appendFiles(pendingSelectedFiles);
    closeSelectModeModal();
  };

  useEffect(() => {
    if (!isSelectModeModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrameId = window.requestAnimationFrame(() => {
      appendActionButtonRef.current?.focus();
    });

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSelectModeModal();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getDialogFocusableElements(selectModeDialogRef.current);
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(focusFrameId);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSelectModeModalOpen]);

  const handleSignOut = async () => {
    if (!isSupabaseConfigured) {
      return;
    }

    setIsSigningOut(true);
    await supabase.auth.signOut();
    setIsSigningOut(false);
    navigate("/admin/login", { replace: true });
  };

  return (
    <main className="app-shell-admin">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-brand">Admin</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">사진 스튜디오</h1>
        </div>
        <div className="flex items-center gap-2">
          <a className="btn-secondary !px-3 !py-2 text-xs" href={sellerPortalUrl}>
            판매자 화면
          </a>
          <button
            className="btn-secondary !px-3 !py-2 text-xs"
            disabled={isSigningOut}
            onClick={handleSignOut}
            type="button"
          >
            {isSigningOut ? "로그아웃 중..." : "로그아웃"}
          </button>
        </div>
      </header>

      <AdminSectionTabs />

      {!isSupabaseConfigured ? (
        <p className="notice-error mb-4">
          `.env` 파일에 `VITE_SUPABASE_ADMIN_URL`, `VITE_SUPABASE_ADMIN_ANON_KEY`를 설정해 주세요.
        </p>
      ) : null}

      <section className="card animate-rise">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="section-title">책 사진 스튜디오 (AI)</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">
              업로드한 책 이미지를 판매용 스튜디오 컷으로 자동 생성합니다.
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              장수 제한 없음 · JPG/PNG/WEBP 지원 · 요청 타임아웃{" "}
              {Math.floor(requestTimeoutMs / 1000)}초
            </p>
            <p className="mt-1 text-xs font-semibold text-sky-700">
              생성 시작 후 다른 관리자 메뉴로 이동해도 백그라운드에서 계속 처리됩니다.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              className="btn-secondary !w-auto !px-3 !py-2 text-xs"
              onClick={handleOpenStudioPicker}
              type="button"
            >
              사진 선택
            </button>
            <button
              className="btn-secondary !w-auto !px-3 !py-2 text-xs"
              disabled={isClearDisabled}
              onClick={clearJobs}
              type="button"
            >
              선택 초기화
            </button>
            <button
              className="inline-flex rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isGenerateDisabled}
              onClick={startGeneration}
              type="button"
            >
              {isGenerating ? "백그라운드 처리 중..." : "스튜디오 사진 생성"}
            </button>
            <button
              className="btn-secondary !w-auto !px-3 !py-2 text-xs"
              disabled={isRetryDisabled}
              onClick={retryFailedJobs}
              type="button"
            >
              실패 항목 재시도
            </button>
            <button
              className="btn-secondary !w-auto !px-3 !py-2 text-xs sm:col-span-2"
              disabled={isBatchDownloadDisabled}
              onClick={() => {
                void downloadAllGenerated();
              }}
              type="button"
            >
              {batchDownloadLabel}
            </button>
            <p className="text-[11px] font-semibold text-slate-500 sm:col-span-2">
              {batchDownloadHint}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-bold text-slate-500">준비</p>
            <p className="text-lg font-black text-slate-900">{summary.ready}</p>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
            <p className="text-[11px] font-bold text-sky-700">진행</p>
            <p className="text-lg font-black text-sky-900">{summary.queued + summary.processing}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="text-[11px] font-bold text-emerald-700">완료</p>
            <p className="text-lg font-black text-emerald-900">{summary.done}</p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
            <p className="text-[11px] font-bold text-rose-700">실패</p>
            <p className="text-lg font-black text-rose-900">{summary.error}</p>
          </div>
        </div>

        {studioProgress.total > 0 ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <p>
                완료/전체 {studioProgress.completed}/{studioProgress.total}
              </p>
              <p>{studioProgress.percent}%</p>
            </div>
            <div
              aria-label="스튜디오 생성 진행률"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={studioProgress.percent}
              className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
              role="progressbar"
            >
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
                style={{ width: `${studioProgress.percent}%` }}
              />
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              {studioProgress.remaining > 0 ? (
                studioProgress.estimatedRemainingMs === null ? (
                  "남은 예상 시간을 계산 중입니다..."
                ) : (
                  <>남은 예상 시간 {formatEstimatedTime(studioProgress.estimatedRemainingMs)}</>
                )
              ) : (
                "모든 항목 처리가 완료되었습니다."
              )}
            </p>
          </div>
        ) : null}

        {error ? <p className="notice-error mt-4">{error}</p> : null}
        {notice ? <p className="notice-success mt-4">{notice}</p> : null}

        {jobs.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {jobs.map((job) => (
              <article
                className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                key={job.id}
              >
                <div className="flex items-center gap-2">
                  <img
                    alt={job.fileName}
                    className="h-16 w-16 rounded-lg border border-slate-200 bg-white object-cover"
                    src={job.sourcePreviewUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-800">{job.fileName}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-600">
                      {job.status === "ready" ? "준비됨" : null}
                      {job.status === "queued" ? "대기 중..." : null}
                      {job.status === "processing" ? "생성 중..." : null}
                      {job.status === "done" ? "생성 완료" : null}
                      {job.status === "error" ? "생성 실패" : null}
                    </p>
                  </div>
                </div>

                {job.status === "done" && job.generatedDataUrl ? (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
                    <img
                      alt={`${job.fileName} 생성 결과`}
                      className="h-32 w-full rounded-md object-cover"
                      src={job.generatedDataUrl}
                    />
                    <button
                      className="btn-secondary mt-2 w-full !py-2 text-xs"
                      onClick={() => downloadJob(job)}
                      type="button"
                    >
                      결과 다운로드
                    </button>
                  </div>
                ) : null}

                {job.status === "error" ? (
                  <div className="mt-2 space-y-2">
                    {job.errorMessage ? (
                      <p className="text-xs font-semibold text-rose-700">{job.errorMessage}</p>
                    ) : null}
                    <button
                      className="btn-secondary w-full !py-2 text-xs"
                      disabled={isGenerating}
                      onClick={() => retryJob(job.id)}
                      type="button"
                    >
                      이 항목만 재시도
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
            <p className="text-sm font-semibold text-slate-600">
              아직 선택된 이미지가 없습니다. 상단에서 사진을 먼저 선택해 주세요.
            </p>
          </div>
        )}

        <input
          ref={studioInputRef}
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          className="hidden"
          multiple
          onChange={handleStudioFileChange}
          type="file"
        />
      </section>

      {isSelectModeModalOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/45 px-4 py-10">
          <div className="flex min-h-full items-center justify-center">
            <div
              aria-describedby="studio-select-mode-description"
              aria-labelledby="studio-select-mode-title"
              aria-modal="true"
              className="w-full max-w-md rounded-2xl bg-white p-5 shadow-soft"
              ref={selectModeDialogRef}
              role="dialog"
            >
              <h2 className="text-lg font-black text-slate-900" id="studio-select-mode-title">
                파일 선택 방식
              </h2>
              <p
                className="mt-2 text-sm font-semibold leading-relaxed text-slate-600"
                id="studio-select-mode-description"
              >
                기존 작업이 {jobs.length}장 있습니다. 새로 고른 {pendingSelectedFiles.length}장을
                어떻게 처리할까요?
              </p>
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  이번에 선택한 파일
                </p>
                <ul className="mt-2 space-y-1 text-sm font-semibold text-slate-700">
                  {pendingSelectedFiles.slice(0, 3).map((file) => (
                    <li className="truncate" key={`${file.name}-${file.lastModified}`}>
                      {file.name}
                    </li>
                  ))}
                </ul>
                {pendingSelectedFiles.length > 3 ? (
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    외 {pendingSelectedFiles.length - 3}장
                  </p>
                ) : null}
              </div>
              {isGenerating ? (
                <p className="mt-3 text-xs font-semibold text-sky-700">
                  생성 중에는 기존 작업 덮어쓰기가 불가합니다. 추가만 가능합니다.
                </p>
              ) : (
                <p className="mt-3 text-xs font-semibold text-rose-700">
                  덮어쓰기를 선택하면 기존 대기열과 생성 결과가 현재 선택 파일로 교체됩니다.
                </p>
              )}
              <div className="mt-4 grid gap-2">
                <button
                  className="btn-primary"
                  onClick={handleAppendSelectedFiles}
                  ref={appendActionButtonRef}
                  type="button"
                >
                  기존 유지 후 추가
                </button>
                <button
                  className="inline-flex w-full items-center justify-center rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 transition hover:bg-rose-100"
                  disabled={isGenerating}
                  onClick={handleReplaceSelectedFiles}
                  type="button"
                >
                  기존 작업 덮어쓰기
                </button>
                <button className="btn-secondary" onClick={closeSelectModeModal} type="button">
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default AdminStudioPage;
