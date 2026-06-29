import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import { exportRowsToXlsx } from "../lib/excelFile";
import { getSellerLookupOrigin } from "../lib/portalLinks";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { formatDate } from "@shared-domain/format";
import { shipmentStatusLabel } from "@shared-domain/status";
import StatusBadge from "@shared-domain/StatusBadge";
import { useAdminBadgeCounts } from "../lib/useAdminBadgeCounts";

const PAGE_SIZE = 20;
const SHIPMENT_INDEX_PAGE_SIZE = 1000;
const BOOK_FETCH_PAGE_SIZE = 1000;
const INVENTORY_AUDIT_FILE_NAME_PREFIX = "subook-inventory-audit";
const INVENTORY_AUDIT_SHEET_NAME = "inventory_audit";
const INVENTORY_AUDIT_EXPORT_HEADERS = [
  "수거신청자",
  "상품명",
  "판매가",
  "옵션",
  "정산여부",
];

const shipmentStatusFilters = [
  { value: "scheduled", label: shipmentStatusLabel.scheduled },
  { value: "inspecting", label: shipmentStatusLabel.inspecting },
  { value: "inspected", label: shipmentStatusLabel.inspected },
];

function sanitizeSearchKeyword(value) {
  return String(value ?? "")
    .trim()
    .replace(/[,%()]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeAdminShipmentRows(rows = []) {
  return (rows ?? []).map((shipment) => ({
    ...shipment,
    book_count: shipment.book_count ?? 0,
  }));
}

function applyAdminShipmentFilters(query, { search, statuses, fromDate, toDate }) {
  let nextQuery = query;

  if (search) {
    nextQuery = nextQuery.or(`seller_name.ilike.%${search}%,seller_phone.ilike.%${search}%`);
  }

  if (statuses.length > 0) {
    nextQuery = nextQuery.in("status", statuses);
  }

  if (fromDate) {
    nextQuery = nextQuery.gte("pickup_date", fromDate);
  }

  if (toDate) {
    nextQuery = nextQuery.lte("pickup_date", toDate);
  }

  return nextQuery;
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

function collapseWhitespace(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function toNullableText(value) {
  const text = collapseWhitespace(value);
  return text === "" ? null : text;
}

function normalizeOptionalText(value) {
  const text = toNullableText(value);
  if (!text) {
    return null;
  }

  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u00d7\u2715]/g, "x")
    .replace(/\s+/g, "");
}

function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits || null;
}

function normalizeDateValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }

    const excelEpoch = Date.UTC(1899, 11, 30);
    const nextDate = new Date(excelEpoch + Math.trunc(value) * 24 * 60 * 60 * 1000);
    if (Number.isNaN(nextDate.getTime())) {
      return null;
    }

    return nextDate.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const isoLikeMatch = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (isoLikeMatch) {
    const [, year, month, day] = isoLikeMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function getInventoryAuditStatusLabel(status) {
  return status === "settled" ? "정산완료" : "미정산";
}

function buildInventoryAuditGroupKey(book) {
  const hasOption = Boolean(toNullableText(book.option));

  return JSON.stringify([
    book.shipment_id ?? "",
    normalizeOptionalText(book.title) ?? "",
    book.price ?? "",
    book.status ?? "",
    hasOption ? "option-group" : `book-${book.id}`,
  ]);
}

function formatInventoryAuditOptionText(optionValues) {
  return optionValues
    .map((value) => toNullableText(value))
    .filter((value) => value !== null)
    .join(",");
}

function compareInventoryAuditRows(a, b) {
  const sellerCompare = a.sellerName.localeCompare(b.sellerName, "ko-KR");
  if (sellerCompare !== 0) {
    return sellerCompare;
  }

  if (a.shipmentId !== b.shipmentId) {
    return a.shipmentId - b.shipmentId;
  }

  const titleCompare = a.title.localeCompare(b.title, "ko-KR");
  if (titleCompare !== 0) {
    return titleCompare;
  }

  const priceA = typeof a.price === "number" ? a.price : -1;
  const priceB = typeof b.price === "number" ? b.price : -1;
  if (priceA !== priceB) {
    return priceA - priceB;
  }

  const statusCompare = a.settlementStatus.localeCompare(b.settlementStatus, "ko-KR");
  if (statusCompare !== 0) {
    return statusCompare;
  }

  return a.firstBookId - b.firstBookId;
}

function getInventoryAuditFileName() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${INVENTORY_AUDIT_FILE_NAME_PREFIX}-${year}-${month}-${day}.xlsx`;
}

function AdminDashboardPage({ view = "overview" }) {
  const navigate = useNavigate();
  const sellerPortalUrl = getSellerLookupOrigin();
  const shipmentFetchRequestRef = useRef(0);
  const shipmentOverviewRequestRef = useRef(0);
  const badgeCounts = useAdminBadgeCounts();

  const [shipments, setShipments] = useState([]);
  const [shipmentOverview, setShipmentOverview] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isInventoryExporting, setIsInventoryExporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [appliedStatuses, setAppliedStatuses] = useState([]);
  const [pickupDateFromInput, setPickupDateFromInput] = useState("");
  const [pickupDateToInput, setPickupDateToInput] = useState("");
  const [appliedPickupDateFrom, setAppliedPickupDateFrom] = useState("");
  const [appliedPickupDateTo, setAppliedPickupDateTo] = useState("");
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
  const shipmentOverviewSource = useMemo(() => {
    if (shipmentOverview.length > 0 || totalCount === 0) {
      return shipmentOverview;
    }

    return shipments;
  }, [shipmentOverview, shipments, totalCount]);
  const shipmentStatusSummary = useMemo(
    () =>
      shipmentOverviewSource.reduce(
        (accumulator, shipment) => {
          if (shipment.status === "scheduled") {
            accumulator.scheduled += 1;
          } else if (shipment.status === "inspecting") {
            accumulator.inspecting += 1;
          } else if (shipment.status === "inspected") {
            accumulator.inspected += 1;
          }

          return accumulator;
        },
        { scheduled: 0, inspecting: 0, inspected: 0 },
      ),
    [shipmentOverviewSource],
  );
  const inspectionPriorityShipments = useMemo(
    () =>
      shipmentOverviewSource
        .filter((shipment) => shipment.status === "scheduled" || shipment.status === "inspecting")
        .slice(0, 3),
    [shipmentOverviewSource],
  );
  const activePickupFilterSummary = useMemo(() => {
    const parts = [];

    if (appliedSearch) {
      parts.push(`검색: ${appliedSearch}`);
    }
    if (appliedStatuses.length > 0) {
      parts.push(
        `상태: ${appliedStatuses.map((status) => shipmentStatusLabel[status] ?? status).join(", ")}`,
      );
    }
    if (appliedPickupDateFrom || appliedPickupDateTo) {
      const fromLabel = appliedPickupDateFrom || "전체";
      const toLabel = appliedPickupDateTo || "전체";
      parts.push(`수거일: ${fromLabel} ~ ${toLabel}`);
    }

    return parts.join(" · ") || "현재 목록 기준 운영 건수";
  }, [appliedPickupDateFrom, appliedPickupDateTo, appliedSearch, appliedStatuses]);
  const dashboardSummaryCards = useMemo(
    () => [
      {
        label: "전체 수거건",
        value: `${totalCount}건`,
        hint: activePickupFilterSummary,
      },
      {
        label: "검수 대기",
        value: `${shipmentStatusSummary.scheduled}건`,
        tone: "brand",
        hint: "수거예정 상태의 작업",
      },
      {
        label: "검수 진행",
        value: `${shipmentStatusSummary.inspecting}건`,
        tone: "warning",
        hint: "상세 페이지에서 책 등록 및 검수 진행",
      },
      {
        label: "검수 완료",
        value: `${shipmentStatusSummary.inspected}건`,
        tone: "success",
        hint: "공개 스토어 준비가 끝난 수거 건",
      },
    ],
    [
      activePickupFilterSummary,
      shipmentStatusSummary.inspecting,
      shipmentStatusSummary.inspected,
      shipmentStatusSummary.scheduled,
      totalCount,
    ],
  );
  const activeInspectionShipments = useMemo(
    () =>
      shipments.filter(
        (shipment) => shipment.status === "scheduled" || shipment.status === "inspecting",
      ),
    [shipments],
  );
  const inspectedShipments = useMemo(
    () => shipments.filter((shipment) => shipment.status === "inspected"),
    [shipments],
  );
  const pageConfig = {
    overview: {
      activeModule: "overview",
      title: "개요",
      description: "",
      summaryCards: dashboardSummaryCards,
    },
    pickups: {
      activeModule: "pickups",
      title: "수거",
      description: "",
      summaryCards: [],
    },
    inspection: {
      activeModule: "inspection",
      title: "검수",
      description: "",
      summaryCards: [
        { label: "수거예정", value: `${shipmentStatusSummary.scheduled}건` },
        { label: "검수중", value: `${shipmentStatusSummary.inspecting}건` },
        { label: "검수완료", value: `${shipmentStatusSummary.inspected}건` },
      ],
    },
    catalog: {
      activeModule: "catalog",
      title: "상품",
      description: "",
      summaryCards: [],
    },
    settlements: {
      activeModule: "settlements",
      title: "정산",
      description: "",
      summaryCards: [],
    },
  }[view] ?? {
    activeModule: "overview",
    title: "개요",
    description: "",
    summaryCards: dashboardSummaryCards,
  };

  const fetchShipmentOverview = async ({ searchKeyword, statuses, fromDate, toDate } = {}) => {
    if (!isSupabaseConfigured) {
      return;
    }

    const requestId = shipmentOverviewRequestRef.current + 1;
    shipmentOverviewRequestRef.current = requestId;
    const search = searchKeyword ?? appliedSearch;
    const nextStatuses = statuses ?? appliedStatuses;
    const nextFromDate = fromDate ?? appliedPickupDateFrom;
    const nextToDate = toDate ?? appliedPickupDateTo;

    setShipmentOverview([]);

    const loadOverviewViaRpc = async () => {
      const overviewRows = [];
      let offset = 0;
      let totalCountFromRpc = null;

      while (totalCountFromRpc === null || offset < totalCountFromRpc) {
        const { data, error: rpcError } = await supabase.rpc("list_admin_shipments", {
          p_search: search || null,
          p_statuses: nextStatuses.length > 0 ? nextStatuses : null,
          p_from_date: nextFromDate || null,
          p_to_date: nextToDate || null,
          p_limit: SHIPMENT_INDEX_PAGE_SIZE,
          p_offset: offset,
        });

        if (requestId !== shipmentOverviewRequestRef.current) {
          return null;
        }

        if (rpcError) {
          return null;
        }

        const normalizedRows = normalizeAdminShipmentRows(data);
        overviewRows.push(...normalizedRows);
        totalCountFromRpc = normalizedRows[0]?.total_count ?? overviewRows.length;

        if (normalizedRows.length < SHIPMENT_INDEX_PAGE_SIZE) {
          break;
        }

        offset += normalizedRows.length;
      }

      return overviewRows;
    };

    const overviewFromRpc = await loadOverviewViaRpc();
    if (requestId !== shipmentOverviewRequestRef.current) {
      return;
    }

    if (overviewFromRpc !== null) {
      setShipmentOverview(overviewFromRpc);
      return;
    }

    const overviewRows = [];
    let offset = 0;
    let totalOverviewCount = null;

    while (totalOverviewCount === null || offset < totalOverviewCount) {
      const rangeEnd = offset + SHIPMENT_INDEX_PAGE_SIZE - 1;
      let fallbackQuery = supabase
        .from("shipments")
        .select("id, seller_name, seller_phone, pickup_date, status, created_at", { count: "exact" });

      fallbackQuery = applyAdminShipmentFilters(fallbackQuery, {
        search,
        statuses: nextStatuses,
        fromDate: nextFromDate,
        toDate: nextToDate,
      });

      const { data, error: fallbackError, count } = await fallbackQuery
        .order("pickup_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(offset, rangeEnd);

      if (requestId !== shipmentOverviewRequestRef.current) {
        return;
      }

      if (fallbackError) {
        setShipmentOverview([]);
        return;
      }

      const normalizedRows = normalizeAdminShipmentRows(data);
      overviewRows.push(...normalizedRows);
      totalOverviewCount = count ?? overviewRows.length;

      if (normalizedRows.length < SHIPMENT_INDEX_PAGE_SIZE) {
        break;
      }

      offset += normalizedRows.length;
    }

    if (requestId === shipmentOverviewRequestRef.current) {
      setShipmentOverview(overviewRows);
    }
  };

  const fetchShipments = async ({ page, searchKeyword, statuses, fromDate, toDate } = {}) => {
    if (!isSupabaseConfigured) {
      return;
    }

    const requestId = shipmentFetchRequestRef.current + 1;
    shipmentFetchRequestRef.current = requestId;
    const targetPage = page ?? currentPage;
    const search = searchKeyword ?? appliedSearch;
    const nextStatuses = statuses ?? appliedStatuses;
    const nextFromDate = fromDate ?? appliedPickupDateFrom;
    const nextToDate = toDate ?? appliedPickupDateTo;
    const offset = (targetPage - 1) * PAGE_SIZE;

    setIsLoading(true);
    setError("");

    const { data: rpcData, error: rpcError } = await supabase.rpc("list_admin_shipments", {
      p_search: search || null,
      p_statuses: nextStatuses.length > 0 ? nextStatuses : null,
      p_from_date: nextFromDate || null,
      p_to_date: nextToDate || null,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });

    if (requestId !== shipmentFetchRequestRef.current) {
      return;
    }

    if (!rpcError && Array.isArray(rpcData)) {
      setShipments(normalizeAdminShipmentRows(rpcData));
      setTotalCount(rpcData[0]?.total_count ?? 0);
      setIsLoading(false);
      return;
    }

    let query = supabase.from("shipments").select("*", { count: "exact" });
    query = applyAdminShipmentFilters(query, {
      search,
      statuses: nextStatuses,
      fromDate: nextFromDate,
      toDate: nextToDate,
    });

    const to = offset + PAGE_SIZE - 1;

    const { data, error: fetchError, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, to);

    if (requestId !== shipmentFetchRequestRef.current) {
      return;
    }

    if (fetchError) {
      setError("수거 목록을 불러오지 못했습니다.");
      setIsLoading(false);
      return;
    }

    setShipments(normalizeAdminShipmentRows(data));
    setTotalCount(count ?? 0);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchShipments({
      page: currentPage,
      searchKeyword: appliedSearch,
      statuses: appliedStatuses,
      fromDate: appliedPickupDateFrom,
      toDate: appliedPickupDateTo,
    });
  }, [appliedPickupDateFrom, appliedPickupDateTo, appliedSearch, appliedStatuses, currentPage]);

  useEffect(() => {
    // settlements view에서는 overview 데이터가 필요 없으므로 skip
    if (view === "settlements") return;
    void fetchShipmentOverview({
      searchKeyword: appliedSearch,
      statuses: appliedStatuses,
      fromDate: appliedPickupDateFrom,
      toDate: appliedPickupDateTo,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedPickupDateFrom, appliedPickupDateTo, appliedSearch, appliedStatuses, view]);

  useEffect(
    () => () => {
      shipmentFetchRequestRef.current += 1;
      shipmentOverviewRequestRef.current += 1;
    },
    [],
  );

  useEffect(() => {
    if (deleteCandidateId === null) {
      return;
    }

    const hasCandidate = shipments.some((shipment) => shipment.id === deleteCandidateId);
    if (!hasCandidate) {
      setDeleteCandidateId(null);
    }
  }, [deleteCandidateId, shipments]);

  const handleSearchSubmit = async (event) => {
    event.preventDefault();

    const nextSearch = sanitizeSearchKeyword(searchInput);
    const nextStatuses = [...selectedStatuses];
    const nextFromDate = pickupDateFromInput;
    const nextToDate = pickupDateToInput;
    setAppliedSearch(nextSearch);
    setAppliedStatuses(nextStatuses);
    setAppliedPickupDateFrom(nextFromDate);
    setAppliedPickupDateTo(nextToDate);
    setDeleteCandidateId(null);

    if (currentPage !== 1) {
      setCurrentPage(1);
      return;
    }

    await fetchShipments({
      page: 1,
      searchKeyword: nextSearch,
      statuses: nextStatuses,
      fromDate: nextFromDate,
      toDate: nextToDate,
    });
  };

  const handleSearchReset = async () => {
    setSearchInput("");
    setAppliedSearch("");
    setSelectedStatuses([]);
    setAppliedStatuses([]);
    setPickupDateFromInput("");
    setPickupDateToInput("");
    setAppliedPickupDateFrom("");
    setAppliedPickupDateTo("");
    setDeleteCandidateId(null);

    if (currentPage !== 1) {
      setCurrentPage(1);
      return;
    }

    await fetchShipments({
      page: 1,
      searchKeyword: "",
      statuses: [],
      fromDate: "",
      toDate: "",
    });
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

    await fetchShipmentOverview({
      searchKeyword: appliedSearch,
      statuses: appliedStatuses,
      fromDate: appliedPickupDateFrom,
      toDate: appliedPickupDateTo,
    });

    if (nextPage !== currentPage) {
      setCurrentPage(nextPage);
      return;
    }

    await fetchShipments({
      page: nextPage,
      searchKeyword: appliedSearch,
      statuses: appliedStatuses,
      fromDate: appliedPickupDateFrom,
      toDate: appliedPickupDateTo,
    });
  };

  const fetchShipmentIndex = async () => {
    const shipmentIndex = [];
    let from = 0;

    while (true) {
      const to = from + SHIPMENT_INDEX_PAGE_SIZE - 1;
      const { data, error: shipmentError } = await supabase
        .from("shipments")
        .select("id,seller_name,seller_phone,pickup_date")
        .order("id", { ascending: true })
        .range(from, to);

      if (shipmentError) {
        throw new Error("수거 목록을 불러오지 못했습니다.");
      }

      if (!data || data.length === 0) {
        break;
      }

      shipmentIndex.push(
        ...data.map((item) => ({
          ...item,
          sellerNameKey: normalizeOptionalText(item.seller_name),
          sellerPhoneKey: normalizePhone(item.seller_phone),
          pickupDateKey: normalizeDateValue(item.pickup_date),
        })),
      );

      if (data.length < SHIPMENT_INDEX_PAGE_SIZE) {
        break;
      }

      from += SHIPMENT_INDEX_PAGE_SIZE;
    }

    return shipmentIndex;
  };

  const fetchAllInventoryBooks = async () => {
    const books = [];
    let from = 0;

    while (true) {
      const to = from + BOOK_FETCH_PAGE_SIZE - 1;
      const { data, error: booksError } = await supabase
        .from("books")
        .select("id,shipment_id,title,option,status,price")
        .order("id", { ascending: true })
        .range(from, to);

      if (booksError) {
        throw new Error("재고 전수조사 대상 책 목록을 불러오지 못했습니다.");
      }

      if (!data || data.length === 0) {
        break;
      }

      books.push(...data);

      if (data.length < BOOK_FETCH_PAGE_SIZE) {
        break;
      }

      from += BOOK_FETCH_PAGE_SIZE;
    }

    return books;
  };

  const handleDownloadInventoryAudit = async () => {
    if (!isSupabaseConfigured) {
      setError("Supabase 환경 변수가 설정되지 않았습니다.");
      return;
    }

    setError("");
    setSuccess("");
    setIsInventoryExporting(true);

    try {
      const [shipmentIndex, books] = await Promise.all([
        fetchShipmentIndex(),
        fetchAllInventoryBooks(),
      ]);
      const shipmentMap = new Map(shipmentIndex.map((shipment) => [shipment.id, shipment]));
      const groupedRows = new Map();

      books.forEach((book) => {
        const shipment = shipmentMap.get(book.shipment_id);
        if (!shipment) {
          return;
        }

        const groupKey = buildInventoryAuditGroupKey(book);
        const existingRow = groupedRows.get(groupKey);

        if (existingRow) {
          existingRow.options.push(book.option);
          return;
        }

        groupedRows.set(groupKey, {
          shipmentId: shipment.id,
          sellerName: collapseWhitespace(shipment.seller_name),
          title: collapseWhitespace(book.title),
          price: book.price,
          options: [book.option],
          settlementStatus: getInventoryAuditStatusLabel(book.status),
          firstBookId: book.id,
        });
      });

      const exportRows = [...groupedRows.values()]
        .sort(compareInventoryAuditRows)
        .map((row) => ({
          [INVENTORY_AUDIT_EXPORT_HEADERS[0]]: row.sellerName,
          [INVENTORY_AUDIT_EXPORT_HEADERS[1]]: row.title,
          [INVENTORY_AUDIT_EXPORT_HEADERS[2]]: row.price ?? "",
          [INVENTORY_AUDIT_EXPORT_HEADERS[3]]: formatInventoryAuditOptionText(row.options),
          [INVENTORY_AUDIT_EXPORT_HEADERS[4]]: row.settlementStatus,
        }));

      if (exportRows.length === 0) {
        setError("다운로드할 책 데이터가 없습니다.");
        return;
      }

      await exportRowsToXlsx({
        rows: exportRows,
        columns: [
          { key: INVENTORY_AUDIT_EXPORT_HEADERS[0], header: INVENTORY_AUDIT_EXPORT_HEADERS[0], width: 18 },
          { key: INVENTORY_AUDIT_EXPORT_HEADERS[1], header: INVENTORY_AUDIT_EXPORT_HEADERS[1], width: 36 },
          {
            key: INVENTORY_AUDIT_EXPORT_HEADERS[2],
            header: INVENTORY_AUDIT_EXPORT_HEADERS[2],
            type: Number,
            width: 12,
          },
          { key: INVENTORY_AUDIT_EXPORT_HEADERS[3], header: INVENTORY_AUDIT_EXPORT_HEADERS[3], width: 28 },
          { key: INVENTORY_AUDIT_EXPORT_HEADERS[4], header: INVENTORY_AUDIT_EXPORT_HEADERS[4], width: 12 },
        ],
        fileName: getInventoryAuditFileName(),
        sheetName: INVENTORY_AUDIT_SHEET_NAME,
      });
      setSuccess(`${exportRows.length}행 재고 전수조사 엑셀을 다운로드했습니다.`);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "재고 전수조사 엑셀을 생성하지 못했습니다.",
      );
    } finally {
      setIsInventoryExporting(false);
    }
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
    <AdminShell
      activeModule={pageConfig.activeModule}
      summaryCards={pageConfig.summaryCards}
      description={pageConfig.description}
      title={pageConfig.title}
    >
      <div className="hidden">
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
      </div>

      {null}

      {!isSupabaseConfigured ? (
        <p className="notice-error mb-4">
          `.env` 파일에 `VITE_SUPABASE_ADMIN_URL`, `VITE_SUPABASE_ADMIN_ANON_KEY`를 설정해 주세요.
        </p>
      ) : null}

      {error ? <p className="notice-error">{error}</p> : null}
      {success ? <p className="notice-success">{success}</p> : null}

      {view === "overview" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { key: "pickups", label: "수거", to: "/admin/pickups", count: badgeCounts.pickups },
              { key: "inspection", label: "검수", to: "/admin/inspections", count: badgeCounts.inspection },
              { key: "orders", label: "주문", to: "/admin/orders", count: badgeCounts.orders },
              { key: "settlements", label: "정산", to: "/admin/settlements", count: badgeCounts.settlements },
              { key: "studio", label: "스튜디오", to: "/admin/studio", count: 0 },
            ].map((card) => {
              const numeric = Number.isFinite(card.count) ? card.count : 0;
              const accent = numeric > 0;
              return (
                <Link
                  className={`card flex items-center justify-between transition hover:shadow-md ${
                    accent ? "ring-2 ring-rose-500/40" : ""
                  }`}
                  key={card.key}
                  to={card.to}
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900">{card.label}</p>
                    <p
                      className={`mt-1 text-xs font-semibold ${
                        accent ? "text-rose-600" : "text-slate-400"
                      }`}
                    >
                      {card.key === "studio"
                        ? "촬영 작업"
                        : `처리 대기 ${numeric.toLocaleString("ko-KR")}건`}
                    </p>
                  </div>
                  <span
                    aria-hidden="true"
                    className={`text-lg font-black ${accent ? "text-rose-500" : "text-slate-300"}`}
                  >
                    →
                  </span>
                </Link>
              );
            })}
          </section>

          <section className="card">
            <div className="flex items-center justify-between gap-3">
              <h2 className="section-title">지금 처리할 수거 건</h2>
              <Link className="text-sm font-semibold text-brand" to="/admin/inspections">
                전체 보기
              </Link>
            </div>
            {inspectionPriorityShipments.length > 0 ? (
              <div className="mt-4 space-y-3">
                {inspectionPriorityShipments.map((shipment) => (
                  <Link
                    className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 transition hover:bg-slate-50"
                    key={shipment.id}
                    to={`/admin/shipments/${shipment.id}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{shipment.seller_name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {shipment.seller_phone} · {formatDate(shipment.pickup_date)}
                      </p>
                    </div>
                    <StatusBadge type="shipment" status={shipment.status} />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">표시할 수거 건이 없습니다.</p>
            )}
          </section>
        </>
      ) : null}

      {view === "inspection" ? (
        <>
          <section className="card">
            <h2 className="section-title">검수할 수거 건</h2>
            {activeInspectionShipments.length > 0 ? (
              <div className="mt-4 space-y-3">
                {activeInspectionShipments.map((shipment) => (
                  <Link
                    className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 transition hover:bg-slate-50"
                    key={shipment.id}
                    to={`/admin/shipments/${shipment.id}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{shipment.seller_name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {shipment.seller_phone} · {formatDate(shipment.pickup_date)}
                      </p>
                    </div>
                    <StatusBadge type="shipment" status={shipment.status} />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">검수할 수거 건이 없습니다.</p>
            )}
          </section>

          <section className="card">
            <h2 className="section-title">검수 완료</h2>
            {inspectedShipments.length > 0 ? (
              <div className="mt-4 space-y-3">
                {inspectedShipments.map((shipment) => (
                  <Link
                    className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 transition hover:bg-slate-50"
                    key={shipment.id}
                    to={`/admin/shipments/${shipment.id}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{shipment.seller_name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {shipment.seller_phone} · {formatDate(shipment.pickup_date)}
                      </p>
                    </div>
                    <StatusBadge type="shipment" status={shipment.status} />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">검수 완료 수거 건이 없습니다.</p>
            )}
          </section>
        </>
      ) : null}

      {view === "catalog" ? (
        <>
          <section className="card">
            <div className="flex items-center justify-between gap-3">
              <h2 className="section-title">재고 엑셀</h2>
              <button
                className="btn-primary !w-auto !px-4 !py-2.5 text-sm"
                disabled={isInventoryExporting}
                onClick={handleDownloadInventoryAudit}
                type="button"
              >
                {isInventoryExporting ? "생성 중..." : "다운로드"}
              </button>
            </div>
          </section>

          <section className="card">
            <h2 className="section-title">공개 상품 편집</h2>
            {inspectedShipments.length > 0 ? (
              <div className="mt-4 space-y-3">
                {inspectedShipments.map((shipment) => (
                  <Link
                    className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 transition hover:bg-slate-50"
                    key={shipment.id}
                    to={`/admin/shipments/${shipment.id}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{shipment.seller_name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {shipment.seller_phone} · {formatDate(shipment.pickup_date)}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">열기</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">편집할 수거 건이 없습니다.</p>
            )}
          </section>
        </>
      ) : null}

      {/* 4-view 분리: view 별로 필요한 섹션만 렌더. 거대 display:none 매트릭스 제거됨. */}
      {/* Hero overview banner — pickups view에서는 표시 안 함 (구 .admin-overview-view 동작 보존). 현재는 어떤 view에서도 렌더되지 않음. */}
      {false ? (
      <section className="admin-section-anchor space-y-4" id="overview">
        <div className="grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
          <div className="overflow-hidden rounded-[32px] border border-slate-900 bg-slate-950 p-6 text-white shadow-soft">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-200">
              Operations Flow
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              수거부터 공개 판매까지, 운영 흐름을 한 화면으로
            </h2>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-relaxed text-slate-300">
              기존에는 수거 등록 위주의 화면에 기능이 얹혀 있었다면, 이제는 앞으로 들어올 주문,
              회원, CS 기능까지 고려한 운영 콘솔 형태로 정리했습니다. 현재 구현된 작업은 바로
              실행하고, 아직 없는 모듈은 같은 정보 구조 안에서 준비 상태를 확인할 수 있습니다.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <a
                className="rounded-[24px] border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                href="#pickup-operations"
              >
                <p className="text-sm font-black">수거 관리</p>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-300">
                  등록, 검색, 목록 운영
                </p>
              </a>
              <a
                className="rounded-[24px] border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                href="#inspection-workspace"
              >
                <p className="text-sm font-black">검수 · 가격</p>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-300">
                  상세 검수와 공개 스토어 준비
                </p>
              </a>
              <a
                className="rounded-[24px] border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                href="#catalog-workspace"
              >
                <p className="text-sm font-black">상품 관리</p>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-300">
                  재고 점검과 상품 운영 흐름
                </p>
              </a>
              <Link
                className="rounded-[24px] border border-sky-400/20 bg-sky-400/10 p-4 transition hover:bg-sky-400/15"
                to="/admin/studio"
              >
                <p className="text-sm font-black">사진 스튜디오</p>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-sky-100">
                  이미지 가공과 다운로드를 분리 운영
                </p>
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <article className="card animate-rise">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                    오늘 우선순위
                  </p>
                  <h3 className="mt-2 text-xl font-black tracking-tight text-slate-950">
                    먼저 처리할 수거 건
                  </h3>
                </div>
                <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">
                  {inspectionPriorityShipments.length}건
                </span>
              </div>
              {inspectionPriorityShipments.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {inspectionPriorityShipments.map((shipment) => (
                    <Link
                      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-brand/40 hover:bg-white"
                      key={shipment.id}
                      to={`/admin/shipments/${shipment.id}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-900">
                          {shipment.seller_name}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {shipment.seller_phone} · {formatDate(shipment.pickup_date)}
                        </p>
                      </div>
                      <StatusBadge type="shipment" status={shipment.status} />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm font-semibold text-slate-500">
                  현재 페이지 기준으로 우선 처리할 수거 건이 없습니다.
                </p>
              )}
            </article>

            <article className="card animate-rise">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                앞으로 확장될 운영 모듈
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-black text-slate-900">주문 · 배송</p>
                  <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">
                    주문 상태 필터, 송장 입력, 반품/교환 흐름이 여기에 붙게 됩니다.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-black text-slate-900">회원 · CS</p>
                  <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">
                    회원 통합 조회, FAQ, 공지, 문의 응대 모듈이 같은 콘솔 구조를 따라 확장됩니다.
                  </p>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>
      ) : null}

      {view === "pickups" ? (
      <section className="admin-section-anchor space-y-4" id="pickup-operations">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              Pickup Operations
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">수거 관리</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              수거 등록, 판매자 검색, 목록 관리 기능을 하나의 작업 영역으로 정리했습니다.
            </p>
          </div>
          <a className="btn-secondary !w-auto !px-4 !py-2.5 text-xs" href="#inspection-workspace">
            검수 작업으로 이동
          </a>
        </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <section className="card animate-rise h-full">
          <h2 className="section-title">수거 등록</h2>
          <p className="mt-1 text-sm text-slate-500">
            셀러(고객) 생성과 교재 등록은 상품 등록 화면에서 한 번에 진행합니다.
          </p>
          <Link className="btn-primary mt-4 inline-flex w-full items-center justify-center" to="/admin/register">
            상품 등록 화면으로 이동 →
          </Link>
        </section>

        <section className="card animate-rise h-full">
          <h2 className="section-title">수거 목록 필터</h2>
          <p className="mt-1 text-sm text-slate-500">
            판매자 검색, 상태, 수거일 범위를 조합해 목록을 빠르게 좁힐 수 있습니다.
          </p>

          <form className="mt-3 space-y-4" onSubmit={handleSearchSubmit}>
            <label className="block">
              <span className="label">판매자 검색</span>
              <input
                className="input-base !mt-0 !py-2.5"
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="예: 홍길동 / 5678"
                type="text"
                value={searchInput}
              />
            </label>

            <div>
              <span className="label">상태</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {shipmentStatusFilters.map((statusFilter) => {
                  const isActive = selectedStatuses.includes(statusFilter.value);

                  return (
                    <button
                      className={`rounded-full border px-3 py-2 text-xs font-bold transition ${
                        isActive
                          ? "border-brand bg-brand text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                      key={statusFilter.value}
                      onClick={() =>
                        setSelectedStatuses((currentStatuses) =>
                          currentStatuses.includes(statusFilter.value)
                            ? currentStatuses.filter((status) => status !== statusFilter.value)
                            : [...currentStatuses, statusFilter.value],
                        )
                      }
                      type="button"
                    >
                      {statusFilter.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">수거 시작일</span>
                <input
                  className="input-base !mt-0 !py-2.5"
                  onChange={(event) => setPickupDateFromInput(event.target.value)}
                  type="date"
                  value={pickupDateFromInput}
                />
              </label>

              <label className="block">
                <span className="label">수거 종료일</span>
                <input
                  className="input-base !mt-0 !py-2.5"
                  onChange={(event) => setPickupDateToInput(event.target.value)}
                  type="date"
                  value={pickupDateToInput}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="btn-secondary !w-auto !shrink-0 !whitespace-nowrap !px-4 !py-2.5"
                type="submit"
              >
                필터 적용
              </button>
              <button
                className="btn-secondary !w-auto !shrink-0 !whitespace-nowrap !px-4 !py-2.5"
                onClick={handleSearchReset}
                type="button"
              >
                초기화
              </button>
            </div>
          </form>
        </section>
      </div>
      </section>
      ) : null}

      {/* 구 inspection/catalog/settlement-view 섹션: /admin 라우트의 하위 view에서는 더 이상 렌더되지 않음. 별도 라우트로 이관됨. 코드는 영향도 검토 후 따로 정리 예정. */}
      {false ? (
      <>
      <section className="admin-section-anchor space-y-4" id="inspection-workspace">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              Inspection Workspace
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              검수 · 가격 책정
            </h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              실제 검수와 가격 수정은 각 수거 상세에서 진행하고, 이 영역에서는 지금 어떤 상태의 작업이
              밀려 있는지와 다음 작업 우선순위를 확인합니다.
            </p>
          </div>
          <a className="btn-secondary !w-auto !px-4 !py-2.5 text-xs" href="#catalog-workspace">
            상품 운영 보기
          </a>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="card animate-rise">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                  수거예정
                </p>
                <p className="mt-2 text-2xl font-black text-slate-950">
                  {shipmentStatusSummary.scheduled}건
                </p>
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  입고 후 검수 시작이 필요한 건
                </p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">
                  검수중
                </p>
                <p className="mt-2 text-2xl font-black text-amber-950">
                  {shipmentStatusSummary.inspecting}건
                </p>
                <p className="mt-2 text-xs font-semibold text-amber-700">
                  책 등록과 가격 입력이 진행 중
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                  검수완료
                </p>
                <p className="mt-2 text-2xl font-black text-emerald-950">
                  {shipmentStatusSummary.inspected}건
                </p>
                <p className="mt-2 text-xs font-semibold text-emerald-700">
                  공개 스토어 정보 입력 가능
                </p>
              </div>
            </div>
          </article>

          <article className="card animate-rise">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              현재 검수 흐름
            </p>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-black text-slate-900">1. 수거 상세 진입</p>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">
                  수거예정 또는 검수중 상태의 수거 건을 열어 책을 추가하고 판매가를 입력합니다.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-black text-slate-900">2. 공개 메타데이터 입력</p>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">
                  과목, 브랜드, 유형, 검수 메모와 이미지를 입력하면 공개 스토어에 바로 연결됩니다.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-black text-slate-900">3. 판매중/정산완료 관리</p>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">
                  판매 상태 변경과 정산 완료 처리는 상세 페이지와 정산 워크스페이스에서 이어집니다.
                </p>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="admin-section-anchor space-y-4" id="catalog-workspace">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              Catalog Workspace
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">상품 관리</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              현재는 재고 전수조사와 공개 스토어 메타데이터 중심으로 운영하고 있고, 이후 교재 DB와
              상품/재고 모듈을 이 영역으로 확장할 예정입니다.
            </p>
          </div>
          <Link className="btn-secondary !w-auto !px-4 !py-2.5 text-xs" to="/admin/studio">
            스튜디오 열기
          </Link>
        </div>

      <section className="card animate-rise mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="section-title">재고 전수조사 엑셀</h2>
            <p className="mt-1 text-sm text-slate-500">
              현재 DB 기준으로 수거신청자, 상품명, 판매가, 옵션, 정산여부를 엑셀로 내려받습니다.
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              같은 수거 건 안에서 동일한 상품명, 판매가, 정산상태의 옵션은 `상,하`처럼 쉼표로 묶어 한 줄로 정리합니다.
            </p>
          </div>

          <button
            className="btn-primary !w-auto !px-4 !py-2.5 text-sm"
            disabled={isInventoryExporting}
            onClick={handleDownloadInventoryAudit}
            type="button"
          >
            {isInventoryExporting ? "엑셀 생성 중..." : "엑셀 다운로드"}
          </button>
        </div>
      </section>

      </section>

      </>
      ) : null}

      {view === "pickups" ? (
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="section-title">수거 목록</h2>
          <p className="text-xs font-semibold text-slate-500">총 {totalCount}건</p>
        </div>

        {isLoading ? <p className="text-sm text-slate-500">불러오는 중...</p> : null}

        {!isLoading && shipments.length === 0 ? (
          <div className="card text-sm font-semibold text-slate-500">조회 결과가 없습니다.</div>
        ) : null}

        <div className="grid gap-3 lg:hidden">
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
                    <p className="truncate text-base font-bold text-slate-900">
                      {shipment.seller_name}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500">{shipment.seller_phone}</p>
                  </div>
                  <StatusBadge type="shipment" status={shipment.status} />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-600">
                  수거 일자: <span className="text-brand">{formatDate(shipment.pickup_date)}</span>
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  등록 교재: {shipment.book_count ?? 0}권
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

        <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft lg:block">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    판매자
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    연락처
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    수거 일자
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    교재수
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    상태
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shipments.map((shipment) => {
                  const isDeleteConfirmOpen = deleteCandidateId === shipment.id;
                  const isDeletingThisShipment = deletingShipmentId === shipment.id;
                  const isDeletePending = deletingShipmentId !== null;

                  return (
                    <tr
                      className={`align-top transition hover:bg-slate-50 ${
                        isDeleteConfirmOpen ? "bg-rose-50/40" : ""
                      }`}
                      key={shipment.id}
                    >
                      <td className="px-4 py-4">
                        <p className="font-bold text-slate-900">{shipment.seller_name}</p>
                      </td>
                      <td className="px-4 py-4 font-semibold text-slate-600">
                        {shipment.seller_phone}
                      </td>
                      <td className="px-4 py-4 font-semibold text-slate-600">
                        {formatDate(shipment.pickup_date)}
                      </td>
                      <td className="px-4 py-4 font-semibold text-slate-600">
                        {shipment.book_count ?? 0}권
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge type="shipment" status={shipment.status} />
                      </td>
                      <td className="min-w-[260px] px-4 py-4">
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      ) : null}

      {/* 구 admin-roadmap 섹션 — 4-view 분리 후 더 이상 렌더되지 않음. */}
      {false ? (
      <section className="grid gap-4 xl:grid-cols-3">
        <article className="card animate-rise admin-section-anchor" id="order-roadmap">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
            Planned Module
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">주문 · 배송</h2>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-500">
            FEATURE_SPEC 2.5 기준으로 주문 상태 필터, 송장 입력, 배송 추적, 반품/교환 처리가
            이 영역으로 추가될 예정입니다.
          </p>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs font-semibold leading-relaxed text-slate-500">
            다음 구현 후보: `orders / order_items` 모델, 송장 업로드, 주문 상세 패널
          </div>
        </article>

        <article className="card animate-rise admin-section-anchor" id="member-roadmap">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
            Planned Module
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">회원 관리</h2>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-500">
            회원 목록, 회원 상세, 판매/구매/정산 이력 통합 조회, 관리자 권한 분리가 이 영역으로
            연결됩니다.
          </p>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs font-semibold leading-relaxed text-slate-500">
            다음 구현 후보: 회원 검색 UI, 회원 타임라인, RBAC 단계화
          </div>
        </article>

        <article className="card animate-rise admin-section-anchor" id="cs-roadmap">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
            Planned Module
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">CS 관리</h2>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-500">
            문의 접수, FAQ, 공지사항, 알림 이력 관리가 한 묶음으로 들어오도록 운영 콘솔 구조를
            미리 분리해 두었습니다.
          </p>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs font-semibold leading-relaxed text-slate-500">
            다음 구현 후보: 문의 티켓 테이블, FAQ CMS, 공지 작성기
          </div>
        </article>
      </section>
      ) : null}

      {view === "pickups" && totalPages > 1 ? (
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
    </AdminShell>
  );
}

export default AdminDashboardPage;
