import { useSearchParams } from "react-router-dom";
import AdminPageTabs from "../components/AdminPageTabs";
import AdminShell from "../components/AdminShell";
import IlseongActions from "../components/ilseong/IlseongActions";
import IlseongAppConfig from "../components/ilseong/IlseongAppConfig";
import IlseongBooks from "../components/ilseong/IlseongBooks";
import IlseongOverview from "../components/ilseong/IlseongOverview";
import IlseongUsers from "../components/ilseong/IlseongUsers";
import { IlseongFeedbackProvider, ilseongPath } from "../components/ilseong/IlseongUi";
import { IlseongSalesPanel } from "./AdminIlseongAppPage";

// 일성월심 학습 앱 관리 — 수북 관리자 안에서 앱 관리까지 한다(따로 로그인하지 않는다).
//
// 화면 안 보기(?view=)로 나뉜다. 앱 서버의 관리 API를 이 화면이 직접 부르고(직원 로그인은
// lib/ilseongAdminClient.js, 앱 저장소 docs/adr/0037), "상품·판매"만 수북 DB의 일도 함께 한다.
// 앱 회원 상세는 ?view=users&id=회원번호.
//
// 예전의 "교재 코드" 보기는 없앴다: 앱에 코드를 넣는 곳이 없고 원문 코드를 아는 사람도 없다(앱 저장소 docs/adr/0036, 0039).
// 등록을 거두는 일은 앱 회원 상세에서 한다. 예전 주소(?view=codes)로 오면 요약을 보여 준다.

const VIEWS = [
  { key: "", label: "요약" },
  { key: "users", label: "앱 회원" },
  { key: "books", label: "학습지·교재" },
  { key: "sales", label: "상품·판매" },
  { key: "app-config", label: "앱 설정" },
  { key: "actions", label: "관리 기록" },
];

function parseUserId(value) {
  return /^\d{1,18}$/.test(value || "") ? Number(value) : null;
}

export default function AdminIlseongConsolePage() {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get("view") || "";
  const view = VIEWS.find((entry) => entry.key === requested) ?? VIEWS[0];
  const tabs = VIEWS.map((entry) => ({ key: entry.key, label: entry.label, to: ilseongPath(entry.key) }));

  let content;
  if (view.key === "users") content = <IlseongUsers userId={parseUserId(searchParams.get("id"))} />;
  else if (view.key === "books") content = <IlseongBooks />;
  else if (view.key === "app-config") content = <IlseongAppConfig />;
  else if (view.key === "actions") content = <IlseongActions />;
  else if (view.key === "sales") content = <IlseongSalesPanel />;
  else content = <IlseongOverview />;

  return (
    <AdminShell activeModule="ilseong-app" title="일성월심 앱">
      <IlseongFeedbackProvider>
        <div className="space-y-4">
          <div><AdminPageTabs activeKey={view.key} tabs={tabs} /></div>
          <div className="min-w-0">{content}</div>
        </div>
      </IlseongFeedbackProvider>
    </AdminShell>
  );
}
