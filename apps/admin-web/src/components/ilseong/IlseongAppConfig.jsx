import { useId, useState } from "react";
import { BusyText } from "../Loading";
import { ilseongAdmin, useIlseongData, useIlseongSales } from "../../lib/ilseongAdmin";
import { appConfigRisks, formatDateTime } from "../../lib/ilseongFormat";
import { saveSalesSettings, stopAllSelling } from "../../lib/ilseongStore";
import { CheckRow, Disclosure, ErrorNote, FIELD_CLASS, Field, LoadingNote, SMALL_BUTTON, Section, WarnNote, useIlseongFeedback } from "./IlseongUi";

// 앱 설정 — 자주 쓰는 것(공지·점검)을 맨 위에 두고, 환불했을 때의 처리와 앱 받는 곳 주소를 그 아래에,
// 개발자가 알려 줄 때만 바꾸는 것(최소 버전, 캡처 막기, 심사 중인 빌드)은 접어 둔다.
// 공지·점검과 접어 둔 설정은 앱 서버에 저장한다: 학생 앱은 켤 때와 다시 화면에 나올 때 이 값을 읽는다(앱 저장소 docs/adr/0021).
// 환불 처리와 앱 받는 곳 주소는 수북 서버에 저장한다.

const NOTICE_MODES = [
  { mode: "OFF", label: "끔", help: "공지를 보여 주지 않아요." },
  { mode: "INFO", label: "알림", help: "앱을 열면 한 번 보여 줘요. 학생이 닫으면 내용을 바꾸기 전까지 다시 뜨지 않아요." },
  { mode: "BLOCK", label: "점검 중", help: "모든 학생이 앱을 쓸 수 없고 이 글만 보여요. 점검이 끝나면 꼭 다시 꺼 주세요." },
];

export default function IlseongAppConfig() {
  const config = useIlseongData("/api/admin/app-config");
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-slate-500">저장하면 학생 앱에 바로 반영돼요. 앱을 새로 낼 필요가 없어요.</p>
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
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  /** 칸을 고치면 지난 오류 안내는 지운다. */
  const set = (key) => (value) => {
    setError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  };
  // 접어 둔 칸은 form 밖에 있어서, 어느 form의 칸인지 적어 준다
  const text = (key) => ({ value: form[key], onChange: (event) => set(key)(event.target.value), disabled: busy, form: formId });

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
  // 평소와 다른 값이 들어 있으면 펼쳐서 보여 준다(홈의 "지금 할 일"에서 넘어왔을 때 바로 보이게)
  const advancedOpen = Boolean(reviewOn || saved.iosMinVersion || saved.androidMinVersion || !saved.iosBlockCapture || !saved.androidBlockCapture);
  const saveButton = (
    <div className="flex flex-wrap items-center gap-3">
      <button className="btn-primary !w-auto !px-6" disabled={busy} form={formId} type="submit">
        {busy ? <BusyText>저장 중</BusyText> : "저장"}
      </button>
      <span className="text-[13px] text-slate-400">마지막 저장 {formatDateTime(saved.updatedAt)}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <form id={formId} onSubmit={(event) => void submit(event)}>
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
          <ErrorNote error={error} />
          {saveButton}
        </div>
      </Section>
      </form>

      <SalesSettings />

      <Disclosure defaultOpen={advancedOpen} sub="개발자가 알려 줄 때만 바꿔요: 강제 업데이트, 캡처 막기, 스토어 심사." title="잘 쓰지 않는 설정">
      <div className="space-y-8">
      <AdvancedGroup
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
      </AdvancedGroup>

      <AdvancedGroup
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
      </AdvancedGroup>

      <AdvancedGroup
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
      </AdvancedGroup>

      <ErrorNote error={error} />
      {saveButton}
      </div>
      </Disclosure>
    </div>
  );
}

function AdvancedGroup({ title, sub, children }) {
  return (
    <div>
      <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">{sub}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

// ── 환불·앱 받는 곳 ──────────────────────────────────────────

const REFUND_CHOICES = [
  { value: "revoke_access", label: "앱 교재도 거둬요", hint: "환불한 사람은 앱에서 그 교재를 더 볼 수 없어요. 보통 이렇게 둬요." },
  { value: "revoke_unredeemed", label: "아직 앱에 등록하지 않은 것만 막아요", hint: "이미 앱에 등록한 교재는 그대로 볼 수 있어요." },
  { value: "none", label: "앱에는 아무것도 하지 않아요", hint: "환불해도 앱 교재는 그대로예요." },
];

function SalesSettings() {
  const sales = useIlseongSales();
  if (!sales.data) {
    return sales.error ? <ErrorNote error={sales.error} onRetry={() => void sales.reload()} /> : null;
  }
  const settings = sales.data.settings ?? {};
  return <SalesForm key={settings.updated_at ?? "new"} onSaved={() => sales.reload()} settings={settings} />;
}

function SalesForm({ settings, onSaved }) {
  const { confirm, toast } = useIlseongFeedback();
  const [refundPolicy, setRefundPolicy] = useState(settings.refund_policy || "revoke_access");
  const [url, setUrl] = useState(settings.app_download_url || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (work, done) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
      toast(done);
      await onSaved();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  };

  const save = (event) => {
    event.preventDefault();
    if (url.trim() && !url.trim().startsWith("https://")) {
      setError(new Error("앱 받는 곳 주소는 https://로 시작해야 해요."));
      return;
    }
    void run(() => saveSalesSettings({ refundPolicy, appDownloadUrl: url }), "저장했어요");
  };

  const stopAll = async () => {
    const ok = await confirm({
      title: "모든 학습지의 판매를 멈출까요?",
      message: "이 앱의 상품이 모두 수북 사이트에서 숨겨져요. 이미 결제된 주문은 그대로 앱에 등록돼요.\n다시 팔려면 학습지마다 [판매 시작]을 눌러야 해요.",
      confirm: "모두 멈추기",
      danger: true,
    });
    if (ok) void run(() => stopAllSelling(), "모든 학습지의 판매를 멈췄어요");
  };

  return (
    <Section sub="수북 사이트에서 앱 교재를 산 주문에 적용돼요." title="환불과 앱 받는 곳">
      <form className="max-w-2xl space-y-5" onSubmit={save}>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-600">교재를 환불하면</p>
          {REFUND_CHOICES.map((choice) => (
            <label className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${refundPolicy === choice.value ? "border-brand bg-blue-50/40" : "border-slate-200"}`} key={choice.value}>
              <input checked={refundPolicy === choice.value} className="mt-1 h-4 w-4 shrink-0 accent-[#3182f6]" disabled={busy} name="refund-policy" onChange={() => { setError(null); setRefundPolicy(choice.value); }} type="radio" />
              <span>
                <span className="block font-semibold text-slate-900">{choice.label}</span>
                <span className="mt-0.5 block leading-relaxed text-slate-500">{choice.hint}</span>
              </span>
            </label>
          ))}
          <p className="text-[13px] text-slate-500">환불 자체는 이 설정과 관계없이 그대로 돼요. 굿즈만 환불하면 앱에는 아무 일도 없어요.</p>
        </div>
        <div>
          <Field label="앱 받는 곳 주소">
            <input className={FIELD_CLASS} disabled={busy} onChange={(event) => { setError(null); setUrl(event.target.value); }} placeholder="https://" value={url} />
          </Field>
          <p className="mt-1.5 text-[13px] text-slate-500">산 사람의 주문 화면에 이 주소가 보여요. 앱이 스토어에 나온 뒤에 넣어 주세요. 비워 두면 보이지 않아요.</p>
        </div>
        <ErrorNote error={error} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button className="btn-primary !w-auto !px-6" disabled={busy} type="submit">{busy ? <BusyText>저장 중</BusyText> : "저장"}</button>
          {settings.sales_enabled ? (
            <button className={`btn-danger-weak ${SMALL_BUTTON}`} disabled={busy} onClick={() => void stopAll()} type="button">모든 학습지 판매 멈추기</button>
          ) : null}
        </div>
      </form>
    </Section>
  );
}
