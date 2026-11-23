import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@shared-supabase/adminSupabaseClient";
import { ilseongAdmin, useIlseongData } from "../../lib/ilseongAdmin";
import { formatDate, formatDateTime } from "../../lib/ilseongFormat";
import { grantCreator, grantState, memberAppExtraAction, memberAppPanel, memberAppProducts } from "../../lib/ilseongMemberApp";
import { BusyText, InlineLoading } from "../Loading";
import { Badge, BookList, ErrorNote, IlseongFeedbackProvider, ProductPickerDialog, WarnNote, ilseongPath, useIlseongFeedback } from "./IlseongUi";

// 수북 회원 상세(고객 › 회원)의 「일성월심 앱」 칸.
// 이 회원의 앱 상태(앱 계정이 있는지, 등록된 교재, 미리 등록해 둔 것)를 보여 주고, 앱 교재를 미리 등록하거나 취소한다.
//
// 앱 회원 화면(일성월심 앱 › 앱 회원)의 [교재 직접 등록]은 앱에 한 번이라도 로그인한 회원에게만 쓸 수 있다.
// 아직 로그인하지 않은 회원은 수북 회원 목록에만 있으므로 여기서 등록해 둔다 — 그 회원이 수북 계정으로 앱에
// 로그인하면 교재가 등록된다(앱 저장소 docs/adr/0038). 이미 앱을 쓰는 회원이면 같은 버튼이 그 자리에서 등록한다.
//
// 읽는 곳이 둘이다: 앱 서버의 관리 API(직원 로그인 토큰으로 직접 부른다, lib/ilseongAdminClient.js)와
// 수북 DB의 get_admin_member_login_state(이 회원이 앱에 로그인할 수 있는 상태인지).

const ACTIONS = {
  pregrant: {
    button: "앱 교재 미리 등록",
    method: "POST",
    done: "앱 교재를 미리 등록했어요",
    confirm: {
      title: "이 회원에게 앱 교재를 미리 등록할까요?",
      message:
        "이 회원이 수북 계정으로 일성월심 앱에 로그인하면 그 상품의 교재가 모두 등록돼요. 수북에서 구매한 회원은 자동으로 등록되니, 구매 없이 열어 줄 때만 써 주세요.\n로그인하기 전까지는 여기서 취소할 수 있어요.",
      confirm: "미리 등록",
    },
  },
  grant: {
    button: "앱 교재 등록",
    method: "POST",
    done: "앱 교재를 등록했어요",
    confirm: {
      title: "이 회원에게 앱 교재를 등록할까요?",
      message:
        "이미 앱을 쓰는 회원이라, 그 상품의 교재가 바로 이 회원의 책장에 등록돼요. 수북에서 구매한 회원은 자동으로 등록되니, 구매 없이 열어 줄 때만 써 주세요.\n등록한 뒤에는 일성월심 앱 › 앱 회원 화면에서 다시 거둘 수 있어요.",
      confirm: "등록",
    },
  },
  cancel: {
    button: "미리 등록 취소",
    method: "DELETE",
    done: "미리 등록을 취소했어요",
    confirm: {
      title: "미리 등록을 취소할까요?",
      message: "취소하면 이 회원이 앱에 로그인해도 교재가 등록되지 않아요. 필요하면 다시 미리 등록할 수 있어요.",
      confirm: "미리 등록 취소",
      cancel: "닫기",
      danger: true,
    },
  },
};

const DT_CLASS = "font-bold text-slate-400";
const DD_CLASS = "min-w-0 font-semibold text-slate-900";

export default function MemberAppSection({ memberId }) {
  if (!memberId) return null;
  return (
    <IlseongFeedbackProvider>
      <Panel key={memberId} memberId={memberId} />
    </IlseongFeedbackProvider>
  );
}

/** 이 회원이 수북 계정으로 앱에 로그인할 수 있는 상태인지. 읽는 중이면 undefined, 읽지 못했으면 null. */
function useLoginState(memberId) {
  const [state, setState] = useState(undefined);
  useEffect(() => {
    let cancelled = false;
    setState(undefined);
    (async () => {
      const { data, error } = await supabase.rpc("get_admin_member_login_state", { p_user_id: memberId });
      if (!cancelled) setState(error || !data ? null : data);
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId]);
  return state;
}

function Panel({ memberId }) {
  const { confirm, toast } = useIlseongFeedback();
  const path = `/api/admin/subook-members/${memberId}`;
  const app = useIlseongData(path);
  const login = useLoginState(memberId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const data = app.data;
  const panel = memberAppPanel(login, data);
  const action = panel.action ? ACTIONS[panel.action] : null;
  // 앱 상품이 여럿이면 어느 상품인지 고른다. 고르는 창: { kind: "pregrant" | "grant" | "cancel" }
  const choices = memberAppProducts(data);
  const extra = memberAppExtraAction(login, data);
  const [picking, setPicking] = useState(null);

  /** kind의 일을 한다. productCode가 없으면 서버가 하나뿐인 상품으로(취소는 기다리는 것 모두) 처리한다. */
  const send = async (kind, productCode) => {
    const doing = ACTIONS[kind];
    setPicking(null);
    setBusy(true);
    setError(null);
    try {
      const next = doing.method === "DELETE"
        ? await ilseongAdmin.request("DELETE", `${path}/books${productCode ? `?product=${encodeURIComponent(productCode)}` : ""}`)
        : await ilseongAdmin.request("POST", `${path}/books`, productCode ? { productCode } : {});
      app.setData(next);
      toast(doing.done);
    } catch (requestError) {
      setError(requestError);
      // 그 사이에 회원이 로그인했거나 다른 직원이 먼저 눌렀을 수 있다: 지금 상태를 다시 읽어 보여 준다
      void app.reload({ quiet: true });
    } finally {
      setBusy(false);
    }
  };

  const run = async (kind = panel.action) => {
    if (!kind || busy) return;
    const needsPick = kind === "cancel" ? choices.waiting.length > 1 : choices.many;
    if (needsPick) {
      setPicking({ kind });
      return;
    }
    if (!(await confirm(ACTIONS[kind].confirm))) return;
    await send(kind, kind === "cancel" ? choices.waiting[0]?.code : choices.grantable[0]?.code);
  };

  const history = (data?.grants ?? []).filter((grant) => grant.state !== "WAITING");
  const pickList = picking?.kind === "cancel"
    ? choices.waiting.map((product) => ({ code: product.code, name: product.name }))
    : (data?.products ?? []).map((product) => ({
        code: product.code,
        name: product.name,
        disabled: product.ownsAll || Boolean(product.waiting),
        note: product.ownsAll ? "이미 모두 등록돼 있어요" : product.waiting ? "미리 등록해 뒀어요" : null,
      }));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-sm font-bold text-slate-900">일성월심 앱</h4>
        {action ? (
          <span className="flex flex-wrap gap-2">
            {extra ? (
              <button className="btn-secondary !w-auto !px-3 !py-1.5 text-xs" disabled={busy} onClick={() => void run(extra)} type="button">
                다른 상품 등록
              </button>
            ) : null}
            <button
              className={`${panel.action === "cancel" ? "btn-danger-weak" : "btn-primary"} !w-auto !px-3 !py-1.5 text-xs`}
              disabled={busy}
              onClick={() => void run()}
              type="button"
            >
              {busy ? <BusyText>처리 중...</BusyText> : action.button}
            </button>
          </span>
        ) : data?.ownsAll ? (
          <Badge tone="green">교재 등록됨</Badge>
        ) : null}
      </div>
      {picking ? (
        <ProductPickerDialog
          confirmLabel={ACTIONS[picking.kind].confirm.confirm}
          danger={picking.kind === "cancel"}
          message={ACTIONS[picking.kind].confirm.message}
          onClose={() => setPicking(null)}
          onPick={(code) => void send(picking.kind, code)}
          open
          products={pickList}
          title={picking.kind === "cancel" ? "어느 상품의 미리 등록을 취소할까요?" : "어느 상품의 교재를 등록할까요?"}
        />
      ) : null}

      <div className="rounded-xl border border-slate-200 p-4 text-sm">
        {!data ? <ErrorNote error={app.error} onRetry={() => void app.reload()} /> : null}
        {app.loading && !data ? <p className="py-3 text-center text-slate-400"><InlineLoading label="앱 상태를 불러오는 중..." /></p> : null}
        {data ? (
          <>
            <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2">
              <dt className={DT_CLASS}>앱 계정</dt>
              <dd className={DD_CLASS}>
                {data.user ? (
                  <>
                    <Link className="text-brand hover:underline" to={ilseongPath("users", data.user.id)}>
                      앱 회원 {data.user.id}번 보기
                    </Link>
                    <span className="font-normal text-slate-500"> · {formatDate(data.user.createdAt)}부터</span>
                  </>
                ) : (
                  "아직 앱에 로그인한 적이 없어요"
                )}
              </dd>
              <dt className={DT_CLASS}>등록된 교재</dt>
              <dd className={DD_CLASS}>
                {data.books.length > 0 ? (
                  <BookList books={data.books} />
                ) : data.waiting ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <Badge tone="blue">미리 등록해 둠</Badge>
                    <span className="font-normal text-slate-600">
                      {choices.many ? `${choices.waiting.map((product) => product.name).join(", ")} · ` : ""}이 회원이 수북 계정으로 앱에 로그인하면 등록돼요
                    </span>
                  </span>
                ) : (
                  <span className="font-normal text-slate-400">없음</span>
                )}
              </dd>
              {data.waiting ? (
                <>
                  <dt className={DT_CLASS}>등록한 사람</dt>
                  <dd className={DD_CLASS}>
                    {grantCreator(data.waiting)}
                    <span className="font-normal text-slate-500"> · {formatDateTime(data.waiting.createdAt)}</span>
                  </dd>
                </>
              ) : null}
            </dl>

            {panel.action === "pregrant" ? (
              <p className="mt-3 leading-relaxed text-slate-500">
                미리 등록해 두면, 이 회원이 수북 계정으로 앱에 로그인할 때 그 상품의 교재가 모두 등록돼요.
              </p>
            ) : null}
            {panel.block ? (
              <p className="mt-3 rounded-xl bg-slate-100 px-4 py-3 leading-relaxed text-slate-700">
                {panel.block.text}
                {panel.block.mergedInto ? (
                  <>
                    {" "}
                    <Link className="font-semibold text-brand hover:underline" to={`/admin/members?member=${panel.block.mergedInto}`}>
                      합친 계정 보기
                    </Link>
                  </>
                ) : null}
              </p>
            ) : null}
            {panel.notice ? <WarnNote className="mt-3">{panel.notice}</WarnNote> : null}
            <ErrorNote className="mt-3" error={error} />

            {history.length > 0 ? (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="text-xs font-bold text-slate-500">지난 등록</p>
                <ul className="mt-2 space-y-1.5 text-[13px] text-slate-600">
                  {history.map((grant) => {
                    const state = grantState(grant.state);
                    return (
                      <li className="flex flex-wrap items-center gap-x-2 gap-y-1" key={grant.id}>
                        <Badge tone={state.tone}>{state.label}</Badge>
                        <span>
                          {choices.many && grant.productName ? `${grant.productName} · ` : ""}{grantCreator(grant)} · {formatDateTime(grant.createdAt)} 등록
                          {grant.state === "CANCELLED"
                            ? ` → ${grant.cancelledByName || "직원"} · ${formatDateTime(grant.cancelledAt)} 취소`
                            : grant.claimedAt
                              ? ` → ${formatDateTime(grant.claimedAt)} 회원 책장에 등록`
                              : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
