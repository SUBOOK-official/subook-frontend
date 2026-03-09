import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AdminSectionTabs from "../components/AdminSectionTabs";
import { formatCurrency, formatDate } from "@shared-domain/format";
import { bookStatusLabel } from "@shared-domain/status";
import { isSupabaseConfigured, supabase } from "@shared-supabase/supabaseClient";
import StatusBadge from "@shared-domain/StatusBadge";

const initialBookForm = {
  title: "",
  option: "",
  price: "",
};
const BOOKS_PAGE_SIZE = 30;

const adminBookStatusOptions = [
  { value: "on_sale", label: bookStatusLabel.on_sale },
  { value: "settled", label: bookStatusLabel.settled },
];

function toNullableText(value) {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}

function parsePrice(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return null;
  }

  if (typeof rawValue === "number") {
    if (!Number.isFinite(rawValue)) {
      return Number.NaN;
    }
    return rawValue >= 0 ? Math.trunc(rawValue) : Number.NaN;
  }

  const normalized = String(rawValue).replaceAll(",", "").trim();
  if (normalized === "") {
    return null;
  }

  if (!/^-?\d+$/.test(normalized)) {
    return Number.NaN;
  }

  const parsed = Number.parseInt(normalized, 10);
  return parsed >= 0 ? parsed : Number.NaN;
}

function splitOptionValues(optionInput) {
  const optionText = toNullableText(optionInput);
  if (!optionText) {
    return [null];
  }

  const optionItems = optionText
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return optionItems.length > 0 ? optionItems : [null];
}

function formatBookLabel(book) {
  const option = toNullableText(book.option);
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

function AdminShipmentDetailPage() {
  const { shipmentId } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [shipment, setShipment] = useState(null);
  const [books, setBooks] = useState([]);
  const [bookForm, setBookForm] = useState(initialBookForm);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [updatingBookId, setUpdatingBookId] = useState(null);
  const [updatingBookPriceId, setUpdatingBookPriceId] = useState(null);
  const [deletingBookId, setDeletingBookId] = useState(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [bookSearchQuery, setBookSearchQuery] = useState("");
  const [bookListPage, setBookListPage] = useState(1);
  const [bookPriceDrafts, setBookPriceDrafts] = useState({});

  const parsedShipmentId = useMemo(() => Number(shipmentId), [shipmentId]);
  const isScheduled = shipment?.status === "scheduled";
  const isInspecting = shipment?.status === "inspecting";
  const isInspected = shipment?.status === "inspected";
  const sortedBooks = useMemo(() => [...books].sort(compareBooksForDisplay), [books]);
  const filteredBooks = useMemo(() => {
    const normalizedQuery = bookSearchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return sortedBooks;
    }

    return sortedBooks.filter((book) =>
      formatBookLabel(book).toLowerCase().includes(normalizedQuery),
    );
  }, [bookSearchQuery, sortedBooks]);
  const totalBookPages = useMemo(
    () => Math.max(1, Math.ceil(filteredBooks.length / BOOKS_PAGE_SIZE)),
    [filteredBooks.length],
  );
  const pagedBooks = useMemo(() => {
    const from = (bookListPage - 1) * BOOKS_PAGE_SIZE;
    const to = from + BOOKS_PAGE_SIZE;
    return filteredBooks.slice(from, to);
  }, [bookListPage, filteredBooks]);

  useEffect(() => {
    setBookListPage(1);
  }, [bookSearchQuery]);

  useEffect(() => {
    setBookListPage((prev) => Math.min(prev, totalBookPages));
  }, [totalBookPages]);

  const refreshBooks = async () => {
    if (!isSupabaseConfigured || Number.isNaN(parsedShipmentId)) {
      return false;
    }

    const { data, error: booksError } = await supabase
      .from("books")
      .select("*")
      .eq("shipment_id", parsedShipmentId)
      .order("created_at", { ascending: true });

    if (booksError) {
      setError("책 목록을 불러오지 못했습니다.");
      return false;
    }

    setBooks(data ?? []);
    setBookPriceDrafts({});
    return true;
  };

  const fetchDetail = async () => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    if (Number.isNaN(parsedShipmentId)) {
      setError("유효하지 않은 수거 ID입니다.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    const [shipmentResult, booksResult] = await Promise.all([
      supabase.from("shipments").select("*").eq("id", parsedShipmentId).maybeSingle(),
      supabase
        .from("books")
        .select("*")
        .eq("shipment_id", parsedShipmentId)
        .order("created_at", { ascending: true }),
    ]);

    if (shipmentResult.error) {
      setError("수거 정보를 불러오지 못했습니다.");
      setIsLoading(false);
      return;
    }

    if (booksResult.error) {
      setError("책 목록을 불러오지 못했습니다.");
      setIsLoading(false);
      return;
    }

    setShipment(shipmentResult.data);
    setBooks(booksResult.data ?? []);
    setBookPriceDrafts({});
    setIsLoading(false);
  };

  useEffect(() => {
    fetchDetail();
  }, [parsedShipmentId]);

  const handleUpdateShipmentStatus = async ({ nextStatus, successMessage }) => {
    if (!isSupabaseConfigured || !shipment) {
      return;
    }

    setActionLoading(true);
    setError("");
    setNotice("");

    const { error: updateError } = await supabase
      .from("shipments")
      .update({ status: nextStatus })
      .eq("id", shipment.id);

    if (updateError) {
      setError("상태 변경에 실패했습니다.");
      setActionLoading(false);
      return;
    }

    setShipment((prev) => (prev ? { ...prev, status: nextStatus } : prev));
    setNotice(successMessage);
    setActionLoading(false);
  };

  const handleBookFormChange = (event) => {
    const { name, value } = event.target;
    setBookForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddBook = async (event) => {
    event.preventDefault();

    if (!isSupabaseConfigured || !shipment) {
      return;
    }

    const title = toNullableText(bookForm.title);
    if (!title) {
      setError("책 제목을 입력해 주세요.");
      return;
    }

    const parsedPrice = parsePrice(bookForm.price);
    if (Number.isNaN(parsedPrice)) {
      setError("판매 가격은 0 이상의 숫자로 입력해 주세요.");
      return;
    }

    const optionValues = splitOptionValues(bookForm.option);
    const payload = optionValues.map((optionValue) => ({
      shipment_id: shipment.id,
      title,
      option: optionValue,
      status: "on_sale",
      price: parsedPrice,
    }));

    setActionLoading(true);
    setError("");
    setNotice("");

    const { data, error: insertError } = await supabase
      .from("books")
      .insert(payload)
      .select("*");

    if (insertError) {
      setError("책 등록에 실패했습니다.");
      setActionLoading(false);
      return;
    }

    setBooks((prev) => [...prev, ...(data ?? [])]);
    setBookForm(initialBookForm);
    setNotice(`${payload.length}권의 책이 추가되었습니다.`);
    setActionLoading(false);
  };

  const handleOpenExcelPicker = () => {
    fileInputRef.current?.click();
  };

  const handleExcelUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!isSupabaseConfigured || !shipment) {
      return;
    }

    if (!isInspected) {
      setError("검수 완료 상태에서만 엑셀 등록이 가능합니다.");
      return;
    }

    setIsBulkUploading(true);
    setError("");
    setNotice("");

    try {
      const fileBuffer = await file.arrayBuffer();
      const xlsx = await import("xlsx");
      const workbook = xlsx.read(fileBuffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      if (!worksheet) {
        setError("엑셀 파일에서 시트를 찾지 못했습니다.");
        return;
      }

      const rows = xlsx.utils.sheet_to_json(worksheet, { defval: "" });
      if (rows.length === 0) {
        setError("엑셀 파일에 데이터가 없습니다.");
        return;
      }

      const payload = [];

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const title = toNullableText(row.Title ?? row.title ?? row.TITLE);
        if (!title) {
          continue;
        }

        const parsedPrice = parsePrice(row.Price ?? row.price ?? row.PRICE);
        if (Number.isNaN(parsedPrice)) {
          setError(`${index + 2}행 Price 값이 올바른 숫자가 아닙니다.`);
          return;
        }

        const optionValues = splitOptionValues(row.Option ?? row.option ?? row.OPTION);
        for (const optionValue of optionValues) {
          payload.push({
            shipment_id: shipment.id,
            title,
            option: optionValue,
            status: "on_sale",
            price: parsedPrice,
          });
        }
      }

      if (payload.length === 0) {
        setError("등록 가능한 Title 데이터가 없습니다.");
        return;
      }

      const { error: insertError } = await supabase.from("books").insert(payload);
      if (insertError) {
        setError("엑셀 대량 등록에 실패했습니다.");
        return;
      }

      await refreshBooks();
      setNotice(`${payload.length}권의 책을 엑셀로 등록했습니다.`);
    } catch (uploadError) {
      setError("엑셀 파일 처리 중 오류가 발생했습니다.");
    } finally {
      setIsBulkUploading(false);
    }
  };

  const handleBookStatusChange = async (bookId, nextStatus) => {
    if (!isSupabaseConfigured) {
      return;
    }

    setError("");
    setNotice("");
    setUpdatingBookId(bookId);

    const { error: updateError } = await supabase
      .from("books")
      .update({ status: nextStatus })
      .eq("id", bookId);

    if (updateError) {
      setError("책 상태 업데이트에 실패했습니다.");
      setUpdatingBookId(null);
      return;
    }

    setBooks((prev) =>
      prev.map((book) =>
        book.id === bookId ? { ...book, status: nextStatus } : book,
      ),
    );
    setUpdatingBookId(null);
  };

  const getPriceDraftValue = (book) => {
    if (Object.prototype.hasOwnProperty.call(bookPriceDrafts, book.id)) {
      return bookPriceDrafts[book.id];
    }

    return book.price === null || book.price === undefined ? "" : String(book.price);
  };

  const handlePriceDraftChange = (bookId, value) => {
    setBookPriceDrafts((prev) => ({ ...prev, [bookId]: value }));
  };

  const handleSaveBookPrice = async (book) => {
    if (!isSupabaseConfigured) {
      return;
    }

    const nextRawValue = getPriceDraftValue(book);
    const parsedPrice = parsePrice(nextRawValue);
    if (Number.isNaN(parsedPrice)) {
      setError("판매 가격은 0 이상의 숫자로 입력해 주세요.");
      return;
    }

    setError("");
    setNotice("");
    setUpdatingBookPriceId(book.id);

    const { error: updateError } = await supabase
      .from("books")
      .update({ price: parsedPrice })
      .eq("id", book.id);

    if (updateError) {
      setError("판매가 저장에 실패했습니다.");
      setUpdatingBookPriceId(null);
      return;
    }

    setBooks((prev) =>
      prev.map((item) => (item.id === book.id ? { ...item, price: parsedPrice } : item)),
    );
    setBookPriceDrafts((prev) => {
      const next = { ...prev };
      delete next[book.id];
      return next;
    });
    setNotice("판매가를 수정했습니다.");
    setUpdatingBookPriceId(null);
  };

  const handleDeleteBook = async (book) => {
    if (!isSupabaseConfigured) {
      return;
    }

    const confirmed = window.confirm(
      `정말 이 책을 삭제하시겠습니까?\n${formatBookLabel(book)}`,
    );
    if (!confirmed) {
      return;
    }

    setError("");
    setNotice("");
    setDeletingBookId(book.id);

    const { error: deleteError } = await supabase.from("books").delete().eq("id", book.id);
    if (deleteError) {
      setError("책 삭제에 실패했습니다.");
      setDeletingBookId(null);
      return;
    }

    setBooks((prev) => prev.filter((item) => item.id !== book.id));
    setBookPriceDrafts((prev) => {
      const next = { ...prev };
      delete next[book.id];
      return next;
    });
    setNotice("책을 삭제했습니다.");
    setDeletingBookId(null);
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

  if (isLoading) {
    return (
      <main className="app-shell">
        <p className="text-sm font-semibold text-slate-500">불러오는 중...</p>
      </main>
    );
  }

  if (!shipment) {
    return (
      <main className="app-shell space-y-4">
        <p className="notice-error">수거 정보를 찾을 수 없습니다.</p>
        <Link className="btn-secondary" to="/admin">
          관리자 목록으로
        </Link>
      </main>
    );
  }

  return (
    <main className="app-shell-admin">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-brand">Admin</p>
          <h1 className="mt-1 text-xl font-black tracking-tight text-slate-900">
            {shipment.seller_name} 님 수거 상세
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link className="btn-secondary !px-3 !py-2 text-xs" to="/admin">
            목록으로
          </Link>
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
          Supabase 환경 변수가 설정되지 않아 기능을 사용할 수 없습니다.
        </p>
      ) : null}

      {error ? <p className="notice-error mb-4">{error}</p> : null}
      {notice ? <p className="notice-success mb-4">{notice}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">
        <div className="space-y-4 xl:sticky xl:top-6">
          <section className="card animate-rise space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="section-title">수거 상태</h2>
              <StatusBadge type="shipment" status={shipment.status} />
            </div>
            <p className="text-sm font-semibold text-slate-600">
              전화번호: <span className="text-slate-900">{shipment.seller_phone}</span>
            </p>
            <p className="text-sm font-semibold text-slate-600">
              수거 일자: <span className="text-brand">{formatDate(shipment.pickup_date)}</span>
            </p>

            {isScheduled ? (
              <button
                className="btn-primary mt-2"
                disabled={actionLoading || isBulkUploading}
                onClick={() =>
                  handleUpdateShipmentStatus({
                    nextStatus: "inspecting",
                    successMessage: "검수중 상태로 변경되었습니다.",
                  })
                }
                type="button"
              >
                {actionLoading ? "변경 중..." : "검수중으로 변경"}
              </button>
            ) : null}

            {isInspecting ? (
              <button
                className="btn-primary mt-2"
                disabled={actionLoading || isBulkUploading}
                onClick={() =>
                  handleUpdateShipmentStatus({
                    nextStatus: "inspected",
                    successMessage: "검수 완료 상태로 변경되었습니다.",
                  })
                }
                type="button"
              >
                {actionLoading ? "변경 중..." : "검수 완료로 변경"}
              </button>
            ) : null}

            {isInspected ? (
              <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700">
                검수 완료 상태입니다. 아래에서 책을 추가하거나 엑셀로 일괄 등록할 수 있습니다.
              </p>
            ) : null}
          </section>

          {isInspected ? (
            <section className="card animate-rise">
              <h2 className="section-title">책 추가</h2>
              <form className="mt-4 space-y-3" onSubmit={handleAddBook}>
                <label className="block">
                  <span className="label">책 제목</span>
                  <input
                    className="input-base"
                    name="title"
                    onChange={handleBookFormChange}
                    placeholder="예: 서바이벌 모의고사"
                    type="text"
                    value={bookForm.title}
                  />
                </label>

                <label className="block">
                  <span className="label">옵션(예: 1회, 2회, 상/하)</span>
                  <input
                    className="input-base"
                    name="option"
                    onChange={handleBookFormChange}
                    placeholder="예: 1회, 2회"
                    type="text"
                    value={bookForm.option}
                  />
                </label>

                <label className="block">
                  <span className="label">판매 가격(선택)</span>
                  <input
                    className="input-base"
                    name="price"
                    onChange={handleBookFormChange}
                    placeholder="예: 12000"
                    type="number"
                    value={bookForm.price}
                  />
                </label>

                <button
                  className="btn-primary"
                  disabled={actionLoading || isBulkUploading}
                  type="submit"
                >
                  {actionLoading ? "추가 중..." : "책 추가"}
                </button>
              </form>

              <div className="mt-4 border-t border-slate-200 pt-4">
                <button
                  className="btn-secondary w-full"
                  disabled={actionLoading || isBulkUploading}
                  onClick={handleOpenExcelPicker}
                  type="button"
                >
                  {isBulkUploading ? "업로드 중..." : "엑셀로 책 등록하기"}
                </button>
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  엑셀 컬럼명: `Title`, `Option`, `Price`
                </p>
                <input
                  ref={fileInputRef}
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleExcelUpload}
                  type="file"
                />
              </div>
            </section>
          ) : null}

        </div>

        <section className="space-y-3">
          <h2 className="section-title">책 목록</h2>
          {books.length === 0 ? (
            <div className="card text-sm font-semibold text-slate-500">
              아직 등록된 책이 없습니다.
            </div>
          ) : null}

          {books.length > 0 ? (
            <div className="card !p-3">
              <input
                className="input-base !mt-0 !py-2.5 text-sm"
                onChange={(event) => setBookSearchQuery(event.target.value)}
                placeholder="등록된 책 검색 (제목/옵션)"
                type="text"
                value={bookSearchQuery}
              />
              <p className="mt-2 text-xs font-semibold text-slate-500">
                검색 결과 {filteredBooks.length}권 · 페이지 {bookListPage}/{totalBookPages}
              </p>
            </div>
          ) : null}

          {books.length > 0 && filteredBooks.length === 0 ? (
            <div className="card text-sm font-semibold text-slate-500">
              검색 조건에 맞는 책이 없습니다.
            </div>
          ) : null}

          {filteredBooks.length > 0 ? (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs font-semibold text-slate-500">
                페이지당 {BOOKS_PAGE_SIZE}권
              </p>
              <div className="flex items-center gap-2">
                <button
                  className="btn-secondary !w-auto !px-3 !py-1.5 text-xs"
                  disabled={bookListPage === 1}
                  onClick={() => setBookListPage((prev) => Math.max(1, prev - 1))}
                  type="button"
                >
                  이전
                </button>
                <button
                  className="btn-secondary !w-auto !px-3 !py-1.5 text-xs"
                  disabled={bookListPage === totalBookPages}
                  onClick={() => setBookListPage((prev) => Math.min(totalBookPages, prev + 1))}
                  type="button"
                >
                  다음
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            {pagedBooks.map((book) => {
              return (
                <article className="card animate-rise" key={book.id}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-extrabold text-slate-900">
                      {formatBookLabel(book)}
                    </h3>
                    <StatusBadge status={book.status} />
                  </div>

                  <p className="mt-2 text-sm font-semibold text-slate-600">
                    판매가: <span className="text-brand">{formatCurrency(book.price)}</span>
                  </p>

                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="label">판매가 수정</p>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        className="input-base !mt-0 !py-2 text-sm"
                        disabled={deletingBookId === book.id || isBulkUploading}
                        onChange={(event) => handlePriceDraftChange(book.id, event.target.value)}
                        placeholder="예: 12000"
                        type="number"
                        value={getPriceDraftValue(book)}
                      />
                      <button
                        className="btn-secondary !w-auto !whitespace-nowrap !px-3 !py-2 text-xs"
                        disabled={
                          updatingBookPriceId === book.id ||
                          deletingBookId === book.id ||
                          isBulkUploading
                        }
                        onClick={() => handleSaveBookPrice(book)}
                        type="button"
                      >
                        {updatingBookPriceId === book.id ? "저장 중..." : "판매가 저장"}
                      </button>
                    </div>
                  </div>

                  <label className="mt-3 block">
                    <span className="label">상태 변경</span>
                    <select
                      className="input-base"
                      disabled={
                        updatingBookId === book.id ||
                        deletingBookId === book.id ||
                        isBulkUploading
                      }
                      onChange={(event) => handleBookStatusChange(book.id, event.target.value)}
                      value={book.status}
                    >
                      {adminBookStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    className="mt-3 inline-flex rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700"
                    disabled={
                      deletingBookId === book.id ||
                      updatingBookPriceId === book.id ||
                      updatingBookId === book.id ||
                      isBulkUploading
                    }
                    onClick={() => handleDeleteBook(book)}
                    type="button"
                  >
                    {deletingBookId === book.id ? "삭제 중..." : "책 삭제"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

export default AdminShipmentDetailPage;

