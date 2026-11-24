import { useState } from "react";
import { ilseongAdmin, useIlseongData } from "../../lib/ilseongAdmin";
import { formatDateTime } from "../../lib/ilseongFormat";
import { Badge, EmptyNote, ErrorNote, LoadingNote, SMALL_BUTTON, Section, TABLE_CLASS, TD_CLASS, TH_CLASS, UserLink, useIlseongFeedback } from "./IlseongUi";

// 교재 오류 신고 — 학생이 앱에서 교재를 보다가 [이 쪽 오류 알리기]로 보낸 것(앱 저장소 docs/adr/0051).
// 교재와 쪽은 앱이 붙여 보낸다. 확인해서 고쳤거나 고칠 것이 아니면 [처리함]으로 표시한다. 표시는 되돌릴 수 있다.
// 같은 신고가 서버 알림(슬랙)으로도 온다.

export default function IlseongReports() {
  const [openOnly, setOpenOnly] = useState(true);
  const reports = useIlseongData(`/api/admin/reports?open=${openOnly}`, { keepPrevious: true });
  const { toast } = useIlseongFeedback();
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const list = reports.data;

  const mark = async (report, done) => {
    setBusyId(report.id);
    setError(null);
    try {
      await ilseongAdmin.request("POST", `/api/admin/reports/${report.id}/done`, { done });
      toast(done ? "처리함으로 표시했어요" : "남은 신고로 되돌렸어요");
      await reports.reload({ quiet: true });
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Section
      right={
        <div className="flex flex-wrap gap-2">
          <button className={`btn-secondary ${SMALL_BUTTON}`} onClick={() => setOpenOnly((value) => !value)} type="button">
            {openOnly ? "처리한 것도 보기" : "남은 것만 보기"}
          </button>
          <button className={`btn-secondary ${SMALL_BUTTON}`} disabled={reports.loading} onClick={() => void reports.reload()} type="button">
            새로고침
          </button>
        </div>
      }
      sub="학생이 앱에서 교재를 보다가 [이 쪽 오류 알리기]로 보낸 것이에요. 교재의 그 쪽을 확인하고, 고쳤거나 고칠 것이 아니면 [처리함]을 눌러 주세요. 최근 300건까지 보여요."
      title={openOnly ? "교재 오류 신고 — 남은 것" : "교재 오류 신고 — 전체"}
    >
      <ErrorNote className="mb-3" error={error} />
      {!list ? <ErrorNote error={reports.error} onRetry={() => void reports.reload()} /> : null}
      {reports.loading && !list ? <LoadingNote /> : null}
      {list && list.length === 0 ? <EmptyNote>{openOnly ? "남은 신고가 없어요." : "아직 신고가 없어요."}</EmptyNote> : null}
      {list && list.length > 0 ? (
        <div className="overflow-x-auto">
          <table className={`${TABLE_CLASS} min-w-[820px]`}>
            <thead>
              <tr>
                <th className={TH_CLASS}>보낸 때</th>
                <th className={TH_CLASS}>교재 · 쪽</th>
                <th className={TH_CLASS}>학생이 적은 글</th>
                <th className={TH_CLASS}>학생</th>
                <th className={TH_CLASS} />
              </tr>
            </thead>
            <tbody>
              {list.map((report) => (
                <tr key={report.id}>
                  <td className={`${TD_CLASS} whitespace-nowrap align-top text-[13px] tabular-nums text-slate-500`}>{formatDateTime(report.createdAt)}</td>
                  <td className={`${TD_CLASS} whitespace-nowrap align-top font-semibold`}>
                    {report.book} · {report.page}쪽
                  </td>
                  <td className={`${TD_CLASS} align-top`}>
                    <p className="max-w-[420px] whitespace-pre-line break-words leading-relaxed">{report.text}</p>
                  </td>
                  <td className={`${TD_CLASS} whitespace-nowrap align-top text-[13px]`}>
                    <UserLink userId={report.userId}>{report.userName || `${report.userId}번`}</UserLink>
                    {report.app ? <p className="mt-0.5 text-xs text-slate-400">앱 {report.app}</p> : null}
                  </td>
                  <td className={`${TD_CLASS} whitespace-nowrap !pr-0 text-right align-top`}>
                    {report.doneAt ? (
                      <div className="flex items-center justify-end gap-2">
                        <Badge tone="green">처리함</Badge>
                        <button className={`btn-secondary ${SMALL_BUTTON}`} disabled={busyId === report.id} onClick={() => void mark(report, false)} type="button">
                          되돌리기
                        </button>
                      </div>
                    ) : (
                      <button className={`btn-primary !w-auto ${SMALL_BUTTON}`} disabled={busyId === report.id} onClick={() => void mark(report, true)} type="button">
                        처리함
                      </button>
                    )}
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
