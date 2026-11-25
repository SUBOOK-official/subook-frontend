import { useRef, useState } from "react";
import AdminDialog from "../AdminDialog";
import { BusyText } from "../Loading";
import { ilseongAdmin } from "../../lib/ilseongAdmin";
import { COVER_ACCEPT } from "../../lib/ilseongCover";
import { toCoverJpeg } from "../../lib/ilseongCoverImage";
import { ErrorNote, useIlseongFeedback } from "./IlseongUi";

/**
 * 학습지 표지 넣기(앱 저장소 docs/adr/0060). 표지는 학습지 하나에 한 장이다.
 * 표지를 넣으면 학생 앱의 책장에서 이 학습지의 이름 옆에 그 그림이 보인다. 넣거나 바꾸면 바로 앱에 보인다.
 *
 * onChanged(list): 표지를 넣거나 뺀 뒤 앱 서버가 준 새 학습지 목록.
 */
export default function IlseongCoverDialog({ series, onChanged, onClose }) {
  const { confirm, toast } = useIlseongFeedback();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const input = useRef(null);
  const closed = useRef(false);
  const url = series.coverUrl ? ilseongAdmin.absoluteUrl(series.coverUrl) : null;

  const close = () => {
    closed.current = true;
    onClose();
  };

  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setBusy("put");
    try {
      const blob = await toCoverJpeg(file);
      const list = await ilseongAdmin.putJpeg(`/api/admin/series/${series.id}/cover`, blob);
      if (closed.current) return;
      onChanged(list);
      toast(series.coverUrl ? "표지를 바꿨어요" : "표지를 넣었어요");
    } catch (uploadError) {
      if (!closed.current) setError(uploadError instanceof Error ? uploadError : new Error("표지를 넣지 못했어요."));
    } finally {
      if (!closed.current) setBusy(null);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: "표지를 뺄까요?",
      message: "학생 앱의 책장에서 이 학습지의 표지가 사라져요.",
      confirm: "빼기",
      danger: true,
    });
    if (!ok || closed.current) return;
    setError(null);
    setBusy("remove");
    try {
      const list = await ilseongAdmin.request("DELETE", `/api/admin/series/${series.id}/cover`);
      if (closed.current) return;
      onChanged(list);
      toast("표지를 뺐어요");
    } catch (removeError) {
      if (!closed.current) setError(removeError);
    } finally {
      if (!closed.current) setBusy(null);
    }
  };

  return (
    <AdminDialog
      busy={busy !== null}
      footer={
        <div className="flex justify-end">
          <button className="btn-secondary !px-4 !py-2" disabled={busy !== null} onClick={close} type="button">닫기</button>
        </div>
      }
      onClose={close}
      open
      title={`${series.name} 표지`}
    >
      <div className="space-y-4 px-6 py-5">
        <p className="text-sm leading-relaxed text-slate-600">
          학습지의 표지 그림이에요. 넣으면 학생 앱의 책장에서 「{series.name}」 이름 옆에 보여요. 넣거나 바꾸면 바로 앱에 보여요.
        </p>
        <div className="flex flex-wrap items-start gap-5">
          <div
            className="flex w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
            style={{ aspectRatio: "1 / 1.4125" }}
          >
            {url ? (
              <img alt={`${series.name} 표지`} className="h-full w-full object-cover" src={url} />
            ) : (
              <span className="text-[13px] text-slate-400">표지 없음</span>
            )}
          </div>
          <div className="min-w-0 flex-1 basis-[14rem] space-y-3">
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary !w-auto !px-4 !py-2" disabled={busy !== null} onClick={() => input.current?.click()} type="button">
                {busy === "put" ? <BusyText>넣는 중</BusyText> : url ? "다른 그림으로 바꾸기" : "그림 고르기"}
              </button>
              {url ? (
                <button className="btn-secondary !px-4 !py-2" disabled={busy !== null} onClick={() => void remove()} type="button">
                  {busy === "remove" ? <BusyText>빼는 중</BusyText> : "빼기"}
                </button>
              ) : null}
            </div>
            <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-slate-500">
              <li>JPG, PNG, PDF(첫 쪽)를 넣을 수 있어요.</li>
              <li>세로로 긴 책 모양 그림을 넣어요. B5 교재라면 가로 1000 × 세로 1413px 이상이 좋아요.</li>
              <li>모양이 책과 다르면 가장자리가 잘려 보여요. 칼선·안전선은 끄고 내보낸 그림을 써요.</li>
            </ul>
            <ErrorNote error={error} />
          </div>
        </div>
      </div>
      <input accept={COVER_ACCEPT} hidden onChange={(event) => void pick(event)} ref={input} type="file" />
    </AdminDialog>
  );
}
