import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminShell from "../components/AdminShell";
import AdminPageTabs from "../components/AdminPageTabs";
import AdminPagination from "../components/AdminPagination";
import { exportRowsToXlsx, readSheetRowsAsObjects } from "../lib/excelFile";
import { formatCurrency, formatDate } from "@shared-domain/format";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";

// 수동 정산(식스샵 구 사이트·오프라인 판매분) — Model C.
// 책 상태(settled)는 재고 축으로 단일 유지, "셀러 입금 여부"는 manual_settlements에서 추적.
// 엑셀 포맷: 파일명 = 셀러명, 컬럼 = Title / Option / Price (판매가). SellerName 컬럼이 있으면 행별 우선.

const PAGE_SIZE = 100;
const BOOK_PAGE = 1000;

const TITLE_ALIASES = ["title", "교재명", "도서명", "제목", "책", "상품명"];
const OPTION_ALIASES = ["option", "옵션", "구분"];
const PRICE_ALIASES = ["price", "판매가", "가격", "금액", "판매금액", "정산판매가"];
const SELLER_ALIASES = ["sellername", "seller", "판매자", "판매자명", "셀러", "셀러명"];

const STATUS_FILTERS = [
  { value: "unpaid", label: "미지급" },
  { value: "paid", label: "지급완료" },
  { value: "cancelled", label: "취소" },
  { value: "all", label: "전체" },
];

const OUTCOME_META = {
  settle: { label: "정산 처리", tone: "bg-emerald-100 text-emerald-800" },
  already: { label: "이미 정산", tone: "bg-slate-100 text-slate-600" },
  not_found: { label: "책 없음", tone: "bg-rose-100 text-rose-700" },
  option_mismatch: { label: "옵션 불일치", tone: "bg-rose-100 text-rose-700" },
  ambiguous: { label: "중복/모호", tone: "bg-amber-100 text-amber-800" },
  discarded: { label: "폐기 제외", tone: "bg-rose-100 text-rose-700" },
};

function pickField(obj, aliases) {
  const keys = Object.keys(obj || {});
  for (const alias of aliases) {
    const found = keys.find((key) => key.trim().toLowerCase() === alias.toLowerCase());
    if (found != null) return obj[found];
  }
  return undefined;
}

function norm(value) {
  return value == null ? "" : String(value).trim();
}

function toAmount(value) {
  if (value == null || value === "") return 0;
  const numeric = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

// 파일명에서 셀러명 추출: 앞 날짜("6.9 ")·"어드민정산_"·"정산_" 등 접두 제거.
function deriveSellerFromFilename(name) {
  let result = String(name || "").replace(/\.(xlsx|xls|csv)$/i, "");
  result = result.replace(/^\s*\d{1,4}[.\-/]\d{1,2}([.\-/]\d{1,4})?\s*/, "");
  result = result.replace(/^(어드민\s*정산|정산|admin\s*settlement|settlement)\s*[_\-:\s]*/i, "");
  return result.trim();
}

function chunk(list, size) {
  const out = [];
  for (let index = 0; index < list.length; index += size) {
    out.push(list.slice(index, index + size));
  }
  return out;
}

async function fetchSellerBooks(sellerNames) {
  const { data: ships, error: shipError } = await supabase
    .from("shipments")
    .select("id,seller_name,seller_phone,pickup_date");
  if (shipError) {
    throw new Error("수거(셀러) 정보를 불러오지 못했습니다.");
  }

  const wanted = new Set(sellerNames.map((name) => name.trim()).filter(Boolean));
  const knownSellers = new Set();
  const shipById = new Map();
  const shipIds = [];
  (ships || []).forEach((ship) => {
    shipById.set(ship.id, ship);
    const sellerKey = norm(ship.seller_name);
    if (wanted.has(sellerKey)) {
      knownSellers.add(sellerKey);
      shipIds.push(ship.id);
    }
  });

  const books = [];
  for (const idChunk of chunk(shipIds, 50)) {
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase
        .from("books")
        .select("id,shipment_id,title,option,status,price")
        .in("shipment_id", idChunk)
        .order("id", { ascending: true })
        .range(from, from + BOOK_PAGE - 1);
      if (error) {
        throw new Error("정산 대상 책 목록을 불러오지 못했습니다.");
      }
      books.push(...(data || []));
      if (!data || data.length < BOOK_PAGE) {
        break;
      }
      from += BOOK_PAGE;
    }
  }

  return { books, shipById, knownSellers };
}

function buildMatchReport(files, books, shipById, knownSellers) {
  const keyIndex = new Map(); // seller|title|option -> [books]
  const titleIndex = new Map(); // seller|title -> Set(options)
  books.forEach((book) => {
    const ship = shipById.get(book.shipment_id);
    const seller = norm(ship?.seller_name);
    const fullKey = `${seller}${norm(book.title)}${norm(book.option)}`;
    if (!keyIndex.has(fullKey)) keyIndex.set(fullKey, []);
    keyIndex.get(fullKey).push(book);
    const titleKey = `${seller}${norm(book.title)}`;
    if (!titleIndex.has(titleKey)) titleIndex.set(titleKey, new Set());
    titleIndex.get(titleKey).add(norm(book.option));
  });

  const consumed = new Map();
  const commitItems = [];
  const groups = [];
  const counts = {
    settle: 0,
    already: 0,
    priceDiff: 0,
    notFound: 0,
    optionMismatch: 0,
    ambiguous: 0,
    discarded: 0,
  };

  files.forEach((file) => {
    const fileSeller = norm(file.seller);
    const reportRows = [];
    file.rows.forEach((row) => {
      const seller = norm(row.seller) || fileSeller;
      const title = norm(row.title);
      const option = norm(row.option);
      const amount = toAmount(row.price);
      const fullKey = `${seller}${title}${option}`;
      const candidates = keyIndex.get(fullKey) || [];
      const used = consumed.get(fullKey) || 0;
      consumed.set(fullKey, used + 1);

      let outcome;
      let book = null;
      let note = "";

      if (!knownSellers.has(seller)) {
        outcome = "not_found";
        counts.notFound += 1;
        note = "이 셀러의 수거건을 찾지 못했습니다.";
      } else if (candidates.length === 0) {
        const titleKey = `${seller}${title}`;
        if (titleIndex.has(titleKey)) {
          outcome = "option_mismatch";
          counts.optionMismatch += 1;
          const opts = [...titleIndex.get(titleKey)].filter(Boolean).sort();
          note = `옵션 불일치 — 보유 옵션: ${opts.join(", ") || "(옵션 없음)"}`;
        } else {
          outcome = "not_found";
          counts.notFound += 1;
          note = "제목이 일치하는 책이 없습니다.";
        }
      } else if (used >= candidates.length) {
        outcome = "ambiguous";
        counts.ambiguous += 1;
        note = `엑셀 행이 일치 책 수(${candidates.length})보다 많습니다.`;
      } else {
        book = candidates[used];
        if (book.status === "discarded") {
          outcome = "discarded";
          counts.discarded += 1;
          note = "폐기 상태 — 정산 제외";
        } else {
          outcome = book.status === "settled" ? "already" : "settle";
          counts[outcome] += 1;
          commitItems.push({ book_id: book.id, sale_amount: amount });
          if (book.price != null && amount > 0 && Number(book.price) !== amount) {
            counts.priceDiff += 1;
            note = `가격: 등록 ${formatCurrency(book.price)} → 엑셀 ${formatCurrency(amount)}`;
          }
        }
      }

      reportRows.push({
        title,
        option,
        amount,
        outcome,
        note,
        bookId: book?.id ?? null,
        status: book?.status ?? null,
      });
    });

    groups.push({ seller: fileSeller, fileName: file.name, rows: reportRows });
  });

  return { groups, commitItems, counts };
}

function AdminManualSettlementsPage() {
  // --- 업로드/매칭 상태 ---
  const [files, setFiles] = useState([]);
  const [matchReport, setMatchReport] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [updatePrice, setUpdatePrice] = useState(false);
  const [batchLabel, setBatchLabel] = useState(() => new Date().toISOString().slice(0, 10));
  const fileInputRef = useRef(null);

  // --- 내역(관리) 상태 ---
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState("unpaid");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [busyAction, setBusyAction] = useState("");
  const [toast, setToast] = useState(null);
  const requestIdRef = useRef(0);

  const showToast = useCallback((message, tone = "info") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const summaryCards = [
    { label: "미지급", value: `${summary.unpaid_count ?? 0}건`, hint: formatCurrency(summary.unpaid_amount ?? 0) },
    { label: "지급완료", value: `${summary.paid_count ?? 0}건`, hint: formatCurrency(summary.paid_amount ?? 0) },
    { label: "전체", value: `${summary.all_count ?? 0}건`, hint: formatCurrency(summary.all_amount ?? 0) },
  ];

  const loadList = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setRows([]);
      setSummary({});
      setTotalCount(0);
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    const { data, error } = await supabase.rpc("admin_list_manual_settlements", {
      p_search: search.trim() || null,
      p_status: statusFilter === "all" ? null : statusFilter,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    });

    if (requestId !== requestIdRef.current) {
      return;
    }

    if (error) {
      showToast(error.message || "수동 정산 내역을 불러오지 못했습니다.", "error");
      setRows([]);
      setSummary({});
      setTotalCount(0);
      setIsLoading(false);
      return;
    }

    setRows(Array.isArray(data?.rows) ? data.rows : []);
    setSummary(data?.summary ?? {});
    setTotalCount(Number(data?.total_count ?? 0));
    setSelectedIds((current) => current.filter((id) => (data?.rows ?? []).some((row) => row.id === id)));
    setIsLoading(false);
  }, [page, search, showToast, statusFilter]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadList();
    }, 180);
    return () => window.clearTimeout(timerId);
  }, [loadList]);

  const handleFilesSelected = async (fileList) => {
    const selected = Array.from(fileList || []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!selected.length) return;

    setIsParsing(true);
    try {
      const parsed = [];
      for (const file of selected) {
        const raw = await readSheetRowsAsObjects(file);
        const hasSellerCol = raw.length > 0 && pickField(raw[0], SELLER_ALIASES) !== undefined;
        const fileRows = raw
          .map((obj) => ({
            title: norm(pickField(obj, TITLE_ALIASES)),
            option: norm(pickField(obj, OPTION_ALIASES)),
            price: pickField(obj, PRICE_ALIASES),
            seller: norm(pickField(obj, SELLER_ALIASES)),
          }))
          .filter((row) => row.title);
        parsed.push({
          name: file.name,
          seller: deriveSellerFromFilename(file.name),
          hasSellerCol,
          rows: fileRows,
        });
      }
      setFiles((previous) => [...previous, ...parsed]);
      setMatchReport(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "엑셀을 읽지 못했습니다.", "error");
    } finally {
      setIsParsing(false);
    }
  };

  const updateFileSeller = (index, value) => {
    setFiles((previous) => previous.map((file, idx) => (idx === index ? { ...file, seller: value } : file)));
    setMatchReport(null);
  };

  const removeFile = (index) => {
    setFiles((previous) => previous.filter((_file, idx) => idx !== index));
    setMatchReport(null);
  };

  const runMatch = async () => {
    if (!files.length || !supabase) return;
    setIsMatching(true);
    try {
      const sellerNames = new Set();
      files.forEach((file) => {
        if (norm(file.seller)) sellerNames.add(norm(file.seller));
        file.rows.forEach((row) => {
          if (norm(row.seller)) sellerNames.add(norm(row.seller));
        });
      });
      const { books, shipById, knownSellers } = await fetchSellerBooks([...sellerNames]);
      setMatchReport(buildMatchReport(files, books, shipById, knownSellers));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "매칭에 실패했습니다.", "error");
    } finally {
      setIsMatching(false);
    }
  };

  const commitSettlement = async () => {
    if (!matchReport?.commitItems?.length || !supabase) return;
    setIsCommitting(true);
    const batch = batchLabel.trim() || null;
    const items = matchReport.commitItems.map((item) => ({ ...item, batch_label: batch }));
    const { data, error } = await supabase.rpc("admin_commit_manual_settlement", {
      p_items: items,
      p_update_price: updatePrice,
    });
    setIsCommitting(false);

    if (error) {
      showToast(error.message || "정산 처리에 실패했습니다.", "error");
      return;
    }

    const created = (data?.record_created ?? 0) + (data?.record_updated ?? 0);
    const priceMsg = data?.price_updated_count ? ` 가격 ${data.price_updated_count}건 갱신.` : "";
    // 회원 주문 책이 섞였을 때 서버가 자동 처리한 내역을 운영자에게 그대로 알린다.
    const autoCancelMsg = data?.auto_settlement_cancelled
      ? ` 자동 정산 ${data.auto_settlement_cancelled}건 자동 취소(이중 지급 방지).`
      : "";
    const autoSettledMsg = data?.skipped_auto_settled_count
      ? ` 이미 자동 정산 완료된 ${data.skipped_auto_settled_count}권 제외.`
      : "";
    showToast(
      `${data?.settled_count ?? 0}권 정산완료 처리 · 정산기록 ${created}건.${priceMsg}${autoCancelMsg}${autoSettledMsg}`,
      "success",
    );
    setFiles([]);
    setMatchReport(null);
    setStatusFilter("unpaid");
    setPage(1);
    await loadList();
  };

  const downloadTemplate = async () => {
    try {
      await exportRowsToXlsx({
        rows: [
          { Title: "2025 시대인재 서바이벌 모의고사 국어", Option: "8", Price: 5000 },
          { Title: "메가스터디 시발점 수학(하) 현우진T", Option: "", Price: 10000 },
        ],
        columns: [
          { key: "Title", header: "Title", width: 40 },
          { key: "Option", header: "Option", width: 16 },
          { key: "Price", header: "Price", type: Number, width: 12 },
        ],
        fileName: "subook-manual-settlement-template.xlsx",
        sheetName: "manual_settlement",
      });
    } catch (_error) {
      showToast("템플릿을 생성하지 못했습니다.", "error");
    }
  };

  const setPaid = async (ids, paid) => {
    if (!ids.length || !supabase) return;
    setBusyAction(paid ? "pay" : "unpay");
    const { data, error } = await supabase.rpc("admin_set_manual_settlement_paid", {
      p_ids: ids,
      p_paid: paid,
    });
    setBusyAction("");
    if (error) {
      showToast(error.message || "상태 변경에 실패했습니다.", "error");
      return;
    }
    showToast(`${data?.updated_count ?? 0}건을 ${paid ? "지급완료" : "미지급"}로 변경했습니다.`, "success");
    await loadList();
  };

  const revertBooks = async (bookIds) => {
    if (!bookIds.length || !supabase) return;
    if (!window.confirm(`${bookIds.length}권을 판매중(on_sale)으로 되돌리고 정산기록을 취소합니다. 계속할까요?`)) {
      return;
    }
    setBusyAction("revert");
    const { data, error } = await supabase.rpc("admin_revert_settled_books", {
      p_book_ids: bookIds,
    });
    setBusyAction("");
    if (error) {
      showToast(error.message || "되돌리기에 실패했습니다.", "error");
      return;
    }
    showToast(
      `${data?.reverted_books ?? 0}권 판매중 복귀 · 정산기록 ${data?.cancelled_records ?? 0}건 취소.`,
      "success",
    );
    setSelectedIds([]);
    await loadList();
  };

  const toggleRow = (id) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.includes(row.id));
  const toggleVisible = () => {
    setSelectedIds(allVisibleSelected ? [] : rows.map((row) => row.id));
  };

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.id)),
    [rows, selectedIds],
  );
  const selectedUnpaidIds = selectedRows.filter((row) => row.status === "unpaid").map((row) => row.id);
  const selectedPaidIds = selectedRows.filter((row) => row.status === "paid").map((row) => row.id);

  const totalRows = files.reduce((sum, file) => sum + file.rows.length, 0);

  return (
    <AdminShell
      activeModule="settlements"
      actions={
        <button className="btn-secondary !w-auto !px-3 !py-2 text-xs" onClick={downloadTemplate} type="button">
          템플릿 다운로드
        </button>
      }
      description="식스샵(구 사이트)·오프라인 판매분을 엑셀로 일괄 정산 처리하고, 셀러 입금 여부를 추적합니다."
      summaryCards={summaryCards}
      title="정산"
    >
      {/* R1 IA 개편: 자동/수동 정산을 사이드바 메뉴 2개 대신 한 메뉴의 탭으로 */}
      <AdminPageTabs
        activeKey="manual"
        tabs={[
          { key: "auto", label: "자동 정산", hint: "회원 주문", to: "/admin/settlements" },
          { key: "manual", label: "수동 정산", hint: "식스샵 구매분" },
        ]}
      />

      {/* 1) 업로드 */}
      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-900">엑셀 업로드 & 정산 확정</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">
              파일명을 셀러명으로 인식합니다(예: <span className="font-mono">6.9 어드민정산_홍길동.xlsx</span>). 컬럼: Title / Option / Price.
              여러 파일을 한 번에 올릴 수 있습니다.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              accept=".xlsx,.xls,.csv"
              className="hidden"
              multiple
              onChange={(event) => handleFilesSelected(event.target.files)}
              ref={fileInputRef}
              type="file"
            />
            <button
              className="btn-secondary !w-auto !px-3 !py-2 text-xs"
              disabled={isParsing}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              {isParsing ? "읽는 중..." : "엑셀 선택"}
            </button>
          </div>
        </div>

        {files.length > 0 ? (
          <div className="space-y-2">
            <div className="overflow-x-auto rounded-lg border border-slate-100">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">파일</th>
                    <th className="px-3 py-2">셀러명</th>
                    <th className="px-3 py-2 text-right">행 수</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {files.map((file, index) => (
                    <tr className="border-b border-slate-50" key={`${file.name}-${index}`}>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{file.name}</td>
                      <td className="px-3 py-2">
                        <input
                          className="input-base !h-9 !w-40 !py-1 text-sm"
                          onChange={(event) => updateFileSeller(index, event.target.value)}
                          placeholder="셀러명"
                          value={file.seller}
                        />
                        {file.hasSellerCol ? (
                          <span className="ml-2 text-[11px] font-semibold text-sky-600">행별 셀러 컬럼 사용</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{file.rows.length}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          className="text-xs font-semibold text-rose-600 hover:underline"
                          onClick={() => removeFile(index)}
                          type="button"
                        >
                          제거
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="btn-secondary !w-auto !px-4 !py-2 text-sm"
                disabled={isMatching || totalRows === 0}
                onClick={runMatch}
                type="button"
              >
                {isMatching ? "매칭 중..." : `매칭 검토 (${totalRows}행)`}
              </button>
              <button
                className="text-xs font-semibold text-slate-500 hover:underline"
                onClick={() => {
                  setFiles([]);
                  setMatchReport(null);
                }}
                type="button"
              >
                전체 비우기
              </button>
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-medium text-slate-400">
            업로드한 파일이 없습니다.
          </p>
        )}
      </section>

      {/* 2) 매칭 리포트 */}
      {matchReport ? (
        <section className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-black text-slate-900">매칭 결과</h2>
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-md bg-emerald-100 px-2 py-1 text-emerald-800">정산 {matchReport.counts.settle}</span>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">이미정산 {matchReport.counts.already}</span>
              {matchReport.counts.priceDiff ? (
                <span className="rounded-md bg-amber-100 px-2 py-1 text-amber-800">가격차이 {matchReport.counts.priceDiff}</span>
              ) : null}
              <span className="rounded-md bg-rose-100 px-2 py-1 text-rose-700">
                미매칭 {matchReport.counts.notFound + matchReport.counts.optionMismatch + matchReport.counts.ambiguous + matchReport.counts.discarded}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {matchReport.groups.map((group) => (
              <div className="rounded-lg border border-slate-100" key={`${group.fileName}`}>
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-sm font-black text-slate-800">
                    {group.seller || "(셀러 미상)"}
                    <span className="ml-2 font-mono text-[11px] font-medium text-slate-400">{group.fileName}</span>
                  </p>
                  <p className="text-xs font-semibold text-slate-500">{group.rows.length}행</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <tbody>
                      {group.rows.map((row, rowIndex) => {
                        const meta = OUTCOME_META[row.outcome] ?? OUTCOME_META.not_found;
                        return (
                          <tr className="border-b border-slate-50 align-top" key={rowIndex}>
                            <td className="px-3 py-2">
                              <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${meta.tone}`}>
                                {meta.label}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <p className="font-semibold text-slate-800">{row.title}</p>
                              {row.note ? <p className="mt-0.5 text-xs text-rose-500">{row.note}</p> : null}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-500">{row.option || "-"}</td>
                            <td className="px-3 py-2 text-right font-semibold">{formatCurrency(row.amount)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                배치 라벨
                <input
                  className="input-base !h-9 !w-36 !py-1 text-sm"
                  onChange={(event) => setBatchLabel(event.target.value)}
                  placeholder="2026-06-09"
                  value={batchLabel}
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                <input checked={updatePrice} onChange={(event) => setUpdatePrice(event.target.checked)} type="checkbox" />
                엑셀 판매가로 books.price 갱신
              </label>
            </div>
            <button
              className="btn-primary !w-auto !px-5 !py-2.5 text-sm"
              disabled={isCommitting || matchReport.commitItems.length === 0}
              onClick={commitSettlement}
              type="button"
            >
              {isCommitting
                ? "처리 중..."
                : `정산 확정 (${matchReport.commitItems.length}권)`}
            </button>
          </div>
        </section>
      ) : null}

      {/* 3) 내역(입금 추적) */}
      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-black text-slate-900">수동 정산 내역</h2>
          <p className="text-xs font-medium text-slate-500">
            입금 여부는 운영자가 직접 표시합니다. (책 상태와 별개로 추적)
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((option) => (
              <button
                className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                  statusFilter === option.value
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                }`}
                key={option.value}
                onClick={() => {
                  setStatusFilter(option.value);
                  setSelectedIds([]);
                  setPage(1);
                }}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="flex-1 min-w-[220px]">
            <span className="block text-xs font-semibold text-slate-600 mb-1.5">검색어</span>
            <input
              className="input-base !w-full"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="셀러명, 교재명, 연락처"
              type="search"
              value={search}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold text-slate-500">
            총 {totalCount}건 · 선택 {selectedIds.length}건
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary !w-auto !px-4 !py-2 text-sm"
              disabled={!selectedUnpaidIds.length || busyAction !== ""}
              onClick={() => setPaid(selectedUnpaidIds, true)}
              type="button"
            >
              {busyAction === "pay" ? "처리 중..." : `지급완료 (${selectedUnpaidIds.length})`}
            </button>
            <button
              className="btn-secondary !w-auto !px-4 !py-2 text-sm"
              disabled={!selectedPaidIds.length || busyAction !== ""}
              onClick={() => setPaid(selectedPaidIds, false)}
              type="button"
            >
              {busyAction === "unpay" ? "처리 중..." : `미지급 되돌리기 (${selectedPaidIds.length})`}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-100">
          {isLoading ? (
            <div className="p-8 text-center text-sm font-semibold text-slate-400">불러오는 중...</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm font-semibold text-slate-400">정산 내역이 없습니다.</div>
          ) : (
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">
                    <input checked={allVisibleSelected} onChange={toggleVisible} type="checkbox" />
                  </th>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">셀러</th>
                  <th className="px-4 py-3">교재</th>
                  <th className="px-4 py-3 text-right">판매가</th>
                  <th className="px-4 py-3 text-right">예상 정산액</th>
                  <th className="px-4 py-3">배치</th>
                  <th className="px-4 py-3">관리</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-b border-slate-50 align-top hover:bg-slate-50" key={row.id}>
                    <td className="px-4 py-3">
                      <input checked={selectedIds.includes(row.id)} onChange={() => toggleRow(row.id)} type="checkbox" />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${
                          row.status === "paid"
                            ? "bg-emerald-100 text-emerald-800"
                            : row.status === "cancelled"
                              ? "bg-slate-100 text-slate-500"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {row.status === "paid" ? "지급완료" : row.status === "cancelled" ? "취소" : "미지급"}
                      </span>
                      {row.status === "paid" && row.paid_at ? (
                        <p className="mt-1 text-xs text-slate-400">{formatDate(row.paid_at)}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{row.seller_name || "(미상)"}</p>
                      {row.seller_phone ? <p className="mt-1 text-xs text-slate-400">{row.seller_phone}</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <p className="max-w-[320px] font-semibold text-slate-900">
                        {row.book_title}
                        {row.book_option ? <span className="text-slate-400"> · {row.book_option}</span> : null}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">Book #{row.book_id}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrency(row.sale_amount)}</td>
                    <td className="px-4 py-3 text-right text-base font-black text-slate-950">
                      {formatCurrency(row.net_amount)}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-500">{row.batch_label || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {row.status === "unpaid" ? (
                          <button
                            className="btn-primary !w-auto !px-3 !py-1.5 text-xs"
                            disabled={busyAction !== ""}
                            onClick={() => setPaid([row.id], true)}
                            type="button"
                          >
                            지급완료
                          </button>
                        ) : null}
                        {row.status === "paid" ? (
                          <button
                            className="btn-secondary !w-auto !px-3 !py-1.5 text-xs"
                            disabled={busyAction !== ""}
                            onClick={() => setPaid([row.id], false)}
                            type="button"
                          >
                            미지급
                          </button>
                        ) : null}
                        <button
                          className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                          disabled={busyAction !== ""}
                          onClick={() => revertBooks([row.book_id])}
                          type="button"
                        >
                          되돌리기
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <AdminPagination
          currentPage={page}
          isLoading={isLoading}
          onPageChange={setPage}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
        />
      </section>

      {toast ? (
        <div
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg px-5 py-3 text-sm font-bold shadow-lg ${
            toast.tone === "error" ? "bg-rose-600 text-white" : "bg-slate-950 text-white"
          }`}
          role="alert"
        >
          {toast.message}
        </div>
      ) : null}
    </AdminShell>
  );
}

export default AdminManualSettlementsPage;
