import { Navigate, useSearchParams } from "react-router-dom";
import AdminPageTabs from "../components/AdminPageTabs";
import AdminShell from "../components/AdminShell";
import IlseongActions from "../components/ilseong/IlseongActions";
import IlseongAppConfig from "../components/ilseong/IlseongAppConfig";
import IlseongHome from "../components/ilseong/IlseongHome";
import IlseongReports from "../components/ilseong/IlseongReports";
import IlseongSeries from "../components/ilseong/IlseongSeries";
import IlseongUsers from "../components/ilseong/IlseongUsers";
import { IlseongFeedbackProvider, ilseongPath } from "../components/ilseong/IlseongUi";

// 일성월심 학습 앱 관리 — 수북 관리자 안에서 앱 관리까지 한다(따로 로그인하지 않는다).
//
// 화면 안 보기(?view=)로 나뉜다. 하려는 일 순서로 놓았다(앱 저장소 docs/adr/0041):
//   홈          지금 할 일과 바로 가기
//   학습지      학습지 하나를 만들어 팔기까지 네 단계(?view=books&series=번호, 새로 만들기는 series=new)
//   학생·문의   학생 찾기(?view=users&id=회원번호), 주문으로 확인하기, 문의마다의 안내
//   오류 신고   학생이 앱에서 알려 온 교재 오류(오탈자). 확인하고 처리함으로 표시한다
//   앱 설정     공지·점검, 환불과 앱 받는 곳, 잘 쓰지 않는 설정
//   기록        누가 무엇을 바꿨는지
// 앱 서버의 관리 API를 이 화면이 직접 부른다(직원 로그인은 lib/ilseongAdminClient.js, 앱 저장소 docs/adr/0037).
// 판매 상품과 판매 시작·중지만 수북 DB의 일이다(lib/ilseongStore.js).
//
// 예전의 "상품·판매" 보기(?view=sales)는 학습지의 3·4단계와 학생·문의로 나뉘어 들어갔다. 그 주소로 오면 학습지를 보여 준다.

const VIEWS = [
  { key: "", label: "홈" },
  { key: "books", label: "학습지" },
  { key: "users", label: "학생·문의" },
  { key: "reports", label: "오류 신고" },
  { key: "app-config", label: "앱 설정" },
  { key: "actions", label: "기록" },
];

function parseId(value) {
  return /^\d{1,18}$/.test(value || "") ? Number(value) : null;
}

export default function AdminIlseongConsolePage() {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get("view") || "";
  if (requested === "sales") return <Navigate replace to={ilseongPath("books")} />;
  const view = VIEWS.find((entry) => entry.key === requested) ?? VIEWS[0];
  const tabs = VIEWS.map((entry) => ({ key: entry.key, label: entry.label, to: ilseongPath(entry.key) }));

  let content;
  if (view.key === "users") content = <IlseongUsers userId={parseId(searchParams.get("id"))} />;
  else if (view.key === "books") {
    const series = searchParams.get("series");
    content = <IlseongSeries seriesId={series === "new" ? "new" : parseId(series)} />;
  } else if (view.key === "reports") content = <IlseongReports />;
  else if (view.key === "app-config") content = <IlseongAppConfig />;
  else if (view.key === "actions") content = <IlseongActions />;
  else content = <IlseongHome />;

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
