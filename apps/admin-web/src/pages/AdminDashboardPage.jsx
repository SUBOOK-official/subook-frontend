import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminSectionTabs from "../components/AdminSectionTabs";
import { getSellerLookupOrigin } from "../lib/portalLinks";
import { isSupabaseConfigured, supabase } from "@shared-supabase/supabaseClient";
import { formatDate } from "@shared-domain/format";
import StatusBadge from "@shared-domain/StatusBadge";

const PAGE_SIZE = 20;

const initialForm = {
  sellerName: "",
  sellerPhone: "",
  pickupDate: "",
};

function sanitizeSearchKeyword(value) {
  return String(value ?? "")
    .trim()
    .replace(/[,%()]/g, "")
    .replace(/\s+/g, " ");
}

function buildPageItems(currentPage, totalPages) {
  const items = [];

  for (let page = 1; page <= totalPages; page += 1) {
    const isBoundary = page === 1 || page === totalPages;
    const isNearCurrent = Math.abs(page - currentPage) <= 1;

    if (isBoundary || isNearCurrent) {
      items.push(page);
      continue;
    }

    if (items[items.length - 1] !== "...") {
      items.push("...");
    }
  }

  return items;
}

function AdminDashboardPage() {
  const navigate = useNavigate();
  const sellerPortalUrl = getSellerLookupOrigin();
  const [form, setForm] = useState(initialForm);
  const [shipments, setShipments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [deleteCandidateId, setDeleteCandidateId] = useState(null);
  const [deletingShipmentId, setDeletingShipmentId] = useState(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    [totalCount],
  );

  const pageItems = useMemo(
    () => buildPageItems(currentPage, totalPages),
    [currentPage, totalPages],
  );

  const fetchShipments = async ({ page, searchKeyword } = {}) => {
    if (!isSupabaseConfigured) {
      return;
    }

    const targetPage = page ?? currentPage;
    const search = searchKeyword ?? appliedSearch;

    setIsLoading(true);
    setError("");

    let query = supabase.from("shipments").select("*", { count: "exact" });

    if (search) {
      query = query.or(
        `seller_name.ilike.%${search}%,seller_phone.ilike.%${search}`,
      );
    }

    const from = (targetPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error: fetchError, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (fetchError) {
      setError("수거 목록을 불러오지 못했습니다.");
      setIsLoading(false);
      return;
    }

    setShipments(data ?? []);
    setTotalCount(count ?? 0);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchShipments({ page: currentPage, searchKeyword: appliedSearch });
  }, [currentPage, appliedSearch]);

  useEffect(() => {
    if (deleteCandidateId === null) {
      return;
    }

    const hasCandidate = shipments.some((shipment) => shipment.id === deleteCandidateId);
    if (!hasCandidate) {
      setDeleteCandidateId(null);
    }
  }, [deleteCandidateId, shipments]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!isSupabaseConfigured) {
      setError("Supabase 환경 변수가 설정되지 않았습니다.");
      return;
    }

    if (!form.sellerName.trim() || !form.sellerPhone.trim() || !form.pickupDate) {
      setError("이름, 전화번호, 수거 일자를 모두 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);

    const { error: insertError } = await supabase.from("shipments").insert({
      seller_name: form.sellerName.trim(),
      seller_phone: form.sellerPhone.trim(),
      pickup_date: form.pickupDate,
      status: "scheduled",
    });

    if (insertError) {
      setError("수거 등록에 실패했습니다.");
      setIsSubmitting(false);
      return;
    }

    setForm(initialForm);
    setSuccess("새 수거 내역이 등록되었습니다.");
    setIsSubmitting(false);

    if (currentPage !== 1) {
      setCurrentPage(1);
    } else {
      await fetchShipments({ page: 1, searchKeyword: appliedSearch });
    }
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();

    const nextSearch = sanitizeSearchKeyword(searchInput);
    setAppliedSearch(nextSearch);
    setDeleteCandidateId(null);

    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  };

  const handleSearchReset = async () => {
    setSearchInput("");
    setAppliedSearch("");
    setDeleteCandidateId(null);

    if (currentPage !== 1) {
      setCurrentPage(1);
      return;
    }

    await fetchShipments({ page: 1, searchKeyword: "" });
  };

  const handleDeleteShipment = async (shipment) => {
    if (!isSupabaseConfigured || deletingShipmentId !== null) {
      return;
    }

    setError("");
    setSuccess("");
    setDeletingShipmentId(shipment.id);

    const { error: deleteError } = await supabase
      .from("shipments")
      .delete()
      .eq("id", shipment.id);

    if (deleteError) {
      setError("수거 삭제에 실패했습니다. 관리자 삭제 권한 정책을 확인해 주세요.");
      setDeletingShipmentId(null);
      return;
    }

    const nextTotalCount = Math.max(0, totalCount - 1);
    const nextTotalPages = Math.max(1, Math.ceil(nextTotalCount / PAGE_SIZE));
    const nextPage = Math.min(currentPage, nextTotalPages);

    setShipments((prev) => prev.filter((item) => item.id !== shipment.id));
    setTotalCount(nextTotalCount);
    setDeleteCandidateId(null);
    setSuccess(`${shipment.seller_name} 님 수거 내역을 삭제했습니다.`);
    setDeletingShipmentId(null);

    if (nextPage !== currentPage) {
      setCurrentPage(nextPage);
      return;
    }

    await fetchShipments({ page: nextPage, searchKeyword: appliedSearch });
  };

  const handleSignOut = async () => {
    if (!isSupabaseConfigured) {
      return;
    }

    setIsSigningOut(true);
    await supabase.auth.signOut();
    setIsSigningOut(false);
    navigate("/admin/login", { replace: true });
  };

  return (
    <main className="app-shell-admin">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-brand">Admin</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
            수거 등록/관리
          </h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            등록, 조회, 상태 변경을 한 화면에서 빠르게 관리할 수 있습니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a className="btn-secondary !px-3 !py-2 text-xs" href={sellerPortalUrl}>
            판매자 화면
          </a>
          <button
            className="btn-secondary !px-3 !py-2 text-xs"
            disabled={isSigningOut}
            onClick={handleSignOut}
            type="button"
          >
            {isSigningOut ? "로그아웃 중..." : "로그아웃"}
          </button>
        </div>
      </header>

      <AdminSectionTabs />

      {!isSupabaseConfigured ? (
        <p className="notice-error mb-4">
          `.env` 파일에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`를 설정해 주세요.
        </p>
      ) : null}

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <section className="card animate-rise h-full">
          <h2 className="section-title">수거 등록</h2>
          <p className="mt-1 text-sm text-slate-500">
            등록 시 상태는 자동으로 수거예정으로 저장됩니다.
          </p>

          <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
            <label className="block">
              <span className="label">판매자 이름</span>
              <input
                className="input-base"
                name="sellerName"
                type="text"
                value={form.sellerName}
                onChange={handleChange}
                placeholder="홍길동"
              />
            </label>

            <label className="block">
              <span className="label">전화번호</span>
              <input
                className="input-base"
                name="sellerPhone"
                type="tel"
                value={form.sellerPhone}
                onChange={handleChange}
                placeholder="01012345678"
              />
            </label>

            <label className="block">
              <span className="label">수거 일자</span>
              <input
                className="input-base"
                name="pickupDate"
                type="date"
                value={form.pickupDate}
                onChange={handleChange}
              />
            </label>

            <button className="btn-primary" disabled={isSubmitting} type="submit">
              {isSubmitting ? "등록 중..." : "수거 등록"}
            </button>
          </form>
        </section>

        <section className="card animate-rise h-full">
          <h2 className="section-title">판매자 검색</h2>
          <p className="mt-1 text-sm text-slate-500">
            이름 또는 전화번호 뒷자리로 조회할 수 있습니다.
          </p>

          <form className="mt-3 flex gap-2" onSubmit={handleSearchSubmit}>
            <input
              className="input-base !mt-0 !min-w-0 !flex-1 !py-2.5"
              placeholder="예: 홍길동 / 5678"
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <button
              className="btn-secondary !w-auto !shrink-0 !whitespace-nowrap !px-4 !py-2.5"
              type="submit"
            >
              검색
            </button>
          </form>

          {appliedSearch ? (
            <button
              className="mt-2 text-sm font-bold text-brand underline"
              onClick={handleSearchReset}
              type="button"
            >
              검색 초기화
            </button>
          ) : null}
        </section>
      </div>

      {error ? <p className="notice-error mb-4">{error}</p> : null}
      {success ? <p className="notice-success mb-4">{success}</p> : null}

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="section-title">수거 목록</h2>
          <p className="text-xs font-semibold text-slate-500">총 {totalCount}건</p>
        </div>

        {isLoading ? <p className="text-sm text-slate-500">불러오는 중...</p> : null}

        {!isLoading && shipments.length === 0 ? (
          <div className="card text-sm font-semibold text-slate-500">조회 결과가 없습니다.</div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shipments.map((shipment) => {
            const isDeleteConfirmOpen = deleteCandidateId === shipment.id;
            const isDeletingThisShipment = deletingShipmentId === shipment.id;
            const isDeletePending = deletingShipmentId !== null;

            return (
              <article
                className="card animate-rise transition hover:ring-brand/30"
                key={shipment.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-slate-900">{shipment.seller_name}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{shipment.seller_phone}</p>
                  </div>
                  <StatusBadge type="shipment" status={shipment.status} />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-600">
                  수거 일자: <span className="text-brand">{formatDate(shipment.pickup_date)}</span>
                </p>

                <div className="mt-3 border-t border-slate-200 pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      className="btn-secondary !w-auto !px-3 !py-2 text-xs"
                      to={`/admin/shipments/${shipment.id}`}
                    >
                      상세 보기
                    </Link>

                    {!isDeleteConfirmOpen ? (
                      <button
                        className="inline-flex rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isDeletePending}
                        onClick={() => {
                          setDeleteCandidateId(shipment.id);
                          setError("");
                          setSuccess("");
                        }}
                        type="button"
                      >
                        수거 삭제
                      </button>
                    ) : (
                      <button
                        className="btn-secondary !w-auto !px-3 !py-2 text-xs"
                        disabled={isDeletePending}
                        onClick={() => setDeleteCandidateId(null)}
                        type="button"
                      >
                        삭제 취소
                      </button>
                    )}
                  </div>

                  {isDeleteConfirmOpen ? (
                    <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
                      <p className="text-xs font-semibold text-rose-700">
                        이 수거 내역을 삭제하면 연결된 책 목록도 함께 삭제됩니다.
                      </p>
                      <button
                        className="mt-2 inline-flex rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isDeletePending}
                        onClick={() => handleDeleteShipment(shipment)}
                        type="button"
                      >
                        {isDeletingThisShipment ? "삭제 중..." : "영구 삭제 확인"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {totalPages > 1 ? (
        <nav className="mt-5 flex items-center justify-center gap-1">
          <button
            className="btn-secondary !w-auto !px-3 !py-2 text-xs"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            type="button"
          >
            이전
          </button>

          {pageItems.map((item, index) =>
            item === "..." ? (
              <span className="px-1 text-sm font-bold text-slate-400" key={`ellipsis-${index}`}>
                ...
              </span>
            ) : (
              <button
                className={`h-9 min-w-9 rounded-lg px-2 text-sm font-bold ${
                  item === currentPage
                    ? "bg-brand text-white"
                    : "border border-slate-300 bg-white text-slate-700"
                }`}
                key={item}
                onClick={() => setCurrentPage(item)}
                type="button"
              >
                {item}
              </button>
            ),
          )}

          <button
            className="btn-secondary !w-auto !px-3 !py-2 text-xs"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            type="button"
          >
            다음
          </button>
        </nav>
      ) : null}
    </main>
  );
}

export default AdminDashboardPage;
