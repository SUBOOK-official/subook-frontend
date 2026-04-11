import { useEffect, useMemo, useRef, useState } from "react";
import StatusBadge from "@shared-domain/StatusBadge";
import { formatCurrency, formatDate } from "@shared-domain/format";
import { getSettlementInfo } from "@shared-domain/settlement";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import subookLogoUrl from "../assets/subook-logo.png";

const BOOKS_BATCH_SIZE = 20;

const initialLookupForm = {
  sellerName: "",
  sellerPhone: "",
};

const notFoundGuideMessage = `수거 신청이 정상적으로 접수되었습니다.
현재 방문 기사님 배정 및 일정을 조율 중입니다.
24시간 이내에 수거 예정일이 등록될 예정이니 조금만 기다려주세요!`;

const settlementGuideMessage =
  "판매가 완료되고 7일 이후 구매가 확정되면 수거 신청시 입력한 계좌로 금액이 정산됩니다.";

const statusFilters = [
  { key: "all", label: "전체" },
  { key: "on_sale", label: "판매중" },
  { key: "settled", label: "정산완료" },
];

function formatBookLabel(book) {
  const option = String(book.option ?? "").trim();
  return option ? `${book.title} [${option}]` : book.title;
}

function getBookSortPriority(status) {
  return status === "settled" ? 0 : 1;
}

function compareBooksForDisplay(a, b) {
  const priorityDiff = getBookSortPriority(a.status) - getBookSortPriority(b.status);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  const aTime = a.created_at ? new Date(a.created_at).getTime() : Number.NaN;
  const bTime = b.created_at ? new Date(b.created_at).getTime() : Number.NaN;
  const canCompareTime = Number.isFinite(aTime) && Number.isFinite(bTime);
  if (canCompareTime && aTime !== bTime) {
    return aTime - bTime;
  }

  return (a.id ?? 0) - (b.id ?? 0);
}

function SettlementInfoModal({ isOpen, onClose, message }) {
  const dialogRef = useRef(null);
  const confirmButtonRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousFocused = document.activeElement;
    confirmButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = dialogRef.current?.querySelectorAll(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      );

      if (!focusable || focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocused instanceof HTMLElement) {
        previousFocused.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4"
      onClick={onClose}
    >
      <div
        aria-labelledby="settlement-info-title"
        aria-modal="true"
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-soft"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <h2 className="text-lg font-black text-brand" id="settlement-info-title">
          정산 안내
        </h2>
        <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-700">{message}</p>
        <button
          className="btn-primary mt-4"
          onClick={onClose}
          ref={confirmButtonRef}
          type="button"
        >
          확인
        </button>
      </div>
    </div>
  );
}

function SellerLookupPage() {
  const [form, setForm] = useState(initialLookupForm);
  const [shipment, setShipment] = useState(null);
  const [books, setBooks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [booksError, setBooksError] = useState("");
  const [lookupNotice, setLookupNotice] = useState("");
  const [isSettlementInfoOpen, setIsSettlementInfoOpen] = useState(false);

  const [activeStatus, setActiveStatus] = useState("all");
  const [titleQuery, setTitleQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(BOOKS_BATCH_SIZE);

  const statusCounts = useMemo(() => {
    const onSaleCount = books.filter((book) => book.status === "on_sale").length;
    const settledCount = books.filter((book) => book.status === "settled").length;

    return {
      all: books.length,
      on_sale: onSaleCount,
      settled: settledCount,
    };
  }, [books]);

  const totalSettledNetAmount = useMemo(() => {
    return books.reduce((sum, book) => {
      if (book.status !== "settled") {
        return sum;
      }

      const settlement = getSettlementInfo(book.price, shipment?.pickup_date);
      return sum + (settlement?.netAmount ?? 0);
    }, 0);
  }, [books, shipment?.pickup_date]);

  const sortedBooks = useMemo(() => [...books].sort(compareBooksForDisplay), [books]);

  const filteredBooks = useMemo(() => {
    const normalizedQuery = titleQuery.trim().toLowerCase();

    return sortedBooks.filter((book) => {
      const statusMatched = activeStatus === "all" || book.status === activeStatus;
      if (!statusMatched) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return formatBookLabel(book).toLowerCase().includes(normalizedQuery);
    });
  }, [sortedBooks, activeStatus, titleQuery]);

  const visibleBooks = useMemo(
    () => filteredBooks.slice(0, visibleCount),
    [filteredBooks, visibleCount],
  );

  const hasMoreBooks = visibleCount < filteredBooks.length;

  useEffect(() => {
    setVisibleCount(BOOKS_BATCH_SIZE);
  }, [activeStatus, titleQuery, shipment?.id]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setLookupNotice("");
  };

  const handleLookup = async (event) => {
    event.preventDefault();
    setError("");
    setBooksError("");
    setLookupNotice("");

    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase 환경 변수가 설정되지 않았습니다.");
      return;
    }

    if (!form.sellerName.trim() || !form.sellerPhone.trim()) {
      setError("이름과 전화번호를 모두 입력해 주세요.");
      return;
    }

    const sellerName = form.sellerName.trim();
    const sellerPhone = form.sellerPhone.trim();

    setIsLoading(true);
    setShipment(null);
    setBooks([]);
    setActiveStatus("all");
    setTitleQuery("");

    try {
      const { data: shipmentRows, error: shipmentError } = await supabase.rpc(
        "lookup_seller_shipment",
        {
          p_seller_name: sellerName,
          p_seller_phone: sellerPhone,
        },
      );

      if (shipmentError) {
        setError("조회 중 오류가 발생했습니다.");
        return;
      }

      const latestShipment = shipmentRows?.[0];
      if (!latestShipment) {
        setLookupNotice(notFoundGuideMessage);
        return;
      }

      setShipment(latestShipment);

      if (latestShipment.status === "inspected") {
        const { data: bookRows, error: booksError } = await supabase.rpc("lookup_seller_books", {
          p_shipment_id: latestShipment.id,
          p_seller_name: sellerName,
          p_seller_phone: sellerPhone,
        });

        if (booksError) {
          setBooksError("검수된 책 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
          setBooks([]);
          return;
        }

        setBooksError("");
        setBooks(bookRows ?? []);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetView = () => {
    setShipment(null);
    setBooks([]);
    setError("");
    setBooksError("");
    setLookupNotice("");
    setForm(initialLookupForm);
    setActiveStatus("all");
    setTitleQuery("");
    setVisibleCount(BOOKS_BATCH_SIZE);
  };

  const handleOpenSettlementInfo = () => {
    setIsSettlementInfoOpen(true);
  };

  const handleCloseSettlementInfo = () => {
    setIsSettlementInfoOpen(false);
  };

  if (shipment) {
    const hasBooks = books.length > 0;

    return (
      <main className="app-shell">
        <header className="mb-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <img
                alt="수북"
                className="h-8 w-auto max-w-[140px] shrink-0 object-contain"
                src={subookLogoUrl}
              />
              <div className="min-w-0">
                <h1 className="text-2xl font-black tracking-tight text-brand">판매 현황</h1>
                <p className="mt-1 truncate text-sm font-semibold text-slate-600">
                  {shipment.seller_name} 님 ({shipment.seller_phone})
                </p>
              </div>
            </div>
            <button
              aria-label="정산 안내"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-base font-black leading-none text-brand shadow-sm"
              onClick={handleOpenSettlementInfo}
              type="button"
            >
              i
            </button>
          </div>
        </header>

        {shipment.status === "scheduled" ? (
          <section className="card animate-rise space-y-3 text-center">
            <StatusBadge status={shipment.status} type="shipment" />
            <p className="text-2xl font-black tracking-tight text-brand">방문 수거 예정입니다</p>
            <p className="text-base font-semibold text-slate-700">
              예정일: <span className="text-brand">{formatDate(shipment.pickup_date)}</span>
            </p>
          </section>
        ) : (
          <section className="space-y-3">
            <div className="card animate-rise space-y-2">
              <StatusBadge status={shipment.status} type="shipment" />
              <p className="text-lg font-black text-slate-900">
                {shipment.status === "inspecting"
                  ? "수거한 책을 검수 중입니다. 꼼꼼히 확인 후 판매가 시작됩니다."
                  : hasBooks
                    ? "검수가 완료되어 판매가 시작되었습니다!"
                    : booksError
                      ? "검수가 완료되었지만 책 목록을 불러오지 못했습니다."
                    : "검수가 완료되었습니다. 판매 등록을 준비하고 있습니다."}
              </p>
              <p className="text-sm font-semibold text-slate-600">
                방문 수거일: <span className="text-brand">{formatDate(shipment.pickup_date)}</span>
              </p>
            </div>

            {booksError ? <p className="notice-error">{booksError}</p> : null}

            {hasBooks ? (
              <section className="card animate-rise !p-3">
                <div className="grid grid-cols-2 gap-2">
                  {statusFilters.map((filter) => {
                    const isActive = activeStatus === filter.key;
                    const count = statusCounts[filter.key] ?? 0;

                    return (
                      <button
                        className={`rounded-xl border px-3 py-2 text-left transition ${
                          isActive
                            ? "border-brand bg-brand text-white"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                        }`}
                        key={filter.key}
                        onClick={() => setActiveStatus(filter.key)}
                        type="button"
                      >
                        <p className="text-xs font-bold">{filter.label}</p>
                        <p className="mt-0.5 text-sm font-black">{count}권</p>
                      </button>
                    );
                  })}

                  <div className="rounded-xl border border-brand/20 bg-brand/5 px-3 py-2 text-left">
                    <p className="text-xs font-bold text-slate-600">총 정산금액</p>
                    <p className="mt-0.5 text-sm font-black text-brand">
                      {formatCurrency(totalSettledNetAmount)}
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <input
                    className="input-base !mt-0 !py-2.5 text-sm"
                    onChange={(event) => setTitleQuery(event.target.value)}
                    placeholder="책 제목을 검색하세요"
                    type="text"
                    value={titleQuery}
                  />
                </div>

                <p className="mt-2 text-xs font-semibold text-slate-500">
                  필터 결과 {filteredBooks.length}권
                </p>
              </section>
            ) : null}

            {hasBooks ? <h2 className="section-title mt-1">등록된 책</h2> : null}

            {hasBooks && filteredBooks.length === 0 ? (
              <div className="card text-sm font-semibold text-slate-500">
                필터 조건에 맞는 책이 없습니다.
              </div>
            ) : null}

            {visibleBooks.map((book) => {
              const settlement = getSettlementInfo(book.price, shipment.pickup_date);
              const bookLabel = formatBookLabel(book);

              return (
                <article className="card animate-rise !p-3" key={book.id}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="w-full truncate text-left text-sm font-extrabold text-slate-900">
                      {bookLabel}
                    </p>
                    <StatusBadge status={book.status} />
                  </div>

                  <p className="mt-1 text-xs font-semibold text-slate-600">
                    판매가: <span className="text-brand">{formatCurrency(book.price)}</span>
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-600">
                    정산 예상금액:{" "}
                    <span className="text-brand">
                      {settlement ? formatCurrency(settlement.netAmount) : "미입력"}
                    </span>
                    {settlement ? ` (수수료 ${settlement.feePercent}%)` : ""}
                  </p>
                </article>
              );
            })}

            {hasMoreBooks ? (
              <button
                className="btn-secondary w-full"
                onClick={() => setVisibleCount((prev) => prev + BOOKS_BATCH_SIZE)}
                type="button"
              >
                더 보기 ({filteredBooks.length - visibleCount}권 남음)
              </button>
            ) : null}
          </section>
        )}

        <button className="btn-secondary mt-5 w-full" onClick={resetView} type="button">
          다시 조회하기
        </button>

        <a
          className="btn-secondary mt-3 w-full"
          href="https://subook.kr"
          rel="noreferrer"
          target="_blank"
        >
          수북 홈페이지 바로 가기
        </a>

        <SettlementInfoModal
          isOpen={isSettlementInfoOpen}
          message={settlementGuideMessage}
          onClose={handleCloseSettlementInfo}
        />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <img
              alt="수북"
              className="h-9 w-auto max-w-[160px] shrink-0 object-contain"
              src={subookLogoUrl}
            />
            <div className="min-w-0">
              <h1 className="text-2xl font-black tracking-tight text-brand">판매자 조회</h1>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                수거 신청 교재 현황 확인하기
              </p>
            </div>
          </div>
          <button
            aria-label="정산 안내"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-base font-black leading-none text-brand shadow-sm"
            onClick={handleOpenSettlementInfo}
            type="button"
          >
            i
          </button>
        </div>
      </header>

      {!isSupabaseConfigured ? (
        <p className="notice-error mb-4">
          `.env` 파일에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`를 설정해 주세요.
        </p>
      ) : null}

      <section className="card animate-rise">
        <h2 className="section-title">조회하기</h2>
        <form className="mt-4 space-y-3" onSubmit={handleLookup}>
          <label className="block">
            <span className="label">이름</span>
            <input
              className="input-base"
              name="sellerName"
              onChange={handleChange}
              placeholder="홍길동"
              type="text"
              value={form.sellerName}
            />
          </label>

          <label className="block">
            <span className="label">전화번호</span>
            <input
              className="input-base"
              name="sellerPhone"
              onChange={handleChange}
              placeholder="010-1234-5678"
              type="tel"
              value={form.sellerPhone}
            />
          </label>

          <button className="btn-primary" disabled={isLoading} type="submit">
            {isLoading ? "조회 중..." : "조회"}
          </button>
        </form>
      </section>

      {error ? <p className="notice-error mt-4">{error}</p> : null}

      {lookupNotice ? (
        <section className="card mt-4 border border-sky-200 bg-sky-50">
          <p className="whitespace-pre-line text-sm font-semibold text-sky-900">{lookupNotice}</p>
        </section>
      ) : null}

      <a
        className="btn-secondary mt-5 w-full"
        href="https://subook.kr"
        rel="noreferrer"
        target="_blank"
      >
        수북 홈페이지 바로 가기
      </a>

      <SettlementInfoModal
        isOpen={isSettlementInfoOpen}
        message={settlementGuideMessage}
        onClose={handleCloseSettlementInfo}
      />
    </main>
  );
}

export default SellerLookupPage;
