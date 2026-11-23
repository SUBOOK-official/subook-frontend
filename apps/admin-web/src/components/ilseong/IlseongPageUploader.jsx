import { useEffect, useRef, useState } from "react";
import { ilseongAdmin, useIlseongData } from "../../lib/ilseongAdmin";
import { IlseongAdminError } from "../../lib/ilseongAdminClient";
import { PagePrepareError, preparePages, releasePages } from "../../lib/ilseongPageImages";
import { pageNumbersLabel } from "../../lib/ilseongPageLayout";
import { ErrorNote, PageThumbs, Progress, SMALL_BUTTON, WarnNote, useIlseongFeedback } from "./IlseongUi";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 연결이 잠깐 끊기거나 서버가 바뀌는 중이면 몇 번 더 보낸다. 내용이 틀린 것(4xx)은 바로 알린다. */
export async function putPageWithRetry(path, blob) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await ilseongAdmin.putJpeg(path, blob);
      return;
    } catch (error) {
      const retry = error instanceof IlseongAdminError && (error.status === 0 || error.status >= 500);
      if (!retry || attempt >= 3) throw error;
      await wait(1500 * attempt);
    }
  }
}

/**
 * 교재 한 권의 쪽 이미지 올리기. PDF·이미지를 고르면 이 브라우저에서 쪽마다 JPEG로 바꿔 미리 보여 주고,
 * 확인한 뒤에 올린다. 다 올라간 뒤에만 학생 앱에 보인다.
 *
 * step: idle → preparing(done/total) → ready(pages) → uploading(pages, done) → (끝나면 onDone)
 * onBusy(바쁜가): 준비한 쪽이 있거나 올리는 중에는 바깥 창을 닫지 못하게 하라는 신호.
 */
export default function IlseongPageUploader({ book, onBusy, onDone }) {
  const { confirm, toast } = useIlseongFeedback();
  const [step, setStep] = useState({ kind: "idle" });
  const [error, setError] = useState(null);
  const [showServer, setShowServer] = useState(false);
  const input = useRef(null);
  const closed = useRef(false);
  const held = useRef([]);

  const server = useIlseongData(`/api/admin/books/${book.id}/pages`);

  // 창을 닫으면 하던 일을 멈추고 미리 보기 이미지를 놓아준다
  useEffect(() => {
    closed.current = false;
    return () => {
      closed.current = true;
      releasePages(held.current);
    };
  }, []);

  const go = (next) => {
    held.current = next.kind === "ready" || next.kind === "uploading" ? next.pages : [];
    onBusy(next.kind !== "idle");
    setStep(next);
  };

  const pick = async (event) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length === 0) return;
    setError(null);
    go({ kind: "preparing", done: 0, total: 0 });
    try {
      const pages = await preparePages(
        files,
        (done, total) => { if (!closed.current) setStep({ kind: "preparing", done, total }); },
        () => closed.current,
      );
      if (closed.current) return;
      if (pages.length === 0) throw new PagePrepareError("쪽이 하나도 없어요.");
      go({ kind: "ready", pages });
    } catch (prepareError) {
      if (closed.current) return;
      setError(prepareError instanceof PagePrepareError ? prepareError : new Error("파일을 쪽 이미지로 바꾸지 못했어요."));
      go({ kind: "idle" });
    }
  };

  const discard = () => {
    if (step.kind === "ready") releasePages(step.pages);
    setError(null);
    go({ kind: "idle" });
  };

  const upload = async (pages) => {
    if (book.pageCount !== null) {
      const ok = await confirm({
        title: `${book.title}의 쪽 이미지를 바꿀까요?`,
        message: `지금 올라가 있는 ${book.pageCount}쪽 대신 새 ${pages.length}쪽이 학생 앱에 보여요. 학생이 쓴 필기는 그대로 남아요.`,
        confirm: "바꾸기",
      });
      if (!ok || closed.current) return;
    }
    setError(null);
    go({ kind: "uploading", pages, done: 0 });
    try {
      const { uploadId } = await ilseongAdmin.request("POST", `/api/admin/books/${book.id}/uploads`);
      for (const page of pages) {
        if (closed.current) return;
        await putPageWithRetry(`/api/admin/books/${book.id}/uploads/${uploadId}/pages/${page.no}`, page.blob);
        if (!closed.current) setStep({ kind: "uploading", pages, done: page.no });
      }
      if (closed.current) return;
      const saved = await ilseongAdmin.request("POST", `/api/admin/books/${book.id}/uploads/${uploadId}/commit`, {
        pageCount: pages.length,
      });
      releasePages(pages);
      held.current = [];
      onBusy(false);
      toast(
        saved.clearedDays.length > 0
          ? `${pages.length}쪽을 올렸어요. 쪽 수가 줄어 ${saved.clearedDays.join(", ")}번째 칸의 쪽 범위가 지워졌어요. 다시 넣어 주세요`
          : `${book.title} ${pages.length}쪽을 올렸어요`,
      );
      onDone(saved.book);
    } catch (uploadError) {
      if (closed.current) return;
      setError(uploadError instanceof Error ? uploadError : new Error("올리지 못했어요."));
      go({ kind: "ready", pages });
    }
  };

  const state = server.data;
  const preview = (pages) => pages.map((page) => ({ key: page.no, url: page.url, label: page.no, title: `${page.no}쪽 크게 보기` }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-600">쪽 이미지</span>
        {state && state.pages.length > 0 && step.kind === "idle" ? (
          <button className={`btn-secondary ${SMALL_BUTTON}`} onClick={() => setShowServer(!showServer)} type="button">
            {showServer ? "접기" : "올라간 쪽 보기"}
          </button>
        ) : null}
      </div>

      {step.kind === "idle" ? (
        <>
          <p className="text-sm text-slate-600">
            {!state ? (server.error ? "서버에 올라간 쪽을 확인하지 못했어요." : "확인하는 중") : null}
            {state && state.pageCount === null ? "아직 올린 쪽 이미지가 없어요." : null}
            {state && state.pageCount !== null ? `서버에 ${state.pages.length}쪽이 올라가 있어요.` : null}
          </p>
          {state && state.missing.length > 0 ? (
            <WarnNote>
              쪽 수는 {state.pageCount}인데 이미지가 없는 쪽이 있어요: {pageNumbersLabel(state.missing)}. 학생 앱에서 그 쪽이 비어 보여요.
            </WarnNote>
          ) : null}
          {showServer && state ? (
            // 앱 서버가 준 주소는 경로뿐이라(서명 포함) 앱 서버 주소를 앞에 붙인다
            <PageThumbs pages={preview(state.pages.map((page) => ({ ...page, url: ilseongAdmin.absoluteUrl(page.url) })))} />
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <button className="btn-secondary !px-4 !py-2" onClick={() => input.current?.click()} type="button">
              {state?.pageCount ? "새 PDF·이미지로 바꾸기" : "PDF·이미지 고르기"}
            </button>
            <span className="text-[13px] text-slate-400">교재 한 권을 한 쪽씩 내보낸 PDF 한 개, 또는 쪽 순서대로 이름 붙인 JPG·PNG 여러 장</span>
          </div>
        </>
      ) : null}

      {step.kind === "preparing" ? (
        <Progress
          label={step.total === 0 ? "파일을 읽는 중" : `쪽 이미지로 바꾸는 중 ${step.done}/${step.total}`}
          ratio={step.total === 0 ? 0 : step.done / step.total}
        />
      ) : null}

      {step.kind === "ready" || step.kind === "uploading" ? (
        <>
          <p className="text-sm text-slate-600">
            {step.pages.length}쪽을 준비했어요. <strong className="font-bold text-slate-900">{book.title}</strong> 교재가 맞는지, 쪽 순서가 맞는지 보고 올려 주세요.
          </p>
          <PageThumbs pages={preview(step.pages)} />
          {step.kind === "uploading" ? (
            <Progress label={`올리는 중 ${step.done}/${step.pages.length}`} ratio={step.done / step.pages.length} />
          ) : (
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary !w-auto !px-4 !py-2" onClick={() => void upload(step.pages)} type="button">
                {step.pages.length}쪽 올리기
              </button>
              <button className="btn-secondary !px-4 !py-2" onClick={discard} type="button">그만두기</button>
            </div>
          )}
        </>
      ) : null}

      <ErrorNote error={error} />
      <input accept="application/pdf,image/jpeg,image/png" hidden multiple onChange={(event) => void pick(event)} ref={input} type="file" />
    </div>
  );
}
