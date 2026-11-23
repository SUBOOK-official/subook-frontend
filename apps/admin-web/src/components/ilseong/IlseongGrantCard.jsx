import { useState } from "react";
import { ilseongAdmin } from "../../lib/ilseongAdmin";
import { CODE_STATUS, formatDateTime } from "../../lib/ilseongFormat";
import { Badge, BookList, ErrorNote, Facts, SMALL_BUTTON, UserLink, useIlseongFeedback } from "./IlseongUi";

/**
 * 회원에게 교재가 등록된 기록 한 건(구매로 자동 등록된 것, 직접 등록한 것)과 거두기 버튼.
 * 앱 회원 상세의 "등록한 교재"에서 쓴다.
 *
 * 앱 서버는 등록 한 건을 코드 하나로 적어 둔다(구매·직접 등록과 교재 권한을 잇는 안쪽 기록).
 * 원문 코드는 어디에도 보이지 않고, 앱에도 코드를 넣는 곳이 없다(앱 저장소 docs/adr/0036).
 * onChanged() — 거둔 뒤 둘레 목록을 다시 읽으라는 신호.
 */
export default function IlseongGrantCard({ code, onChanged }) {
  const { confirm, toast } = useIlseongFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const redeemed = code.status === "REDEEMED";

  const revoke = async () => {
    const ok = await confirm(
      redeemed
        ? {
            title: "교재 권한을 거둘까요?",
            message: `${code.redeemedByName ?? "이름 없음"}(${code.redeemedBy}번) 학생이 이 등록으로 연 교재를 더는 볼 수 없어요.\n같은 교재를 다른 등록으로도 가졌다면 그 교재는 그대로예요. 필기와 학습 기록은 남아 있어요.`,
            confirm: "거두기",
            danger: true,
          }
        : { title: "이 등록을 없앨까요?", message: "아직 회원의 책장에 들어가지 않은 등록이에요. 없애면 로그인해도 교재가 등록되지 않아요.", confirm: "없애기", danger: true },
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await ilseongAdmin.request("POST", `/api/admin/codes/${code.id}/revoke`, { revokeAccess: redeemed });
      toast(redeemed ? "교재 권한을 거뒀어요" : "등록을 없앴어요");
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
          <span className="text-sm font-bold text-slate-900">{code.productName ?? code.batchLabel}</span>
          {code.productName ? <span className="text-[13px] text-slate-400">{code.batchLabel}</span> : null}
        </div>
        {code.status !== "REVOKED" ? (
          <button className={`btn-danger-weak ${SMALL_BUTTON}`} disabled={busy} onClick={() => void revoke()} type="button">
            {redeemed ? "교재 권한 거두기" : "등록 없애기"}
          </button>
        ) : null}
      </div>
      <Facts
        rows={[
          ["여는 교재", <BookList books={code.books} key="books" />],
          ["등록된 학생", code.redeemedBy !== null && code.redeemedBy !== undefined
            ? <UserLink key="user" userId={code.redeemedBy}>{code.redeemedByName ?? "이름 없음"} · {code.redeemedBy}번</UserLink>
            : null],
          ["등록된 때", code.redeemedBy !== null && code.redeemedBy !== undefined ? formatDateTime(code.redeemedAt) : null],
          ["판매처 주문", code.order
            ? `${code.order.partner === "subook" ? "수북" : code.order.partner} 주문 ${code.order.orderRef} · ${code.order.lineRef}번째 줄`
            : null],
        ]}
      />
      <ErrorNote error={error} />
    </div>
  );
}
