import { useState } from "react";
import { Link } from "react-router-dom";
import AdminShell from "../components/AdminShell";

const workflows = [
  {
    name: "Meta 광고",
    to: "/admin/meta-ads",
    action: "광고 운영 열기",
    tasks: [
      "캠페인·광고세트·광고 조회",
      "예산·기간·대상 수정, 켜기·끄기",
      "소재 만들기·교체, 이미지 업로드",
      "초안 작성, 복사, 변경 이력",
    ],
    note: "현재 연결 권한은 광고 운영 화면에 표시됩니다. 관리 권한 연결 후 변경 기능을 사용할 수 있습니다.",
    outside: "사업자·계정 인증, 결제수단 변경, 정책 이의신청",
    url: "https://business.facebook.com/",
  },
  {
    name: "GA4·Meta·주문 실적",
    to: "/admin/performance",
    action: "성과 대시보드 열기",
    tasks: [
      "광고비와 실제 결제 실적 비교",
      "방문→장바구니→주문 흐름 확인",
      "캠페인별 성과, 기간 비교",
      "엑셀 보고서 다운로드",
    ],
    note: "주문 DB, GA, Meta의 집계 기준을 나눠 표시합니다.",
    outside: "GA 속성 접근권한·데이터 수집 설정",
    url: "https://analytics.google.com/",
  },
  {
    name: "CJ대한통운 수거",
    to: "/admin/pickups",
    action: "수거·검수 열기",
    tasks: [
      "수거 요청 조회·접수",
      "박스 정보·운송장 확인",
      "수거 진행 상태 확인",
      "입고·검수 처리",
    ],
    note: "기존 수거·검수 화면에서 처리합니다.",
    outside: "택배 계약·운임 협의 및 API에서 처리되지 않는 사고 접수",
  },
  {
    name: "주문·배송·결제",
    to: "/admin/orders",
    action: "주문·배송 열기",
    tasks: [
      "입금 확인과 주문 처리",
      "출고·운송장·배송 상태 관리",
      "취소·반품·환불 처리",
    ],
    note: "기존 주문 업무 절차와 확인 단계를 사용합니다.",
    outside: "PG 계약·심사·결제수단 설정, PG사의 입금·정산 내역 확인",
  },
  {
    name: "카카오 알림톡·문자",
    to: "/admin/notification-logs",
    action: "알림 발송 로그 열기",
    tasks: ["자동 알림 발송 결과 조회", "실패 원인 확인", "기존 알림 재발송"],
    note: "재발송은 고객에게 실제 메시지가 전송됩니다. 대상과 내용을 확인한 뒤 진행합니다.",
    outside: "알림톡 신규 템플릿 심사, 발신번호·채널 인증, 충전",
    url: "https://console.solapi.com/",
  },
  {
    name: "Gemini 사진 가공",
    to: "/admin/studio",
    action: "사진 스튜디오 열기",
    tasks: [
      "교재 사진 가공",
      "가공 결과 확인·재작업",
      "상품 등록에 사용할 이미지 준비",
    ],
    note: "사진 스튜디오에서 기존 AI 가공 기능을 사용합니다.",
    outside: "Google 결제·API 할당량 변경",
  },
];

export default function AdminIntegrationsPage() {
  const [search, setSearch] = useState("");
  const shown = workflows.filter((item) =>
    `${item.name} ${item.tasks.join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <AdminShell activeModule="integrations" title="연동 업무 모음">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            하려는 업무를 골라 수북 어드민에서 처리하세요.
          </p>
          <input
            aria-label="연동 업무 검색"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="예: 광고, 환불, 수거"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {shown.map((item) => (
            <section
              key={item.name}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5"
            >
              <h2 className="text-lg font-bold">{item.name}</h2>
              <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-slate-700">
                {item.tasks.map((task) => (
                  <li key={task}>{task}</li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                {item.note}
              </p>
              <Link
                className="mt-4 self-start rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
                to={item.to}
              >
                {item.action} →
              </Link>
              <details className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <summary className="cursor-pointer">
                  외부 서비스에서 처리하는 업무
                </summary>
                <p className="mt-2 leading-relaxed">{item.outside}</p>
                {item.url && (
                  <a
                    className="mt-2 inline-block underline"
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    공식 서비스 열기 ↗
                  </a>
                )}
              </details>
            </section>
          ))}
        </div>
        {!shown.length && (
          <p className="py-8 text-center text-sm text-slate-500">
            검색한 업무가 없습니다.
          </p>
        )}
        <p className="text-xs text-slate-500">
          이 페이지는 현재 구현된 업무의 안내입니다. 실제 연결·처리 결과는 각
          업무 화면에서 확인합니다.
        </p>
      </div>
    </AdminShell>
  );
}
