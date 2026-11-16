import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@shared-supabase/adminSupabaseClient";
import AdminPageTabs from "../components/AdminPageTabs";
import AdminShell from "../components/AdminShell";
import { IlseongSalesPanel } from "./AdminIlseongAppPage";

// 일성월심 학습 앱 관리 — 수북 관리자 안에서 앱 관리까지 한다(따로 로그인하지 않는다).
//
// "수북 판매 연결" 보기는 이 관리자의 화면이고, 나머지 보기는 앱 서버가 내주는 관리 화면을 끼워 보여 준다.
// 끼운 화면이 입장권을 달라고 하면(postMessage) 관리자 API에서 1회용 입장권을 받아 건넨다.
// 보기를 바꾸면 끼운 화면의 주소(#/codes 등)만 바뀐다(다시 불러오지 않는다).
// 주고받는 말은 앱 저장소(ilseong-app)의 admin/src/embed.ts, docs/adr/0034 참고.

// ?view= 값 → 끼운 화면 주소(#/…). sales만 이 관리자의 화면이다.
const VIEWS = [
  { key: "", label: "요약", inner: "" },
  { key: "codes", label: "교재 코드", inner: "codes" },
  { key: "users", label: "앱 회원", inner: "users" },
  { key: "books", label: "교재 쪽 설정", inner: "books" },
  { key: "app-config", label: "앱 설정", inner: "app" },
  { key: "actions", label: "관리 기록", inner: "actions" },
  { key: "sales", label: "수북 판매 연결", inner: null },
];

const viewPath = (key) => (key ? `/admin/ilseong?view=${key}` : "/admin/ilseong");

async function callIlseongApi({ method = "POST", payload = null }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("로그인이 필요합니다.");
  const url = method === "GET" ? "/api/admin/ilseong-app-codes?action=overview" : "/api/admin/ilseong-app-codes";
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
    },
    body: method === "GET" ? undefined : JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.success === false) {
    throw new Error(result?.error || `요청에 실패했습니다. (${response.status})`);
  }
  return result;
}

export default function AdminIlseongConsolePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const requested = searchParams.get("view") || "";
  const view = VIEWS.find((entry) => entry.key === requested) ?? VIEWS[0];
  const embedded = view.inner !== null;

  const frameRef = useRef(null);
  const [adminUrl, setAdminUrl] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | not-configured | error
  const [errorText, setErrorText] = useState("");
  const [frameHeight, setFrameHeight] = useState(640);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const overview = await callIlseongApi({ method: "GET" });
      if (!overview.configured || !overview.adminUrl) {
        setState("not-configured");
        return;
      }
      setAdminUrl(overview.adminUrl);
      setState("ready");
    } catch (error) {
      setErrorText(error?.message || "앱 관리 화면을 열지 못했습니다.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const adminOrigin = useMemo(() => {
    try {
      return adminUrl ? new URL(adminUrl).origin : null;
    } catch {
      return null;
    }
  }, [adminUrl]);

  // 끼운 화면과 주고받기: 입장권 요청 → 받아서 건넨다 / 끼운 화면 안에서 다른 보기로 갔으면 버튼 표시를 맞춘다
  useEffect(() => {
    if (!adminOrigin) return undefined;
    const onMessage = async (event) => {
      const frame = frameRef.current;
      if (!frame || event.origin !== adminOrigin || event.source !== frame.contentWindow) return;
      const type = event.data?.type;
      if (type === "ilseong-admin:route") {
        const first = String(event.data.path || "").split("/")[0];
        const target = VIEWS.find((entry) => entry.inner === first);
        const now = new URLSearchParams(window.location.search).get("view") || "";
        if (target && target.key !== now) navigate(viewPath(target.key), { replace: true });
        return;
      }
      if (type !== "ilseong-admin:need-ticket") return;
      try {
        const result = await callIlseongApi({ payload: { action: "admin_ticket" } });
        if (!result.ticket) throw new Error("입장권을 받지 못했습니다.");
        frame.contentWindow?.postMessage({ type: "ilseong-admin:ticket", ticket: result.ticket }, adminOrigin);
      } catch (error) {
        frame.contentWindow?.postMessage(
          { type: "ilseong-admin:ticket-error", message: error?.message || "로그인 정보를 받지 못했습니다." },
          adminOrigin,
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [adminOrigin, navigate]);

  // 끼운 화면이 창 높이를 꽉 채우게 한다(스크롤은 그 안에서만. 그래야 그 안의 확인 창이 화면 가운데에 뜬다)
  useLayoutEffect(() => {
    if (state !== "ready" || !embedded) return undefined;
    const fit = () => {
      const frame = frameRef.current;
      if (!frame) return;
      const top = frame.getBoundingClientRect().top + window.scrollY;
      setFrameHeight(Math.max(480, Math.floor(window.innerHeight - top - 16)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [state, embedded]);

  const tabs = VIEWS.map((entry) => ({ key: entry.key, label: entry.label, to: viewPath(entry.key) }));

  return (
    <AdminShell activeModule="ilseong-app" title="일성월심 앱">
      <div className="flex flex-col gap-4">
        <AdminPageTabs activeKey={view.key} tabs={tabs} />

        {!embedded ? <IlseongSalesPanel /> : null}

        {embedded && state === "loading" ? <p className="text-sm text-slate-500">앱 관리 화면을 여는 중입니다.</p> : null}
        {embedded && state === "not-configured" ? (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            앱 서버 연결 설정(ILSEONG_API_BASE_URL·ILSEONG_PARTNER_SECRET)이 없어 앱 관리 화면을 열 수 없습니다.
          </p>
        ) : null}
        {embedded && state === "error" ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="notice-error" role="alert">{errorText}</p>
            <button className="btn-secondary" onClick={() => void load()} type="button">다시 열기</button>
          </div>
        ) : null}
        {embedded && state === "ready" && adminUrl ? (
          <iframe
            allow="clipboard-write"
            className="block w-full border-0 bg-transparent"
            ref={frameRef}
            src={`${adminUrl}#/${view.inner}`}
            style={{ height: frameHeight }}
            title="일성월심 학습 앱 관리"
          />
        ) : null}
      </div>
    </AdminShell>
  );
}
