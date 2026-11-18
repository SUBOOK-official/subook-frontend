import { useEffect, useState } from "react";
import { ilseongAdmin, useIlseongData } from "../../lib/ilseongAdmin";
import { CODE_STATUS, formatCount, formatDate, formatDateTime } from "../../lib/ilseongFormat";
import {
  Badge,
  BookList,
  EmptyNote,
  ErrorNote,
  FIELD_CLASS,
  Facts,
  LoadingNote,
  SMALL_BUTTON,
  Section,
  TABLE_CLASS,
  TD_CLASS,
  TH_CLASS,
  UserLink,
  useIlseongFeedback,
} from "./IlseongUi";

// 교재 코드 — 이미 나간 코드를 찾아 상태를 보고 폐기한다.
// 코드는 구매·직접 등록과 교재 권한을 잇는 안쪽 기록이라, 원문은 어느 화면에도 나오지 않는다.

export default function IlseongCodes() {
  // 찾은 코드를 폐기하면 아래 묶음 목록의 숫자도 바뀐다
  const [revoked, setRevoked] = useState(0);
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-slate-500">
        앱에는 코드를 넣는 곳이 없어요. 수북에서 구매한 회원은 로그인하면 자동으로 등록되고, 구매 없이 열어 줄 때는 앱 회원 화면에서 직접 등록해요.
        여기서는 이미 나간 코드를 찾아 상태를 보고 폐기해요.
      </p>
      <Lookup onRevoked={() => setRevoked((count) => count + 1)} />
      <BatchList reloadSignal={revoked} />
    </div>
  );
}

function Lookup({ onRevoked }) {
  const [input, setInput] = useState("");
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    const code = input.trim();
    if (!code || busy) return;
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      // 원문 코드를 주소에 넣지 않으려고 본문으로 보낸다(접속 기록에 남지 않게)
      setFound(await ilseongAdmin.request("POST", "/api/admin/codes/lookup", { code }));
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section sub="하이픈·띄어쓰기·대소문자는 상관없어요." title="코드 찾기">
      <form className="flex flex-wrap gap-2" onSubmit={submit}>
        <input
          aria-label="교재 코드"
          autoComplete="off"
          className={`${FIELD_CLASS} min-w-0 flex-1 basis-64 font-mono tracking-wide`}
          onChange={(event) => setInput(event.target.value)}
          placeholder="예: ABCD-EFGH-JKLM"
          spellCheck={false}
          value={input}
        />
        <button className="btn-primary !w-auto !px-5 !py-2" disabled={!input.trim() || busy} type="submit">찾기</button>
      </form>
      <ErrorNote className="mt-4" error={error} />
      {found ? <div className="mt-5"><CodeCard code={found} onChange={setFound} onChanged={onRevoked} /></div> : null}
    </Section>
  );
}

/**
 * 코드 하나의 상태와 폐기 버튼. 앱 회원 상세의 "등록한 교재"에서도 쓴다.
 * onChange(바뀐 코드) — 폐기한 뒤 서버가 돌려준 값. onChanged() — 둘레 목록을 다시 읽으라는 신호.
 */
export function CodeCard({ code, onChange, onChanged }) {
  const { confirm, toast } = useIlseongFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const redeemed = code.status === "REDEEMED";

  const revoke = async () => {
    const ok = await confirm(
      redeemed
        ? {
            title: "교재 권한까지 거둘까요?",
            message: `${code.redeemedByName ?? "이름 없음"}(${code.redeemedBy}번) 학생이 이 코드로 연 교재를 더는 볼 수 없어요.\n같은 교재를 다른 코드로도 가졌다면 그 교재는 그대로예요.`,
            confirm: "거두고 폐기",
            danger: true,
          }
        : { title: "이 코드를 폐기할까요?", message: "폐기한 코드는 다시 쓸 수 없어요.", confirm: "폐기", danger: true },
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const next = await ilseongAdmin.request("POST", `/api/admin/codes/${code.id}/revoke`, { revokeAccess: redeemed });
      toast("코드를 폐기했어요");
      onChange?.(next);
      onChanged?.();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  };

  const status = CODE_STATUS[code.status] ?? { label: code.status, tone: "grey" };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          <span className="text-sm font-bold text-slate-900">{code.batchLabel}</span>
          <span className="text-[13px] text-slate-400">묶음 {code.batchId}번</span>
        </div>
        {code.status !== "REVOKED" ? (
          <button className={`btn-danger-weak ${SMALL_BUTTON}`} disabled={busy} onClick={() => void revoke()} type="button">
            {redeemed ? "교재 권한까지 거두고 폐기" : "폐기"}
          </button>
        ) : null}
      </div>
      <Facts
        rows={[
          ["여는 교재", <BookList books={code.books} key="books" />],
          ["등록한 학생", code.redeemedBy !== null && code.redeemedBy !== undefined
            ? <UserLink key="user" userId={code.redeemedBy}>{code.redeemedByName ?? "이름 없음"} · {code.redeemedBy}번</UserLink>
            : null],
          ["등록한 때", code.redeemedBy !== null && code.redeemedBy !== undefined ? formatDateTime(code.redeemedAt) : null],
          ["판매처 주문", code.order
            ? `${code.order.partner === "subook" ? "수북" : code.order.partner} 주문 ${code.order.orderRef} · ${code.order.lineRef}번째 줄`
            : null],
        ]}
      />
      <ErrorNote error={error} />
    </div>
  );
}

function BatchList({ reloadSignal }) {
  const { confirm, toast } = useIlseongFeedback();
  const batches = useIlseongData("/api/admin/code-batches");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { reload } = batches;

  useEffect(() => {
    if (reloadSignal) void reload({ quiet: true });
  }, [reloadSignal, reload]);

  const revoke = async (batch) => {
    const ok = await confirm({
      title: `등록 전 코드 ${formatCount(batch.issued)}개를 폐기할까요?`,
      message: `"${batch.label}" 묶음에서 아직 아무도 등록하지 않은 코드를 모두 폐기해요. 이미 등록한 학생은 그대로예요.\n인쇄물을 잃어버렸을 때 써요.`,
      confirm: "폐기",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const result = await ilseongAdmin.request("POST", `/api/admin/code-batches/${batch.id}/revoke-unredeemed`);
      toast(`등록 전 코드 ${formatCount(result.revoked)}개를 폐기했어요`);
      await batches.reload({ quiet: true });
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  };

  const list = batches.data;
  return (
    <Section sub="최근 200개까지 보여요." title="코드 묶음">
      <ErrorNote className="mb-3" error={error ?? (list ? null : batches.error)} onRetry={list ? undefined : () => void batches.reload()} />
      {batches.loading && !list ? <LoadingNote /> : null}
      {list && list.length === 0 ? <EmptyNote>아직 만든 코드가 없어요.</EmptyNote> : null}
      {list && list.length > 0 ? (
        <div className="overflow-x-auto">
          <table className={`${TABLE_CLASS} min-w-[920px]`}>
            <thead>
              <tr>
                <th className={TH_CLASS}>번호</th>
                <th className={TH_CLASS}>이름</th>
                <th className={TH_CLASS}>여는 교재</th>
                <th className={TH_CLASS}>만든 날</th>
                <th className={`${TH_CLASS} text-right`}>전체</th>
                <th className={`${TH_CLASS} text-right`}>등록 전</th>
                <th className={`${TH_CLASS} text-right`}>등록함</th>
                <th className={`${TH_CLASS} text-right`}>폐기</th>
                <th className={TH_CLASS} />
              </tr>
            </thead>
            <tbody>
              {list.map((batch) => (
                <tr key={batch.id}>
                  <td className={`${TD_CLASS} tabular-nums text-slate-400`}>{batch.id}</td>
                  <td className={TD_CLASS}>
                    <span className="mr-1.5">{batch.label}</span>
                    {batch.partner ? <Badge tone="orange">판매처</Badge> : null}
                  </td>
                  <td className={`${TD_CLASS} text-[13px]`}><BookList books={batch.books} /></td>
                  <td className={`${TD_CLASS} whitespace-nowrap text-[13px] text-slate-500`}>{formatDate(batch.createdAt)}</td>
                  <td className={`${TD_CLASS} text-right tabular-nums`}>{formatCount(batch.total)}</td>
                  <td className={`${TD_CLASS} text-right tabular-nums`}>{formatCount(batch.issued)}</td>
                  <td className={`${TD_CLASS} text-right tabular-nums`}>{formatCount(batch.redeemed)}</td>
                  <td className={`${TD_CLASS} text-right tabular-nums`}>{formatCount(batch.revoked)}</td>
                  <td className={`${TD_CLASS} !pr-0 text-right`}>
                    {/* 판매처(수북 주문) 묶음은 주문·환불 흐름이 맡는다. 여기서 한꺼번에 폐기하지 않는다 */}
                    {!batch.partner && batch.issued > 0 ? (
                      <button className={`btn-danger-weak whitespace-nowrap ${SMALL_BUTTON}`} disabled={busy} onClick={() => void revoke(batch)} type="button">
                        등록 전 코드 폐기
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Section>
  );
}
