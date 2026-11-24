import { useState } from "react";
import { BusyText } from "../Loading";
import { ilseongAdmin, useIlseongData } from "../../lib/ilseongAdmin";
import { formatCount, formatDateTime, olderServerError } from "../../lib/ilseongFormat";
import {
  PUSH_BODY_MAX,
  PUSH_TITLE_MAX,
  pushAudience,
  pushBody,
  pushConfirmMessage,
  pushDevicesLabel,
  pushProblem,
  pushResultMessage,
  pushTargetLabel,
} from "../../lib/ilseongPush";
import { EmptyNote, ErrorNote, FIELD_CLASS, Field, LoadingNote, SMALL_BUTTON, Section, TABLE_CLASS, TD_CLASS, TH_CLASS, WarnNote, useIlseongFeedback } from "./IlseongUi";

// 알림 보내기 — 운영진이 학생의 기기에 알림 하나를 보낸다(예: "4주차 해설을 고쳤어요").
// 모든 학생에게, 또는 학습지 하나의 교재를 등록한 학생에게만 보낸다. 보낸 알림은 거둘 수 없어서
// 보내기 전에 받는 학생을 한 번 더 보여 준다. 실제로 보내는 일과 한도(한 시간에 10번)는 앱 서버가 맡는다.
// 앱을 열 때 보여 주는 공지·점검 글은 이것과 다르다: 「앱 설정」에서 한다.

export default function IlseongPush() {
  const push = useIlseongData("/api/admin/push");
  // 받는 학생을 고를 학습지 목록(「학습지」 화면과 같은 것을 읽는다)
  const catalog = useIlseongData("/api/admin/series");
  const status = push.data;
  const seriesList = catalog.data ?? [];

  return (
    <div className="space-y-4">
      <Section sub="학생의 휴대폰과 태블릿에 알림을 하나 보내요. 앱을 열 때 보여 주는 공지는 [앱 설정]에서 해요." title="알림 보내기">
        {!status ? <ErrorNote error={olderServerError(push.error)} onRetry={() => void push.reload()} /> : null}
        {push.loading && !status ? <LoadingNote /> : null}
        {status ? (
          <PushForm
            onRetrySeries={() => void catalog.reload()}
            onSent={() => push.reload({ quiet: true })}
            seriesError={catalog.data ? null : catalog.error}
            seriesList={seriesList}
            status={status}
          />
        ) : null}
      </Section>
      {status ? (
        <Recent list={status.recent ?? []} loading={push.loading} onReload={() => void push.reload()} seriesList={seriesList} />
      ) : null}
    </div>
  );
}

function Counter({ length, max }) {
  return <p className="mt-1 text-right text-xs tabular-nums text-slate-400">{length}/{max}자</p>;
}

function PushForm({ status, seriesList, seriesError, onRetrySeries, onSent }) {
  const { confirm, toast } = useIlseongFeedback();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const ready = status.ready === true;
  const locked = !ready || busy;
  const series = seriesId ? seriesList.find((entry) => String(entry.id) === seriesId) ?? null : null;
  // 고른 학습지가 목록에서 사라졌으면 모든 학생에게 가지 않게 막는다
  const problem = seriesId && !series ? "받는 학생을 다시 골라 주세요." : pushProblem({ title, body });
  const audience = pushAudience(series?.name);

  /** 칸을 고치면 지난 오류 안내는 지운다. */
  const edit = (setter) => (event) => {
    setError(null);
    setter(event.target.value);
  };

  const send = async (event) => {
    event.preventDefault();
    if (locked || problem) return;
    const ok = await confirm({
      title: "이 알림을 보낼까요?",
      message: pushConfirmMessage({ audience, title, body }),
      confirm: "보내기",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const result = await ilseongAdmin.request("POST", "/api/admin/push", pushBody({ title, body, seriesId: series?.id }));
      toast(pushResultMessage(result));
      setTitle("");
      setBody("");
      setSeriesId("");
      await onSent();
    } catch (requestError) {
      // 보낼 준비가 안 됐다, 글자 수가 맞지 않다, 한 시간에 10번을 넘었다 같은 까닭은 앱 서버가 적어 준 말로 보여 준다
      setError(requestError);
      // 그사이 보낼 수 없게 됐으면 위쪽 안내가 바뀌게 다시 읽는다
      if (requestError?.code === "PUSH_NOT_READY") void onSent();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="max-w-2xl space-y-5" onSubmit={(event) => void send(event)}>
      <div>
        <p className="text-sm text-slate-700">
          알림을 받을 수 있는 기기: <strong className="font-semibold tabular-nums text-slate-900">{pushDevicesLabel(status.devices)}</strong>
        </p>
        <p className="mt-0.5 text-[13px] text-slate-500">알림을 받도록 등록된 기기만 세요. 앱을 업데이트하지 않은 기기는 빠져요.</p>
      </div>

      {!ready ? (
        <WarnNote>
          아직 알림을 보낼 수 없어요. 애플의 알림 키를 서버에 넣어야 보낼 수 있어요. 넣는 방법은 운영 안내서의 '알림 보내기'에 있어요. 개발자에게 알려 주세요.
        </WarnNote>
      ) : null}

      <div>
        <Field label="제목">
          <input className={FIELD_CLASS} disabled={locked} maxLength={PUSH_TITLE_MAX} onChange={edit(setTitle)} placeholder="예: 4주차 해설을 고쳤어요" value={title} />
        </Field>
        <Counter length={title.length} max={PUSH_TITLE_MAX} />
      </div>

      <div>
        <Field label="내용">
          <textarea
            className={`${FIELD_CLASS} leading-relaxed`}
            disabled={locked}
            maxLength={PUSH_BODY_MAX}
            onChange={edit(setBody)}
            placeholder="예: 통합과학 4주차 12번 해설을 고쳤어요. 앱을 다시 열면 바뀐 해설이 보여요."
            rows={4}
            value={body}
          />
        </Field>
        <Counter length={body.length} max={PUSH_BODY_MAX} />
      </div>

      <div>
        <Field label="받는 학생">
          <select className={FIELD_CLASS} disabled={locked} onChange={edit(setSeriesId)} value={seriesId}>
            <option value="">모든 학생</option>
            {seriesList.map((entry) => (
              <option key={entry.id} value={String(entry.id)}>{pushAudience(entry.name)}</option>
            ))}
          </select>
        </Field>
        <p className="mt-1.5 text-[13px] text-slate-500">
          {series ? "이 학습지의 교재를 하나라도 등록한 학생에게만 가요." : "알림을 받을 수 있는 모든 학생에게 가요."}
        </p>
        <ErrorNote className="mt-2" error={seriesError} onRetry={onRetrySeries} />
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-600">학생에게 이렇게 보여요</p>
        <div className="mt-1.5 max-w-sm rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className={`break-words text-[15px] font-bold ${title.trim() ? "text-slate-900" : "text-slate-400"}`}>{title.trim() || "제목"}</p>
          <p className={`mt-0.5 whitespace-pre-line break-words text-sm leading-relaxed ${body.trim() ? "text-slate-700" : "text-slate-400"}`}>{body.trim() || "내용"}</p>
        </div>
        <p className="mt-1.5 text-[13px] text-slate-500">긴 글은 기기에 따라 뒷부분이 잘려 보일 수 있어요.</p>
      </div>

      <ErrorNote error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary !w-auto !px-6" disabled={locked || Boolean(problem)} type="submit">
          {busy ? <BusyText>보내는 중</BusyText> : "보내기"}
        </button>
        <span className="text-[13px] text-slate-500">
          {problem && (title || body || seriesId) ? problem : "한 시간에 10번까지 보낼 수 있어요."}
        </span>
      </div>
    </form>
  );
}

function Recent({ list, seriesList, loading, onReload }) {
  return (
    <Section
      right={
        <button className={`btn-secondary ${SMALL_BUTTON}`} disabled={loading} onClick={onReload} type="button">
          새로고침
        </button>
      }
      sub="최근 30건까지 보여요."
      title="최근에 보낸 알림"
    >
      {list.length === 0 ? (
        <EmptyNote>아직 보낸 알림이 없어요.</EmptyNote>
      ) : (
        <div className="overflow-x-auto">
          <table className={`${TABLE_CLASS} min-w-[820px]`}>
            <thead>
              <tr>
                <th className={TH_CLASS}>보낸 때</th>
                <th className={TH_CLASS}>제목 · 내용</th>
                <th className={TH_CLASS}>받는 학생</th>
                <th className={TH_CLASS}>보낸 기기 · 실패</th>
                <th className={`${TH_CLASS} !pr-0`}>보낸 사람</th>
              </tr>
            </thead>
            <tbody>
              {/* 내용이 여러 줄이라 칸을 위로 맞춘다(TD_CLASS의 가운데 맞춤을 이긴다) */}
              {list.map((row) => (
                <tr key={row.id}>
                  <td className={`${TD_CLASS} whitespace-nowrap !align-top text-[13px] tabular-nums text-slate-500`}>{formatDateTime(row.createdAt)}</td>
                  <td className={`${TD_CLASS} !align-top`}>
                    <p className="max-w-[420px] break-words font-semibold">{row.title}</p>
                    <p className="mt-0.5 max-w-[420px] whitespace-pre-line break-words leading-relaxed text-slate-600">{row.body}</p>
                  </td>
                  <td className={`${TD_CLASS} whitespace-nowrap !align-top`}>{pushTargetLabel(row, seriesList)}</td>
                  <td className={`${TD_CLASS} whitespace-nowrap !align-top tabular-nums`}>
                    <p>{formatCount(row.sent)}대</p>
                    {Number(row.failed || 0) > 0 ? <p className="mt-0.5 text-[13px] text-rose-600">실패 {formatCount(row.failed)}대</p> : null}
                    {Number(row.skipped || 0) > 0 ? <p className="mt-0.5 text-[13px] text-slate-500">안드로이드 {formatCount(row.skipped)}대에는 보내지 않았어요</p> : null}
                  </td>
                  <td className={`${TD_CLASS} whitespace-nowrap !pr-0 !align-top text-[13px] text-slate-600`}>{row.by || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
