import { Link } from "react-router-dom";
import { useIlseongData } from "../../lib/ilseongAdmin";
import { actionLabel, actionTarget, formatDateTime } from "../../lib/ilseongFormat";
import { EmptyNote, ErrorNote, LoadingNote, SMALL_BUTTON, Section, TABLE_CLASS, TD_CLASS, TH_CLASS, UserLink } from "./IlseongUi";

// 관리 기록 — 앱 서버에서 관리자가 바꾼 것(교재 직접 등록·미리 등록·코드 폐기, 기기 해제, 교재 쪽 설정, 앱 설정). 최근 100개.
// 수북 관리자의 「작업 이력」과는 다른 기록이다: 이쪽은 앱 서버가 남긴다.

export default function IlseongActions() {
  const actions = useIlseongData("/api/admin/actions");
  const list = actions.data;

  return (
    <Section
      right={
        <button className={`btn-secondary ${SMALL_BUTTON}`} disabled={actions.loading} onClick={() => void actions.reload()} type="button">
          새로고침
        </button>
      }
      sub="교재 직접 등록·미리 등록·코드 폐기, 기기 해제, 교재 쪽 설정, 앱 설정을 누가 언제 했는지 남아요. 최근 100개가 보여요."
      title="앱 관리 기록"
    >
      {!list ? <ErrorNote error={actions.error} onRetry={() => void actions.reload()} /> : null}
      {actions.loading && !list ? <LoadingNote /> : null}
      {list && list.length === 0 ? <EmptyNote>아직 기록이 없어요.</EmptyNote> : null}
      {list && list.length > 0 ? (
        <div className="overflow-x-auto">
          <table className={`${TABLE_CLASS} min-w-[760px]`}>
            <thead>
              <tr>
                <th className={TH_CLASS}>때</th>
                <th className={TH_CLASS}>한 일</th>
                <th className={TH_CLASS}>대상</th>
                <th className={TH_CLASS}>내용</th>
                <th className={TH_CLASS}>관리자</th>
              </tr>
            </thead>
            <tbody>
              {list.map((entry) => {
                const target = actionTarget(entry.target);
                return (
                  <tr key={entry.id}>
                    <td className={`${TD_CLASS} whitespace-nowrap text-[13px] tabular-nums text-slate-500`}>{formatDateTime(entry.createdAt)}</td>
                    <td className={`${TD_CLASS} whitespace-nowrap font-semibold`}>{actionLabel(entry.action)}</td>
                    <td className={`${TD_CLASS} whitespace-nowrap text-[13px]`}>
                      {target.userId ? (
                        <UserLink userId={target.userId}>{target.text}</UserLink>
                      ) : target.memberRef ? (
                        <Link className="font-semibold text-brand hover:underline" to={`/admin/members?member=${target.memberRef}`}>{target.text}</Link>
                      ) : (
                        target.text
                      )}
                    </td>
                    <td className={`${TD_CLASS} text-[13px] text-slate-600`}>{entry.detail ?? ""}</td>
                    <td className={`${TD_CLASS} !pr-0 text-[13px] text-slate-600`}>{entry.adminName ?? `${entry.adminId}번`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </Section>
  );
}
