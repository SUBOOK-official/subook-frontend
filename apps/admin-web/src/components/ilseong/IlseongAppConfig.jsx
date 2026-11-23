import { useState } from "react";
import { BusyText } from "../Loading";
import { ilseongAdmin, useIlseongData } from "../../lib/ilseongAdmin";
import { appConfigRisks, formatDateTime } from "../../lib/ilseongFormat";
import { CheckRow, ErrorNote, FIELD_CLASS, Field, LoadingNote, Section, WarnNote, useIlseongFeedback } from "./IlseongUi";

// 앱 설정 — 새 앱을 내지 않고 바로 바뀌는 설정(공지·점검, 최소 버전, 캡처 막기, 심사 중인 빌드).
// 학생 앱은 켤 때와 다시 화면에 나올 때 이 값을 읽는다(앱 저장소 docs/adr/0021).

const NOTICE_MODES = [
  { mode: "OFF", label: "끔", help: "공지를 보여 주지 않아요." },
  { mode: "INFO", label: "알림", help: "앱을 열면 한 번 보여 줘요. 학생이 닫으면 내용을 바꾸기 전까지 다시 뜨지 않아요." },
  { mode: "BLOCK", label: "점검 중", help: "모든 학생이 앱을 쓸 수 없고 이 글만 보여요. 점검이 끝나면 꼭 다시 꺼 주세요." },
];

export default function IlseongAppConfig() {
  const config = useIlseongData("/api/admin/app-config");
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-slate-500">
        새 앱을 내지 않고 바로 바뀌는 설정이에요. 학생 앱은 켤 때와 다시 화면에 나올 때 이 값을 읽어요.
      </p>
      {!config.data ? <ErrorNote error={config.error} onRetry={() => void config.reload()} /> : null}
      {config.loading && !config.data ? <LoadingNote /> : null}
      {/* 저장하면 서버가 돌려준 값으로 칸을 다시 채운다(updatedAt이 바뀌면 새 Form) */}
      {config.data ? <Form key={config.data.updatedAt} onSaved={config.setData} saved={config.data} /> : null}
    </div>
  );
}

function Form({ saved, onSaved }) {
  const { confirm, toast } = useIlseongFeedback();
  const [form, setForm] = useState({
    noticeMode: saved.noticeMode,
    noticeTitle: saved.noticeTitle ?? "",
    noticeBody: saved.noticeBody ?? "",
    iosMinVersion: saved.iosMinVersion ?? "",
    androidMinVersion: saved.androidMinVersion ?? "",
    iosStoreUrl: saved.iosStoreUrl ?? "",
    androidStoreUrl: saved.androidStoreUrl ?? "",
    iosBlockCapture: saved.iosBlockCapture,
    androidBlockCapture: saved.androidBlockCapture,
    iosReviewBuild: saved.iosReviewBuild ?? "",
    androidReviewBuild: saved.androidReviewBuild ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  /** 칸을 고치면 지난 오류 안내는 지운다. */
  const set = (key) => (value) => {
    setError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  };
  const text = (key) => ({ value: form[key], onChange: (event) => set(key)(event.target.value), disabled: busy });

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    // 학생이 앱을 못 쓰게 되거나 교재 보호가 풀리는 변경은 한 번 더 묻는다
    const { risks, minVersionRaised } = appConfigRisks(saved, form);
    if (risks.length > 0) {
      const ok = await confirm({
        title: "이대로 저장할까요?",
        message: `${risks.join("\n")}${minVersionRaised ? "\n\n최소 버전은 그 버전이 스토어에 올라간 뒤에만 넣어야 해요." : ""}`,
        confirm: "저장",
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await ilseongAdmin.request("PUT", "/api/admin/app-config", {
        ...form,
        iosReviewBuild: form.iosReviewBuild.trim(),
        androidReviewBuild: form.androidReviewBuild.trim(),
      });
      toast("앱 설정을 저장했어요");
      onSaved(next);
    } catch (requestError) {
      setError(requestError);
      setBusy(false);
    }
  };

  const reviewOn = form.iosReviewBuild.trim() || form.androidReviewBuild.trim();

  return (
    <form className="space-y-4" onSubmit={(event) => void submit(event)}>
      <Section sub={NOTICE_MODES.find((entry) => entry.mode === form.noticeMode)?.help} title="공지·점검">
        <div className="space-y-4">
          <div aria-label="공지 방식" className="inline-flex gap-1 rounded-xl bg-slate-100 p-1" role="group">
            {NOTICE_MODES.map((entry) => {
              const active = form.noticeMode === entry.mode;
              return (
                <button
                  aria-pressed={active}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${active ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:text-slate-800"}`}
                  disabled={busy}
                  key={entry.mode}
                  onClick={() => set("noticeMode")(entry.mode)}
                  type="button"
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
          {form.noticeMode !== "OFF" ? (
            <>
              <Field label="제목(없어도 돼요)">
                <input className={FIELD_CLASS} maxLength={60} {...text("noticeTitle")} />
              </Field>
              <Field label="내용">
                <textarea className={`${FIELD_CLASS} leading-relaxed`} maxLength={600} rows={4} {...text("noticeBody")} />
              </Field>
            </>
          ) : null}
          {form.noticeMode === "BLOCK" ? (
            <WarnNote>저장하면 바로 모든 학생의 앱이 이 글만 보여 줘요. 스토어 심사 중에는 켜지 마세요.</WarnNote>
          ) : null}
        </div>
      </Section>

      <Section
        sub="이 버전보다 낮은 앱은 업데이트 안내만 보여요. 비우면 막지 않아요. 그 버전이 스토어에 올라간 것을 확인한 뒤에 넣어 주세요."
        title="최소 버전(강제 업데이트)"
      >
        <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
          <div className="space-y-4">
            <Field label="아이폰·아이패드 최소 버전">
              <input className={FIELD_CLASS} placeholder="예: 1.0.2" {...text("iosMinVersion")} />
            </Field>
            <Field label="App Store 주소">
              <input className={FIELD_CLASS} placeholder="https://apps.apple.com/…" {...text("iosStoreUrl")} />
            </Field>
          </div>
          <div className="space-y-4">
            <Field label="안드로이드 최소 버전">
              <input className={FIELD_CLASS} placeholder="예: 1.0.2" {...text("androidMinVersion")} />
            </Field>
            <Field label="Google Play 주소">
              <input className={FIELD_CLASS} placeholder="https://play.google.com/store/apps/details?id=…" {...text("androidStoreUrl")} />
            </Field>
          </div>
        </div>
      </Section>

      <Section
        sub="켜 두면 교재를 보는 화면에서 캡처·녹화가 되지 않아요(안드로이드는 검은 화면, 아이폰·아이패드는 빈 화면으로 찍혀요). 특정 기기에서 교재가 아예 안 보인다는 문의가 이어질 때만 그 종류를 꺼요."
        title="교재 화면 캡처 막기"
      >
        <div className="space-y-2.5">
          <CheckRow checked={form.iosBlockCapture} disabled={busy} onChange={set("iosBlockCapture")}>아이폰·아이패드에서 캡처 막기</CheckRow>
          <CheckRow checked={form.androidBlockCapture} disabled={busy} onChange={set("androidBlockCapture")}>안드로이드에서 캡처 막기</CheckRow>
          {!form.iosBlockCapture || !form.androidBlockCapture ? (
            <WarnNote>꺼 둔 기기에서는 캡처하면 저작권 안내만 보여요. 문제가 풀리면 꼭 다시 켜 주세요.</WarnNote>
          ) : null}
        </div>
      </Section>

      <Section
        sub="여기에 넣은 빌드 번호의 앱에서만 로그인 화면에 심사용 로그인 버튼이 보여요. 심사에 낼 때 그 빌드 번호를 넣고, 심사를 통과해 출시하면 비워 주세요. 비워 두면 어떤 앱에서도 보이지 않아요."
        title="스토어 심사 중인 빌드"
      >
        <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
          <Field label="아이폰·아이패드 빌드 번호">
            <input className={FIELD_CLASS} inputMode="numeric" placeholder="예: 6" {...text("iosReviewBuild")} />
          </Field>
          <Field label="안드로이드 버전 코드">
            <input className={FIELD_CLASS} inputMode="numeric" placeholder="예: 12" {...text("androidReviewBuild")} />
          </Field>
        </div>
        {reviewOn ? (
          <WarnNote className="mt-4">
            이 빌드를 쓰는 사람은 누구나 버튼을 볼 수 있어요(아이디와 비밀번호를 모르면 들어올 수는 없어요). 출시한 뒤에는 꼭 비워 주세요.
          </WarnNote>
        ) : null}
      </Section>

      <ErrorNote error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary !w-auto !px-6" disabled={busy} type="submit">
          {busy ? <BusyText>저장 중</BusyText> : "저장"}
        </button>
        <span className="text-[13px] text-slate-400">마지막 저장 {formatDateTime(saved.updatedAt)}</span>
      </div>
    </form>
  );
}
