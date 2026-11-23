import { useEffect, useRef, useState } from "react";
import { BusyText } from "../Loading";
import { callIlseongSalesApi, useIlseongSales } from "../../lib/ilseongAdmin";
import { Badge, ErrorNote, FIELD_CLASS, SMALL_BUTTON, Section, useIlseongFeedback } from "./IlseongUi";

// 주문으로 확인하기 — 수북에서 산 주문이 앱에 등록됐는지 보고, 멈춘 등록을 다시 돌린다.
// 결제가 확인되면 수북 서버가 앱 서버에 "이 회원에게 이 학습지를 열어 달라"고 알리고, 산 사람이 수북 계정으로
// 앱에 로그인하면 교재가 등록된다. 그 알림이 실패한 주문이 "앱에 등록하지 못한 주문"이다.

const LINE_STATE = {
  pending: { tone: "orange", label: "등록 준비 중", help: "아직 처리 전이에요. 몇 분 뒤에도 그대로면 [다시 처리]를 눌러 주세요." },
  issued: { tone: "blue", label: "앱 로그인을 기다려요", help: "산 사람이 그 수북 계정으로 앱에 로그인하면 등록돼요. 다른 계정으로 로그인하지 않았는지 물어봐 주세요." },
  redeemed: { tone: "green", label: "앱에 등록됐어요", help: "교재가 그 학생의 책장에 들어가 있어요." },
  revoked: { tone: "grey", label: "끝난 등록", help: "환불 등으로 앱 교재를 거둔 주문이에요." },
};

function lineState(line) {
  if (line.revoke_requested_at && !line.revoke_processed_at) return { tone: "orange", label: "환불 처리 중", help: "앱 교재를 거두는 중이에요. 몇 분 뒤에도 그대로면 [다시 처리]를 눌러 주세요." };
  if (line.revoke_requested_at) return { tone: "grey", label: "환불로 끝났어요", help: "환불해서 앱 교재를 거뒀어요." };
  return LINE_STATE[line.status] ?? { tone: "grey", label: line.status, help: "" };
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function IlseongOrders() {
  const { confirm, toast } = useIlseongFeedback();
  const sales = useIlseongSales();
  const [input, setInput] = useState("");
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const anchor = useRef(null);

  // 홈의 "주문 보기"로 왔으면 이 칸까지 내려 준다
  useEffect(() => {
    if (window.location.hash === "#orders") anchor.current?.scrollIntoView({ block: "start" });
  }, []);

  const run = async (payload, done) => {
    if (busy) return null;
    setBusy(true);
    setError(null);
    try {
      const result = await callIlseongSalesApi({ payload });
      if (done) toast(done);
      return result;
    } catch (requestError) {
      setError(requestError);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const lookup = async (event) => {
    event.preventDefault();
    const orderNumber = input.trim();
    if (!orderNumber) return;
    setDetail(null);
    const result = await run({ action: "order", orderNumber });
    if (result?.order) setDetail(result);
    else if (result) setError(new Error("앱 교재가 들어 있지 않은 주문이에요."));
  };

  const retryJob = async (orderId) => {
    if (await run({ action: "retry", orderId }, "다시 처리하도록 올렸어요. 1–2분 뒤에 확인해 주세요")) void sales.reload();
  };

  const orderAction = async (action, done) => {
    const result = await run({ action, orderId: detail.order.id }, done);
    if (!result) return;
    if (result.order) setDetail(result);
    if (result.notified === false) setError(new Error("안내 알림톡을 보내지 못했어요. 잠시 뒤 다시 눌러 주세요."));
    void sales.reload();
  };

  const resend = async () => {
    const ok = await confirm({ title: "안내 알림톡을 다시 보낼까요?", message: "주문한 사람의 휴대폰으로 앱 이용 안내가 한 번 더 가요.", confirm: "보내기" });
    if (ok) await orderAction("resend", "안내 알림톡을 다시 보냈어요");
  };

  const jobs = (sales.data?.jobs ?? []).filter((job) => job.status === "failed");
  const pending = Number(sales.data?.counts?.pending || 0);

  return (
    <div className="scroll-mt-4" id="orders" ref={anchor}>
      <Section sub="수북에서 산 주문이 앱에 등록됐는지 봐요. 주문번호는 [주문] 화면에서 볼 수 있어요." title="주문으로 확인하기">
        <div className="space-y-4">
          {jobs.length > 0 ? (
            <div className="space-y-2 rounded-xl bg-rose-50 px-4 py-3.5">
              <p className="text-sm font-bold text-rose-800">결제는 됐는데 앱에 등록하지 못한 주문 {jobs.length}건</p>
              <ul className="space-y-1.5">
                {jobs.map((job) => (
                  <li className="flex flex-wrap items-center justify-between gap-2 text-sm text-rose-900" key={job.id}>
                    <span className="font-semibold tabular-nums" title={job.last_error || ""}>{job.order_number}</span>
                    <button className={`btn-secondary ${SMALL_BUTTON} !bg-white`} disabled={busy} onClick={() => void retryJob(job.order_id)} type="button">다시 처리</button>
                  </li>
                ))}
              </ul>
              <p className="text-[13px] leading-relaxed text-rose-800">[다시 처리]를 누르고 1–2분 뒤에도 남아 있으면 개발자에게 알려 주세요.</p>
            </div>
          ) : null}
          {jobs.length === 0 && pending > 0 ? <p className="text-sm text-slate-500">지금 {pending}건을 처리하고 있어요. 보통 1–2분 안에 끝나요.</p> : null}

          <form className="flex flex-wrap gap-2" onSubmit={lookup}>
            <input
              aria-label="주문번호"
              className={`${FIELD_CLASS} min-w-0 flex-1`}
              onChange={(event) => { setError(null); setInput(event.target.value); }}
              placeholder="주문번호 (예: ORD-2611-0001)"
              value={input}
            />
            <button className="btn-secondary !px-5 !py-2" disabled={busy || !input.trim()} type="submit">
              {busy && !detail ? <BusyText>찾는 중</BusyText> : "찾기"}
            </button>
          </form>
          <ErrorNote error={error} />

          {detail?.order ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                <strong className="font-bold tabular-nums text-slate-950">{detail.order.order_number}</strong>
              </p>
              {detail.lines.length === 0 ? (
                <p className="text-sm text-slate-500">이 주문에는 앱 교재가 없어요.</p>
              ) : (
                <ul className="divide-y divide-slate-100 border-y border-slate-100">
                  {detail.lines.map((line) => {
                    const state = lineState(line);
                    return (
                      <li className="py-3" key={line.line_ref}>
                        <p className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-semibold text-slate-900">{line.title}</span>
                          <Badge tone={state.tone}>{state.label}</Badge>
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-500">{state.help}</p>
                        <p className="mt-1 text-[13px] text-slate-400">안내 알림톡 {line.notified_at ? `${formatDateTime(line.notified_at)}에 보냄` : "아직 안 보냄"}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <button className={`btn-secondary ${SMALL_BUTTON}`} disabled={busy} onClick={() => void orderAction("refresh", "앱에 등록됐는지 다시 확인했어요")} type="button">등록됐는지 다시 확인</button>
                <button className={`btn-secondary ${SMALL_BUTTON}`} disabled={busy} onClick={() => void orderAction("retry", "다시 처리하도록 올렸어요. 1–2분 뒤에 확인해 주세요")} type="button">다시 처리</button>
                <button className={`btn-secondary ${SMALL_BUTTON}`} disabled={busy} onClick={() => void resend()} type="button">안내 알림톡 다시 보내기</button>
              </div>
            </div>
          ) : null}
        </div>
      </Section>
    </div>
  );
}
