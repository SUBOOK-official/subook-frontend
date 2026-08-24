import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import AdminDialog from "../components/AdminDialog";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { formatCurrency } from "@shared-domain/format";
import { pickupRequestStatusLabel, shipmentStatusLabel } from "@shared-domain/status";
import { CheckIcon, CloseIcon, PlusIcon } from "../components/icons";
import { BOOK_TYPE_OPTIONS, BRAND_OPTIONS, SUBJECT_OPTIONS } from "../lib/productCategories";
import { MAX_DETAIL_PHOTOS } from "../lib/adminImageUpload";
import { BusyText, InlineLoading, LoadingOverlay } from "../components/Loading";
import {
  prepareStudioImagePayload,
  requestStudioGeneration,
  studioResultToFile,
} from "../lib/studioClient";
import { requestCoverScan } from "../lib/coverScanClient";

// 통합 상품 등록 플로우 (Frame 2~4 프로토타입).
//   고객(수거) 선택/생성 → 교재 목록 작성(기존 검색 + 신규 표) → 사진 일괄 → 등록 완료
//   교재 = products(카탈로그), 재고/권 = books(1권=1row), 고객 = shipments(소유)
//   할인/등급/메타 처리는 admin_register_customer_inventory RPC가 담당.

const COVER_BUCKET = "product-covers";
const DETAIL_BUCKET = "inspection-images";
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
// 기존 교재 검색 결과 상한 — RPC clamp(100) 이내. 상한에 걸리면 목록 하단에 안내 표시.
const PROD_SEARCH_LIMIT = 50;

const DISCOUNT_TYPES = [
  { value: "none", label: "정가" },
  { value: "amount", label: "정액(원)" },
  { value: "rate", label: "정률(%)" },
];

// 기존 교재 모달 전용 — 'none'은 정가 그대로가 아니라 "판매가 직접 입력" 의미라 라벨 분리
const FRAME_DISCOUNT_TYPES = [
  { value: "none", label: "직접 입력" },
  { value: "amount", label: "정액(원)" },
  { value: "rate", label: "정률(%)" },
];

// 신규 교재의 카테고리(과목/브랜드/유형) 선택지 — productCategories.js가 canonical.
// 빈 값("자동")이면 RPC가 상품명에서 파싱하고, 선택하면 파싱보다 우선한다.

// 카테고리 설정 모달의 필드 구성 (행 상태 키 ↔ 라벨 ↔ 선택지)
const CATEGORY_FIELDS = [
  { key: "subject", label: "과목", options: SUBJECT_OPTIONS },
  { key: "brand", label: "브랜드", options: BRAND_OPTIONS },
  { key: "bookType", label: "유형", options: BOOK_TYPE_OPTIONS },
];

let uidCounter = 0;
function nextUid() {
  uidCounter += 1;
  return `u${Date.now().toString(36)}-${uidCounter.toString(36)}`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function blankNewRow(location = "") {
  return {
    uid: nextUid(),
    title: "",
    subject: "",
    brand: "",
    bookType: "",
    option: "",
    // 같은 구성(옵션 세트)을 여러 권 등록할 때 — 옵션 수 × 수량 만큼 books 생성
    quantity: "1",
    location,
    // 비우면 시작 번호 순차 배정, 입력하면 이 행만 그 번호부터 배정
    serialOverride: "",
    originalPrice: "",
    discountType: "none",
    discountValue: "",
    coverUrl: "",
    coverBusy: false,
    detailUrls: [],
    detailBusy: false,
    // 신규 교재는 생사진을 올리는 경우가 대부분 → 표지 AI 자동 변환 기본 켜짐
    coverAutoStudio: true,
  };
}

// 기존 교재 모달의 신규 옵션 행 — 수량 1·기준 판매가 프리필.
// priceAuto: 수동으로 판매가를 고치기 전까지는 다른 행의 판매가 입력을 따라간다.
function blankNewOption(price = "", originalPrice = "") {
  return {
    option: "",
    quantity: "1",
    price,
    priceAuto: true,
    originalPrice,
    discountType: "none",
    discountValue: "",
  };
}

function isNewRowBlank(row) {
  return (
    !row.title.trim() &&
    !row.option.trim() &&
    !String(row.originalPrice).trim() &&
    !String(row.discountValue).trim()
  );
}

// ── 작성 중 임시 저장 ────────────────────────────────────────────────
// 등록은 한 배치에 수십 권이라 작성이 길어지는데, 새로고침·실수 이탈이면
// 전부 날아갔다 (2026-08-11 운영자 피드백). 입력이 바뀔 때마다 localStorage에
// 초안을 남기고, 다시 들어오면 복구한다. 업로드가 끝난 사진은 이미 스토리지
// URL이라 그대로 되살아난다.
const DRAFT_KEY = "subook.admin.register.draft.v1";
const DRAFT_SAVE_DELAY = 700;

function hydrateDraftRow(row) {
  return {
    ...blankNewRow(),
    ...row,
    uid: row?.uid || nextUid(),
    detailUrls: Array.isArray(row?.detailUrls) ? row.detailUrls : [],
    // 업로드 진행 플래그는 저장 시점의 잔재 — 복구할 때 항상 초기화
    coverBusy: false,
    detailBusy: false,
  };
}

function hydrateDraftAddition(addition) {
  return {
    ...addition,
    uid: addition?.uid || nextUid(),
    options: Array.isArray(addition?.options) ? addition.options : [],
    detailUrls: Array.isArray(addition?.detailUrls) ? addition.detailUrls : [],
    coverBusy: false,
    detailBusy: false,
  };
}

function loadDraft(shipmentIdParam) {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== "object") return null;
    // ?shipmentId=로 특정 고객에 들어온 경우, 다른 고객의 초안을 되살리면 안 된다
    if (shipmentIdParam && String(draft.shipment?.id ?? "") !== String(shipmentIdParam)) return null;
    const newRows = (Array.isArray(draft.newRows) ? draft.newRows : []).map(hydrateDraftRow);
    const existingAdditions = (Array.isArray(draft.existingAdditions) ? draft.existingAdditions : [])
      .filter((a) => a?.product?.id)
      .map(hydrateDraftAddition);
    if (!newRows.some((r) => !isNewRowBlank(r)) && existingAdditions.length === 0) return null;
    return { ...draft, newRows, existingAdditions };
  } catch {
    return null;
  }
}

function saveDraft(payload) {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // 저장소를 못 써도 등록 흐름은 계속돼야 한다
  }
}

function formatDraftTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(String(value).replaceAll(",", "").trim());
  return Number.isFinite(n) ? n : null;
}

// 정가 + 할인 → 판매가 (RPC _register_compute_price 와 동일 규칙)
function computeSellPrice(original, type, value) {
  const o = toNumber(original);
  if (o === null) return null;
  const v = toNumber(value);
  if (type === "amount" && v !== null) return Math.max(0, Math.round(o - v));
  if (type === "rate" && v !== null) return Math.max(0, Math.round(o * (1 - Math.min(Math.max(v, 0), 100) / 100)));
  return Math.round(o);
}

function sanitizeFileName(name) {
  return String(name || "image")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
}

async function uploadImageToBucket(bucket, file) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("JPG/PNG/WebP/GIF만 업로드 가능합니다.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("이미지는 15MB 이하여야 합니다.");
  }
  const path = `register/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${sanitizeFileName(file.name)}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false, cacheControl: "3600" });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

// AI 변환을 거친 표지는 파일명에 _studio가 붙는다(studioResultToFile).
function isStudioCover(url) {
  return /_studio\.[a-z0-9]+(\?|$)/i.test(String(url || ""));
}

function optionSummary(optionStr) {
  const items = String(optionStr || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items.join(", ") : "옵션 없음";
}

// 신규 교재 행 수량 — 비우거나 잘못 입력하면 1, 1~999로 클램프 (RPC와 동일 규칙)
function parseRowQuantity(value) {
  const n = toNumber(value);
  if (n === null) return 1;
  return Math.min(Math.max(Math.trunc(n), 1), 999);
}

// ── 일련번호 배정 미리보기 ──────────────────────────────────────────
// RPC(admin_register_customer_inventory)와 동일 규칙으로 권수를 세야
// 미리보기 번호와 실제 배정 번호가 어긋나지 않는다.
//   신규 교재: 콤마 옵션 수(없으면 1) × 행 수량
//   기존 교재: 옵션별 추가 수량 합
function countBooksForNewRow(row) {
  const optionCount = String(row.option || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean).length;
  return (optionCount > 0 ? optionCount : 1) * parseRowQuantity(row.quantity);
}

function countBooksForAddition(addition) {
  return addition.options.reduce((sum, o) => sum + (Number(o.quantity) || 0), 0);
}

// 시작 일련번호 입력값 → 유효한 양의 정수 또는 null
function parseSerialStart(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 999_999_999 ? n : null;
}

function formatSerialRange(from, count) {
  if (from == null || count <= 0) return "";
  return count === 1 ? `${from}` : `${from}~${from + count - 1}`;
}

// 완료 모달용 — 연속 구간이면 "2105 ~ 2110"으로 압축, 아니면 그대로 나열
function formatSerialList(serials) {
  if (!Array.isArray(serials) || serials.length === 0) return "";
  const contiguous = serials.every((s, i) => i === 0 || s === serials[i - 1] + 1);
  if (contiguous && serials.length > 1) {
    return `${serials[0]} ~ ${serials[serials.length - 1]}`;
  }
  return serials.join(", ");
}

// ── 드래그&드롭 + 클릭 업로드 박스 ──────────────────────────────────
function DropBox({ onFiles, multiple = false, disabled = false, className = "", children }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);

  const pick = (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    onFiles(multiple ? files : [files[0]]);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) pick(e.dataTransfer.files);
      }}
      className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed text-slate-400 transition ${
        over ? "border-slate-900 bg-slate-100 text-slate-700" : "border-slate-300 bg-slate-50 hover:border-slate-400"
      } disabled:opacity-50 ${className}`}
    >
      {children}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
    </button>
  );
}

// 신규 교재 카드의 입력 한 칸 — 표 헤더 대신 칸마다 작은 라벨을 달아
// 폭이 좁아 그리드가 접혀도 어떤 값인지 바로 보이게 한다.
function FieldCell({ label, children }) {
  return (
    <div className="min-w-0">
      <span className="mb-0.5 block text-[10px] font-bold text-slate-500">{label}</span>
      {children}
    </div>
  );
}

function StepBadge({ index, label, active, done }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${
          active ? "bg-slate-900 text-white" : done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
        }`}
      >
        {done ? <CheckIcon size={13} /> : index}
      </span>
      <span className={`text-sm font-bold ${active ? "text-slate-900" : "text-slate-400"}`}>{label}</span>
    </div>
  );
}

function AdminProductRegisterPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const shipmentIdParam = params.get("shipmentId");

  // 임시 저장 초안 — 첫 렌더에서 한 번만 읽어 아래 state 초기값으로 흘려보낸다
  const [initialDraft] = useState(() => loadDraft(shipmentIdParam));
  const [draftSavedAt, setDraftSavedAt] = useState(initialDraft?.savedAt ?? null);
  const [draftRestoredAt, setDraftRestoredAt] = useState(initialDraft?.savedAt ?? null);
  // 이번 세션에서 저장할 내용이 있었는지 — 다 지웠을 때만 초안을 회수한다
  const hadDraftContentRef = useRef(Boolean(initialDraft));

  const [shipment, setShipment] = useState(initialDraft?.shipment ?? null);
  const [step, setStep] = useState(initialDraft?.step ?? "customer"); // customer | list | photos
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, tone = "info") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  // 고객(수거) 선택/생성
  const [custSearch, setCustSearch] = useState("");
  const [custResults, setCustResults] = useState([]);
  const [custLoading, setCustLoading] = useState(false);
  const [newCust, setNewCust] = useState({ seller_name: "", seller_phone: "", pickup_date: todayStr() });
  const [creatingCust, setCreatingCust] = useState(false);
  // 새 고객 등록 폼에 입력된 번호의 사전 조회 결과
  // { members: [...], pending_requests: [...], existing_shipments: [...] }
  const [sellerContext, setSellerContext] = useState(null);

  // 신규 교재 (Frame 2 우측)
  const [newRows, setNewRows] = useState(() =>
    initialDraft?.newRows?.length ? initialDraft.newRows : [blankNewRow()],
  );
  // 기존 교재 재고 추가 (Frame 3 결과)
  const [existingAdditions, setExistingAdditions] = useState(() => initialDraft?.existingAdditions ?? []);
  // 교재 검색 (Frame 2 좌측) — 50건 단위 페이지, '더 보기'로 이어 붙임 (2026-07-23)
  const [prodSearch, setProdSearch] = useState("");
  const [prodResults, setProdResults] = useState([]);
  const [prodLoading, setProdLoading] = useState(false);
  const [prodHasMore, setProdHasMore] = useState(false);
  const [prodLoadingMore, setProdLoadingMore] = useState(false);
  const prodQueryRef = useRef("");
  // Frame 3 모달
  const [framePanel, setFramePanel] = useState(null);
  // 신규 교재 카테고리(과목·브랜드·유형) 설정 모달 — 대상 행 uid
  const [categoryModalUid, setCategoryModalUid] = useState(null);
  // 창고 위치 항상성 — 한 곳에서 입력하면 배치 전체(신규 행·기존 교재)에 같은 값이 따라간다
  const [batchLocation, setBatchLocation] = useState(initialDraft?.batchLocation ?? "");
  // 시작 일련번호 — 운영자가 정하면 등록 순서대로 start, start+1, ... 순차 배정
  const [serialStart, setSerialStart] = useState(initialDraft?.serialStart ?? "");
  // 유사 시세 힌트 — uid → RPC 결과, 같은 조건은 세션 내 캐시 재사용
  const [priceHints, setPriceHints] = useState({});
  const hintCacheRef = useRef(new Map());

  // 완료/공개
  const [publishOnComplete, setPublishOnComplete] = useState(initialDraft?.publishOnComplete ?? true);
  const [submitting, setSubmitting] = useState(false);
  // 등록 완료 모달 — 자동 채번된 일련번호를 보여주고 라벨링 안내 후 이동
  const [completeInfo, setCompleteInfo] = useState(null);

  // shipmentId 쿼리로 진입 시 해당 고객 자동 로드
  useEffect(() => {
    if (!shipmentIdParam || !isSupabaseConfigured) return undefined;
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("shipments")
        .select("id,seller_name,seller_phone,pickup_date,status")
        .eq("id", shipmentIdParam)
        .maybeSingle();
      if (!active) return;
      if (error || !data) {
        showToast("고객(수거) 정보를 불러오지 못했습니다.", "error");
        return;
      }
      setShipment(data);
      // 초안에서 사진 단계까지 복구된 경우엔 그 단계를 유지한다
      setStep((prev) => (prev === "customer" ? "list" : prev));
    })();
    return () => {
      active = false;
    };
  }, [shipmentIdParam, showToast]);

  // 작성 내용 자동 저장 (디바운스) — 등록이 끝난 뒤에는 다시 만들지 않는다
  useEffect(() => {
    if (completeInfo) return undefined;
    const hasContent = newRows.some((r) => !isNewRowBlank(r)) || existingAdditions.length > 0;
    if (!hasContent) {
      // 직접 다 지운 경우엔 초안도 지운다 (안 그러면 새로고침에 되살아난다).
      // 이번 세션에서 내용을 가진 적 있을 때만 — 다른 고객의 초안을 건드리면 안 된다.
      if (hadDraftContentRef.current) {
        clearDraft();
        setDraftSavedAt(null);
        hadDraftContentRef.current = false;
      }
      return undefined;
    }
    hadDraftContentRef.current = true;
    const timer = window.setTimeout(() => {
      const savedAt = new Date().toISOString();
      const ok = saveDraft({
        version: 1,
        savedAt,
        shipment,
        step,
        newRows: newRows.map((r) => ({ ...r, coverBusy: false, detailBusy: false })),
        existingAdditions: existingAdditions.map((a) => ({ ...a, coverBusy: false, detailBusy: false })),
        batchLocation,
        serialStart,
        publishOnComplete,
      });
      if (ok) setDraftSavedAt(savedAt);
    }, DRAFT_SAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [
    shipment,
    step,
    newRows,
    existingAdditions,
    batchLocation,
    serialStart,
    publishOnComplete,
    completeInfo,
  ]);

  // 고객 검색 (디바운스)
  // 검수 건뿐 아니라 '진행 중인 회원 수거신청'도 같은 목록에 섞어 보여준다.
  // 수거신청 행을 고르면 브리지 RPC를 태워 user_id·pickup_request_id가 채워진
  // 검수 건으로 이어지므로, 운영자는 하던 대로 이름만 쳐도 연동이 끊기지 않는다.
  // (이전엔 shipments만 검색해서 회원 수거신청이 있어도 안 보였고, 그래서 다들
  //  '새 고객 등록'으로 새로 만들어 브리지가 통째로 끊겼다 — 2026-08-10)
  useEffect(() => {
    if (step !== "customer" || !isSupabaseConfigured) return undefined;
    const q = custSearch.replace(/[,()%]/g, " ").trim();
    if (!q) {
      setCustResults([]);
      return undefined;
    }
    let active = true;
    setCustLoading(true);
    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("admin_search_register_targets", {
        p_search: q,
        p_limit: 20,
      });
      if (!active) return;
      if (error) {
        showToast(error.message || "고객 검색에 실패했습니다.", "error");
        setCustResults([]);
      } else {
        setCustResults(Array.isArray(data) ? data : []);
      }
      setCustLoading(false);
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [custSearch, step, showToast]);

  // 새 고객 등록 폼 — 같은 번호의 진행 중 수거신청 / 회원 매칭 사전 조회 (디바운스)
  useEffect(() => {
    if (step !== "customer" || !isSupabaseConfigured) return undefined;
    const digits = newCust.seller_phone.replace(/[^0-9]/g, "");
    if (digits.length < 9) {
      setSellerContext(null);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("admin_lookup_seller_context", {
        p_seller_name: newCust.seller_name.trim() || null,
        p_seller_phone: newCust.seller_phone.trim(),
      });
      if (!active || error) return;
      setSellerContext(data || null);
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [newCust.seller_name, newCust.seller_phone, step]);

  // 교재 검색 (디바운스, RPC)
  useEffect(() => {
    if (step !== "list" || !isSupabaseConfigured) return undefined;
    const q = prodSearch.trim();
    if (!q) {
      setProdResults([]);
      return undefined;
    }
    let active = true;
    setProdLoading(true);
    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("admin_search_products_for_register", {
        p_search: q,
        p_limit: PROD_SEARCH_LIMIT,
        p_offset: 0,
      });
      if (!active) return;
      prodQueryRef.current = q;
      if (error) {
        showToast(`교재 검색에 실패했습니다${error?.message ? ` — ${error.message}` : ""}`, "error");
        setProdResults([]);
        setProdHasMore(false);
      } else {
        const rows = Array.isArray(data) ? data : [];
        setProdResults(rows);
        setProdHasMore(rows.length >= PROD_SEARCH_LIMIT);
      }
      setProdLoading(false);
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [prodSearch, step, showToast]);

  // ── 표지 스캔 (2026-08-24) ─────────────────────────────────────────────
  // CZUR 스캐너 저장 폴더 감시(또는 사진 선택) → /api/admin/cover-scan 인식 →
  // 카탈로그 후보 원클릭 선택. CZUR가 UVC 미지원이라 자체 앱 저장 폴더를
  // File System Access API로 감시한다 (photo-intake와 동일 패턴, Chrome/Edge 전용).
  const [coverScan, setCoverScan] = useState({
    watching: false,
    folderName: "",
    busy: false,
    pending: 0,
    shotUrl: "",
    extracted: null,
    candidates: [],
    error: "",
  });
  const coverWatchRef = useRef({ handle: null, timer: null, seen: new Map() });
  const coverQueueRef = useRef({ running: false, items: [] });
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const stopCoverWatch = useCallback(() => {
    const w = coverWatchRef.current;
    if (w.timer) window.clearInterval(w.timer);
    coverWatchRef.current = { handle: null, timer: null, seen: new Map() };
    setCoverScan((s) => ({ ...s, watching: false, folderName: "" }));
  }, []);
  useEffect(() => () => stopCoverWatch(), [stopCoverWatch]);

  // 스캔 큐 — CZUR가 연속으로 파일을 떨어뜨려도 한 장씩 순서대로 인식한다.
  const runCoverScanQueue = async () => {
    const q = coverQueueRef.current;
    if (q.running) return;
    q.running = true;
    while (q.items.length > 0) {
      const file = q.items.shift();
      setCoverScan((s) => ({ ...s, busy: true, pending: q.items.length, error: "" }));
      try {
        const payload = await prepareStudioImagePayload(file);
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token || "";
        if (!accessToken) throw new Error("로그인이 만료되었습니다. 새로고침 후 다시 시도해주세요.");
        const result = await requestCoverScan(accessToken, payload);
        setCoverScan((s) => ({
          ...s,
          shotUrl: `data:${payload.mimeType};base64,${payload.imageBase64}`,
          extracted: result.extracted,
          candidates: result.candidates || [],
          error: "",
        }));
      } catch (err) {
        setCoverScan((s) => ({ ...s, error: err?.message || "표지 인식에 실패했습니다." }));
      }
    }
    q.running = false;
    setCoverScan((s) => ({ ...s, busy: false, pending: 0 }));
  };

  const enqueueCoverScan = (files) => {
    const list = [...files].filter((f) => f && String(f.type || "").startsWith("image/"));
    if (!list.length) return;
    coverQueueRef.current.items.push(...list);
    runCoverScanQueue();
  };

  // 파일이 아직 저장 중일 수 있어, 크기가 한 틱(1.5초) 동안 안정된 뒤에만 처리한다.
  const pollCoverWatchFolder = async () => {
    const w = coverWatchRef.current;
    if (!w.handle || stepRef.current !== "list") return;
    try {
      for await (const entry of w.handle.values()) {
        if (entry.kind !== "file" || !/\.(jpe?g|png|webp)$/i.test(entry.name)) continue;
        const file = await entry.getFile();
        const rec = w.seen.get(entry.name);
        if (!rec) {
          w.seen.set(entry.name, { size: file.size, processed: false });
          continue;
        }
        if (rec.processed) continue;
        if (rec.size !== file.size) {
          rec.size = file.size;
          continue;
        }
        rec.processed = true;
        enqueueCoverScan([file]);
      }
    } catch (err) {
      stopCoverWatch();
      showToast(`폴더 감시가 중단됐습니다${err?.message ? ` — ${err.message}` : ""}`, "error");
    }
  };

  const toggleCoverWatch = async () => {
    if (coverScan.watching) {
      stopCoverWatch();
      return;
    }
    if (typeof window.showDirectoryPicker !== "function") {
      showToast("이 브라우저는 폴더 감시를 지원하지 않아요. Chrome 또는 Edge에서 열어주세요.", "error");
      return;
    }
    let handle;
    try {
      handle = await window.showDirectoryPicker();
    } catch {
      return; // 사용자가 폴더 선택을 취소
    }
    const seen = new Map();
    try {
      // 기존 파일은 전부 처리됨으로 마킹 — 감시 시작 이후 새로 찍힌 사진만 인식한다.
      for await (const entry of handle.values()) {
        if (entry.kind === "file" && /\.(jpe?g|png|webp)$/i.test(entry.name)) {
          const f = await entry.getFile();
          seen.set(entry.name, { size: f.size, processed: true });
        }
      }
    } catch (err) {
      showToast(`폴더를 읽지 못했습니다${err?.message ? ` — ${err.message}` : ""}`, "error");
      return;
    }
    const timer = window.setInterval(pollCoverWatchFolder, 1500);
    coverWatchRef.current = { handle, timer, seen };
    setCoverScan((s) => ({ ...s, watching: true, folderName: handle.name }));
    showToast(`"${handle.name}" 폴더 감시 시작 — 스캐너로 표지를 찍으면 자동 인식됩니다.`, "success");
  };

  // 후보 선택 → 기존 검색 RPC로 전체 행(옵션·재고 포함)을 받아 기존 선택 흐름에 태운다.
  const selectScanCandidate = async (candidate) => {
    setProdSearch(candidate.title);
    const { data, error } = await supabase.rpc("admin_search_products_for_register", {
      p_search: candidate.title,
      p_limit: PROD_SEARCH_LIMIT,
      p_offset: 0,
    });
    if (error) {
      showToast(`후보 상품을 불러오지 못했습니다 — ${error.message}`, "error");
      return;
    }
    const rows = Array.isArray(data) ? data : [];
    const row = rows.find((r) => r.id === candidate.id);
    if (row) {
      openFramePanel(row);
    } else {
      showToast("검색 결과 목록에서 해당 교재를 직접 선택해주세요.", "info");
    }
  };

  // 카탈로그에 없는 책 — 추출값을 신규 교재 표의 상품명 규칙(연도+브랜드+교재명+과목+선생님)으로 조립
  const fillNewRowFromScan = () => {
    const ext = coverScan.extracted;
    if (!ext) return;
    const composed = [
      ext.published_year,
      ext.brand,
      ext.title,
      ext.subject,
      ext.instructor_name ? `${ext.instructor_name}T` : "",
    ]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .join(" ");
    if (!composed) {
      showToast("추출된 정보가 없습니다.", "error");
      return;
    }
    const target = newRows.find((r) => isNewRowBlank(r)) || newRows[newRows.length - 1];
    if (!target) return;
    handleRowChange(target.uid, "title", composed);
    showToast("신규 교재 표에 상품명을 채웠습니다. 정가·수량을 확인하세요.", "success");
  };

  // '더 보기' — 같은 검색어로 다음 50건을 이어 붙인다. 요청 중 검색어가 바뀌면 버린다.
  const loadMoreProducts = async () => {
    const q = prodSearch.trim();
    if (!q || prodLoadingMore) return;
    setProdLoadingMore(true);
    const { data, error } = await supabase.rpc("admin_search_products_for_register", {
      p_search: q,
      p_limit: PROD_SEARCH_LIMIT,
      p_offset: prodResults.length,
    });
    setProdLoadingMore(false);
    if (prodQueryRef.current !== q) return; // 검색어가 바뀐 뒤 도착한 응답은 무시
    if (error) {
      showToast(`교재 검색에 실패했습니다${error?.message ? ` — ${error.message}` : ""}`, "error");
      return;
    }
    const rows = Array.isArray(data) ? data : [];
    setProdResults((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...rows.filter((p) => !seen.has(p.id))];
    });
    setProdHasMore(rows.length >= PROD_SEARCH_LIMIT);
  };

  // 유사 시세 힌트 (디바운스, RPC admin_suggest_register_price)
  // 제목이 있는 신규 행마다 같은 과목·비슷한 제목의 기존 교재 판매가 중앙값을 조회한다.
  useEffect(() => {
    if (step !== "list" || !isSupabaseConfigured) return undefined;
    const targets = newRows
      .filter((r) => r.title.trim().length >= 4)
      .map((r) => ({
        uid: r.uid,
        title: r.title.trim(),
        subject: r.subject || "",
        brand: r.brand || "",
        bookType: r.bookType || "",
      }));
    let active = true;
    const timer = window.setTimeout(async () => {
      const nextHints = {};
      await Promise.all(
        targets.map(async (t) => {
          const key = `${t.title}|${t.subject}|${t.brand}|${t.bookType}`;
          let data = hintCacheRef.current.get(key);
          if (data === undefined) {
            const { data: rpcData, error } = await supabase.rpc("admin_suggest_register_price", {
              p_title: t.title,
              p_subject: t.subject || null,
              p_brand: t.brand || null,
              p_book_type: t.bookType || null,
            });
            if (error) {
              // 일시 오류는 캐시하지 않고 이번 표시만 생략 (다음 편집 때 재시도)
              nextHints[t.uid] = { found: false };
              return;
            }
            data = rpcData ?? { found: false };
            hintCacheRef.current.set(key, data);
          }
          nextHints[t.uid] = data;
        }),
      );
      if (active) setPriceHints(nextHints);
    }, 500);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [newRows, step]);

  // 새 고객 등록. 생 insert 대신 RPC를 경유해 회원 연결을 서버가 책임진다.
  // (이름+전화가 회원과 유일하게 맞으면 user_id가 자동으로 붙는다 — 안 붙으면
  //  셀러 마이페이지에서 자기 검수 결과를 영영 못 본다)
  const handleCreateCustomer = async (event) => {
    event.preventDefault();
    if (!newCust.seller_name.trim() || !newCust.seller_phone.trim() || !newCust.pickup_date) {
      showToast("이름 · 전화번호 · 수거 일자를 입력하세요.", "error");
      return;
    }
    // 후보 회원이 여럿이면 자동 연결이 불가능하므로 운영자가 고른 값을 넘긴다.
    const exactMembers = (sellerContext?.members ?? []).filter((m) => m.name_matches);
    setCreatingCust(true);
    const { data, error } = await supabase.rpc("admin_create_direct_shipment", {
      p_seller_name: newCust.seller_name.trim(),
      p_seller_phone: newCust.seller_phone.trim(),
      p_pickup_date: newCust.pickup_date,
      p_user_id: exactMembers.length === 1 ? exactMembers[0].user_id : null,
    });
    setCreatingCust(false);
    if (error || !data?.shipment) {
      showToast(error?.message || "고객 등록에 실패했습니다.", "error");
      return;
    }
    setShipment(data.shipment);
    setSellerContext(null);
    setStep("list");
    showToast(
      data.linked_member
        ? `${data.shipment.seller_name} 님 (회원 연결됨) 등록을 시작합니다.`
        : `${data.shipment.seller_name} 님 고객을 새로 등록했습니다. (비회원)`,
      "success",
    );
  };

  // 검색 결과 선택. 수거신청 행이면 브리지된 검수 건을 만들어(있으면 재사용) 넘어간다.
  const selectCustomer = async (row) => {
    if (row.kind !== "pickup_request") {
      setShipment({
        id: row.ref_id,
        seller_name: row.seller_name,
        seller_phone: row.seller_phone,
        pickup_date: row.target_date,
        status: row.status,
      });
      setStep("list");
      return;
    }

    setCreatingCust(true);
    const { data, error } = await supabase.rpc("admin_start_inspection_from_pickup", {
      p_pickup_request_id: row.ref_id,
    });
    if (error || !data?.shipment_id) {
      setCreatingCust(false);
      showToast(error?.message || "수거신청을 검수 건으로 전환하지 못했습니다.", "error");
      return;
    }
    const { data: created, error: loadError } = await supabase
      .from("shipments")
      .select("id,seller_name,seller_phone,pickup_date,status")
      .eq("id", data.shipment_id)
      .maybeSingle();
    setCreatingCust(false);
    if (loadError || !created) {
      showToast("검수 건을 불러오지 못했습니다.", "error");
      return;
    }
    setShipment(created);
    setStep("list");
    showToast(`${row.request_number} 수거신청에 연결해 등록을 시작합니다.`, "success");
  };

  // 신규 교재 행 편집 — 마지막 행이 채워지면 빈 행 자동 추가 (위치는 배치 위치로 프리필)
  const handleRowChange = (uid, field, value) => {
    setNewRows((prev) => {
      let rows = prev.map((r) => (r.uid === uid ? { ...r, [field]: value } : r));
      const last = rows[rows.length - 1];
      if (last && !isNewRowBlank(last)) rows = [...rows, blankNewRow(batchLocation)];
      return rows;
    });
  };
  const handleRowDelete = (uid) => {
    setNewRows((prev) => {
      const rows = prev.filter((r) => r.uid !== uid);
      if (rows.length === 0 || !isNewRowBlank(rows[rows.length - 1])) rows.push(blankNewRow(batchLocation));
      return rows;
    });
  };

  // 창고 위치 전체 적용 — '전체 적용' 버튼에서만 호출.
  // (2026-07-22 운영자 피드백: 한 행을 바꾸면 전체가 따라 바뀌어 행별 설정이 불가능했음.
  //  자동 전파를 제거하고 행별 입력 + 명시적 일괄 채움으로 전환. batchLocation은
  //  새 행/모달의 프리필 기본값으로만 쓰인다.)
  const applyLocationEverywhere = (value) => {
    setNewRows((prev) => prev.map((r) => ({ ...r, location: value })));
    setExistingAdditions((prev) => prev.map((a) => ({ ...a, location: value })));
    setFramePanel((fp) => (fp ? { ...fp, location: value } : fp));
    setBatchLocation(value);
  };
  const patchRow = (uid, patch) => setNewRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  const patchAddition = (uid, patch) =>
    setExistingAdditions((prev) => prev.map((a) => (a.uid === uid ? { ...a, ...patch } : a)));

  // Frame 3 열기
  // 이미 목록에 담아둔 교재를 다시 여는 경우(= '수정')엔 그때 입력한 수량·가격·신규
  // 옵션을 그대로 되살린다. (이전엔 상품 원본으로만 다시 그려서, 수정을 누르면 입력이
  // 전부 빈칸이 됐다 — 처음부터 다시 쳐야 했음. 2026-08-11 운영자 피드백)
  const openFramePanel = (product) => {
    const repOriginal = product.representative_original_price ?? "";
    const prevAddition = existingAdditions.find((a) => a.product.id === product.id);
    // 옵션명 → 직전 입력값. 카탈로그 옵션과 매칭되면 꺼내 쓰고, 남은 건 신규 옵션 행으로.
    const prevByOption = new Map(
      (prevAddition?.options ?? []).map((o) => [String(o.option ?? "").trim(), o]),
    );
    const takePrev = (name) => {
      const key = String(name ?? "").trim();
      const found = prevByOption.get(key);
      if (found) prevByOption.delete(key);
      return found ?? null;
    };
    let existingOptions = (product.options || []).map((o) => {
      const prev = takePrev(o.option);
      return {
        option: o.option ?? "",
        stock_count: o.stock_count ?? 0,
        quantity: prev ? String(prev.quantity ?? "") : "",
        price: prev?.price ?? o.price ?? repOriginal,
        originalPrice: prev?.original_price ?? o.original_price ?? repOriginal,
        discountType: prev?.discount_type || "none",
        discountValue: prev?.discount_value ?? "",
      };
    });
    // 옵션이 없는 교재(깡통 상품)도 옵션명 없이 '기본 옵션'으로 수량만 추가할 수 있게
    // 합성 행을 노출한다 (2026-07-22 운영자 피드백). RPC는 옵션명이 비면 null로 저장하고,
    // 공개 사이트는 null 옵션을 "기본 옵션"으로 렌더한다.
    if (existingOptions.length === 0) {
      const prev = takePrev("");
      existingOptions = [{
        option: "",
        stock_count: 0,
        quantity: prev ? String(prev.quantity ?? "") : "",
        price: prev?.price ?? repOriginal,
        originalPrice: prev?.original_price ?? repOriginal,
        discountType: prev?.discount_type || "none",
        discountValue: prev?.discount_value ?? "",
        isDefaultSynthetic: true,
      }];
    }
    // 신규 옵션 기본 판매가 — 이미 판매 중인 옵션이 있으면 그 판매가를 따라간다 (없으면 정가)
    const defaultNewPrice =
      existingOptions.find((o) => String(o.price ?? "").trim() !== "")?.price ??
      repOriginal;
    // 카탈로그에 아직 없는(= 이번에 새로 만든) 옵션들 — 입력했던 순서대로 복원
    const restoredNewOptions = [...prevByOption.values()].map((o) => ({
      option: String(o.option ?? ""),
      quantity: String(o.quantity ?? "1"),
      price: o.price ?? "",
      // 복원된 행은 이미 확정된 값이라 다른 행 판매가 입력에 휩쓸리지 않게 자동 추종 해제
      priceAuto: false,
      originalPrice: o.original_price ?? repOriginal,
      discountType: o.discount_type || "none",
      discountValue: o.discount_value ?? "",
    }));
    // 이미 목록에 추가해 둔 배치를 수정하는 경우 위치 입력값은 유지, 아니면 배치 위치 프리필
    setFramePanel({
      product,
      isEditing: Boolean(prevAddition),
      existingOptions,
      newOptions: [...restoredNewOptions, blankNewOption(defaultNewPrice, repOriginal)],
      location: prevAddition?.location ?? batchLocation,
    });
  };

  const updateExistingOpt = (idx, field, val) =>
    setFramePanel((fp) => ({
      ...fp,
      existingOptions: fp.existingOptions.map((o, i) => (i === idx ? { ...o, [field]: val } : o)),
    }));
  // 신규 옵션 편집 — 판매가는 아직 수동 수정 전(자동 상태)인 행 전체에 함께 전파되고,
  // 마지막 행에 옵션명이 채워지면 다음 행(수량 1·판매가 승계)을 자동 추가한다.
  const updateNewOpt = (idx, field, val) =>
    setFramePanel((fp) => {
      let arr = fp.newOptions.map((o, i) => {
        if (i === idx) {
          return { ...o, [field]: val, ...(field === "price" ? { priceAuto: false } : {}) };
        }
        if (field === "price" && (o.priceAuto || String(o.price ?? "").trim() === "")) {
          return { ...o, price: val };
        }
        return o;
      });
      const last = arr[arr.length - 1];
      if (last && last.option.trim()) {
        arr = [...arr, blankNewOption(last.price, last.originalPrice)];
      }
      return { ...fp, newOptions: arr };
    });

  // 정가+할인 입력 시 판매가를 계산하고 할인 메타를 함께 남긴다 — 신규 교재 표와 동일 규칙.
  // '직접 입력'(none)이면 판매가 입력값을 그대로 사용.
  const resolveOptionPricing = (o, fallbackOriginal) => {
    const type = o.discountType || "none";
    const original = String(o.originalPrice ?? "").trim() !== "" ? o.originalPrice : fallbackOriginal;
    if (type !== "none") {
      const computed = computeSellPrice(original, type, o.discountValue);
      if (computed !== null) {
        return { price: computed, original_price: original, discount_type: type, discount_value: o.discountValue };
      }
    }
    return { price: o.price, original_price: original, discount_type: "none", discount_value: null };
  };

  const confirmFramePanel = () => {
    const fp = framePanel;
    if (!fp) return;
    const repOriginal = fp.product.representative_original_price ?? "";
    const options = [];
    fp.existingOptions.forEach((o) => {
      const q = toNumber(o.quantity);
      if (q !== null && q >= 1) {
        options.push({
          option: o.option || "",
          quantity: Math.trunc(q),
          ...resolveOptionPricing(o, repOriginal),
        });
      }
    });
    fp.newOptions.forEach((o) => {
      const q = toNumber(o.quantity);
      // 수량 1·판매가가 프리필되므로, 옵션명을 입력한 행만 실제 등록 대상으로 본다
      if (o.option.trim() && q !== null && q >= 1) {
        options.push({
          option: o.option.trim(),
          quantity: Math.trunc(q),
          ...resolveOptionPricing(o, repOriginal),
        });
      }
    });
    if (options.length === 0) {
      showToast("기존 옵션의 추가 수량을 입력하거나, 신규 옵션명을 입력하세요.", "error");
      return;
    }
    setExistingAdditions((prev) => {
      // 수정이면 원래 자리·uid를 유지 (목록 순서가 튀면 일련번호 배정도 같이 흔들린다)
      const index = prev.findIndex((a) => a.product.id === fp.product.id);
      const prevAddition = index >= 0 ? prev[index] : null;
      const next =
        {
          uid: prevAddition?.uid ?? nextUid(),
          product: fp.product,
          options,
          location: (fp.location ?? "").trim(),
          // 행별 일련번호 직접 지정값은 재확정해도 유지
          serialOverride: prevAddition?.serialOverride ?? "",
          // 목록 수정 후 재확정해도 사진 단계에서 올린 사진·토글 상태는 유지
          coverUrl: prevAddition?.coverUrl ?? (fp.product.cover_image_url || ""),
          coverBusy: false,
          // 기존 상품에 이미 등록된 상세사진을 프리필 — 화면 표시 + 신규 책이 동일 세트 상속
          // (책 종류 단위 규칙). 검색 RPC의 detail_image_urls (2026-07-21).
          detailUrls:
            prevAddition?.detailUrls ??
            (Array.isArray(fp.product.detail_image_urls)
              ? fp.product.detail_image_urls.slice(0, MAX_DETAIL_PHOTOS)
              : []),
          detailBusy: false,
          // 기존 교재는 변환된 표지를 이미 갖고 있는 경우가 대부분 → AI 자동 변환 기본 꺼짐
          coverAutoStudio: prevAddition?.coverAutoStudio ?? false,
        };
      if (index < 0) return [...prev, next];
      const copy = [...prev];
      copy[index] = next;
      return copy;
    });
    setFramePanel(null);
    showToast(
      fp.isEditing
        ? `"${fp.product.title}" 수정 내용을 반영했습니다.`
        : `"${fp.product.title}" 재고를 목록에 추가했습니다.`,
      "success",
    );
  };

  const removeAddition = (uid) => setExistingAdditions((prev) => prev.filter((a) => a.uid !== uid));

  // 임시 저장 초안 버리고 교재 목록만 비우기 (고객 선택은 유지)
  const discardDraft = () => {
    if (!window.confirm("작성 중인 교재 목록을 모두 비웁니다. 계속할까요?")) return;
    clearDraft();
    setNewRows([blankNewRow()]);
    setExistingAdditions([]);
    setSerialStart("");
    setDraftSavedAt(null);
    setDraftRestoredAt(null);
    setStep("list");
    showToast("작성 내용을 비웠습니다.", "info");
  };

  // ── 사진 업로드 (kind: new | existing) ────────────────────────────
  const setItemBusy = (kind, uid, field, busy) =>
    kind === "new" ? patchRow(uid, { [field]: busy }) : patchAddition(uid, { [field]: busy });

  const uploadCover = async (kind, uid, file, { forceStudio = false } = {}) => {
    // 항목별 토글 — 신규/기존이 섞인 배치에서 어떤 표지는 AI 변환, 어떤 표지는 원본 그대로.
    // forceStudio: 이미 올라간 표지에 나중에 AI 변환을 적용하는 경로(토글과 무관하게 변환).
    const list = kind === "new" ? newRows : existingAdditions;
    const autoStudio = forceStudio || list.find((x) => x.uid === uid)?.coverAutoStudio === true;
    setItemBusy(kind, uid, "coverBusy", true);
    try {
      let uploadFile = file;
      if (autoStudio) {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token || "";
        if (!accessToken) {
          throw new Error("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
        }
        const payload = await prepareStudioImagePayload(file);
        const generated = await requestStudioGeneration(accessToken, payload);
        uploadFile = studioResultToFile(generated, file.name);
      }
      const url = await uploadImageToBucket(COVER_BUCKET, uploadFile);
      if (url) {
        if (kind === "new") patchRow(uid, { coverUrl: url });
        else patchAddition(uid, { coverUrl: url });
      }
    } catch (err) {
      showToast(
        autoStudio
          ? `AI 표지 변환 실패: ${err?.message || "알 수 없는 오류"} — 다시 시도하거나, 이 항목의 AI 변환을 끄고 원본을 올려주세요.`
          : err?.message || "표지 업로드 실패",
        "error",
      );
    } finally {
      setItemBusy(kind, uid, "coverBusy", false);
    }
  };

  const uploadDetails = async (kind, uid, files) => {
    // 상세 사진은 최대 MAX_DETAIL_PHOTOS장 — 현재 개수를 보고 남은 만큼만 업로드한다.
    const list = kind === "new" ? newRows : existingAdditions;
    const target = list.find((x) => x.uid === uid);
    const current = target?.detailUrls?.length ?? 0;
    const hadNoCover = !String(target?.coverUrl ?? "").trim();
    const remaining = MAX_DETAIL_PHOTOS - current;
    if (remaining <= 0) {
      showToast(`상세 사진은 최대 ${MAX_DETAIL_PHOTOS}장까지 등록할 수 있어요.`, "error");
      return;
    }
    const incoming = Array.from(files).slice(0, remaining);
    if (files.length > incoming.length) {
      showToast(`상세 사진은 최대 ${MAX_DETAIL_PHOTOS}장까지예요. ${incoming.length}장만 추가했어요.`, "info");
    }
    setItemBusy(kind, uid, "detailBusy", true);
    const urls = [];
    for (const file of incoming) {
      try {
        const url = await uploadImageToBucket(DETAIL_BUCKET, file);
        if (url) urls.push(url);
      } catch (err) {
        showToast(err?.message || "상세 사진 업로드 실패", "error");
      }
    }
    if (kind === "new") {
      setNewRows((prev) =>
        prev.map((r) => (r.uid === uid ? { ...r, detailUrls: [...(r.detailUrls || []), ...urls].slice(0, MAX_DETAIL_PHOTOS), detailBusy: false } : r)),
      );
    } else {
      setExistingAdditions((prev) =>
        prev.map((a) => (a.uid === uid ? { ...a, detailUrls: [...(a.detailUrls || []), ...urls].slice(0, MAX_DETAIL_PHOTOS), detailBusy: false } : a)),
      );
    }
    // 표지가 아직 없으면 방금 올린 상세 1번을 표지로 자동 승계 — 같은 사진을 두 번 올리는
    // 수고 제거 (2026-07-22 운영자 피드백). AI 변환 토글이 켜져 있으면 변환을 거쳐 표지 생성.
    if (hadNoCover && current === 0 && urls.length > 0 && incoming.length > 0) {
      showToast("상세 1번 사진을 표지로도 등록합니다 (AI 변환 토글 적용)", "info");
      await uploadCover(kind, uid, incoming[0]);
    }
  };

  // 이미 등록된 표지를 나중에 AI 변환 — 표지를 먼저 올린 뒤 'AI 자동 변환'을 켰을 때
  // 아무 일도 일어나지 않던 구멍을 메운다(토글은 '업로드 순간'에만 적용되기 때문).
  // 2026-08-10: 운영자가 "AI 표지변환을 눌러도 사진이 안 올라간다"고 본 경로.
  const applyStudioToCover = async (kind, uid) => {
    const list = kind === "new" ? newRows : existingAdditions;
    const currentUrl = list.find((x) => x.uid === uid)?.coverUrl;
    if (!currentUrl) return;
    setItemBusy(kind, uid, "coverBusy", true);
    try {
      const res = await fetch(currentUrl);
      if (!res.ok) throw new Error("표지 사진을 불러오지 못했습니다.");
      const blob = await res.blob();
      const name = decodeURIComponent((currentUrl.split("/").pop() || "cover.jpg").split("?")[0]);
      const file = new File([blob], name, { type: blob.type || "image/jpeg" });
      await uploadCover(kind, uid, file, { forceStudio: true });
    } catch (err) {
      showToast(err?.message || "AI 변환에 실패했습니다.", "error");
      setItemBusy(kind, uid, "coverBusy", false);
    }
  };

  // '상세 1번을 표지로 사용' 버튼 — 이미 올라간 상세 사진을 내려받아 표지 업로드
  // 경로(AI 토글 포함)로 태운다. 자동 승계를 놓쳤거나 표지를 지운 경우의 수동 경로.
  const useDetailAsCover = async (kind, uid) => {
    const list = kind === "new" ? newRows : existingAdditions;
    const firstDetail = list.find((x) => x.uid === uid)?.detailUrls?.[0];
    if (!firstDetail) return;
    setItemBusy(kind, uid, "coverBusy", true);
    try {
      const res = await fetch(firstDetail);
      if (!res.ok) throw new Error("상세 사진을 불러오지 못했습니다.");
      const blob = await res.blob();
      const name = decodeURIComponent((firstDetail.split("/").pop() || "detail.jpg").split("?")[0]);
      const file = new File([blob], name, { type: blob.type || "image/jpeg" });
      await uploadCover(kind, uid, file);
    } catch (err) {
      showToast(err?.message || "상세 사진을 표지로 사용하지 못했습니다.", "error");
      setItemBusy(kind, uid, "coverBusy", false);
    }
  };

  const removeDetail = (kind, uid, url) => {
    if (kind === "new") {
      setNewRows((prev) =>
        prev.map((r) => (r.uid === uid ? { ...r, detailUrls: (r.detailUrls || []).filter((u) => u !== url) } : r)),
      );
    } else {
      setExistingAdditions((prev) =>
        prev.map((a) => (a.uid === uid ? { ...a, detailUrls: (a.detailUrls || []).filter((u) => u !== url) } : a)),
      );
    }
  };
  const clearCover = (kind, uid) =>
    kind === "new" ? patchRow(uid, { coverUrl: "" }) : patchAddition(uid, { coverUrl: "" });

  const newProductsForSubmit = useMemo(
    () => newRows.filter((r) => !isNewRowBlank(r) && r.title.trim()),
    [newRows],
  );
  const hasItems = newProductsForSubmit.length > 0 || existingAdditions.length > 0;

  const photoTargets = useMemo(
    () => [
      ...newProductsForSubmit.map((r) => ({
        kind: "new",
        uid: r.uid,
        title: r.title,
        subtitle: optionSummary(r.option),
        location: r.location,
        coverUrl: r.coverUrl,
        coverBusy: r.coverBusy,
        detailUrls: r.detailUrls || [],
        detailBusy: r.detailBusy,
        coverAutoStudio: r.coverAutoStudio === true,
      })),
      ...existingAdditions.map((a) => ({
        kind: "existing",
        uid: a.uid,
        title: a.product.title,
        subtitle: a.options.map((o) => o.option || "옵션 없음").join(", "),
        location: a.location,
        coverUrl: a.coverUrl,
        coverBusy: a.coverBusy,
        detailUrls: a.detailUrls || [],
        detailBusy: a.detailBusy,
        coverAutoStudio: a.coverAutoStudio === true,
      })),
    ],
    [newProductsForSubmit, existingAdditions],
  );

  // 일련번호 배정 플랜 — 시작 번호부터 등록 순서(신규 표 → 기존 교재)대로 순차 배정.
  // 행별 직접 지정(serialOverride)이 있으면 그 행만 지정 번호부터 배정하고, 순차
  // 카운터는 지정 행을 건너뛰고 이어간다 (스티커 롤은 계속 이어 쓰는 운영 방식).
  // RPC가 같은 규칙으로 배정하므로 여기 미리보기와 실제 결과가 일치한다.
  const serialPlan = useMemo(() => {
    const startNum = parseSerialStart(serialStart);
    const invalid = String(serialStart).trim() !== "" && startNum === null;
    const ranges = new Map();
    const used = new Map(); // 번호 → 배정 횟수 (배치 내 중복 검사)
    let overrideInvalid = false;
    let cursor = startNum;
    let total = 0;
    const markUsed = (from, count) => {
      for (let i = 0; i < count; i += 1) used.set(from + i, (used.get(from + i) || 0) + 1);
    };
    const assign = (key, count, overrideRaw) => {
      if (count <= 0) return;
      const overrideNum = parseSerialStart(overrideRaw);
      if (String(overrideRaw ?? "").trim() !== "" && overrideNum === null) overrideInvalid = true;
      if (overrideNum !== null) {
        ranges.set(key, { from: overrideNum, count, manual: true });
        markUsed(overrideNum, count);
      } else if (cursor !== null) {
        ranges.set(key, { from: cursor, count });
        markUsed(cursor, count);
        cursor += count;
      }
      total += count;
    };
    newProductsForSubmit.forEach((r) => assign(`new-${r.uid}`, countBooksForNewRow(r), r.serialOverride));
    existingAdditions.forEach((a) => assign(`existing-${a.uid}`, countBooksForAddition(a), a.serialOverride));
    const conflicts = [...used.entries()].filter(([, c]) => c > 1).map(([n]) => n).sort((a, b) => a - b);
    return { startNum, invalid, overrideInvalid, conflicts, ranges, total };
  }, [serialStart, newProductsForSubmit, existingAdditions]);

  const serialRangeText = (kind, uid) => {
    const range = serialPlan.ranges.get(`${kind}-${uid}`);
    return range ? formatSerialRange(range.from, range.count) : "";
  };

  // 유사 시세 적용 — 정가가 비었으면 시세를 정가로(정가 그대로 판매 = 자체 산정 가격 패턴),
  // 정가가 있으면 판매가가 시세가 되도록 정액 할인으로 환산한다.
  const applyPriceHint = (uid) => {
    const suggested = toNumber(priceHints[uid]?.suggested_price);
    if (suggested === null) return;
    const row = newRows.find((r) => r.uid === uid);
    if (!row) return;
    const orig = toNumber(row.originalPrice);
    if (orig === null) {
      patchRow(uid, { originalPrice: String(suggested), discountType: "none", discountValue: "" });
    } else if (suggested < orig) {
      patchRow(uid, { discountType: "amount", discountValue: String(orig - suggested) });
    } else {
      patchRow(uid, { discountType: "none", discountValue: "" });
    }
  };

  const handleSubmit = async () => {
    if (!shipment) return;
    if (serialPlan.invalid) {
      showToast("시작 일련번호는 1 이상의 정수로 입력해 주세요.", "error");
      return;
    }
    if (serialPlan.overrideInvalid) {
      showToast("행별 일련번호는 1 이상의 정수로 입력해 주세요.", "error");
      return;
    }
    if (serialPlan.conflicts.length > 0) {
      const preview = serialPlan.conflicts.slice(0, 5).join(", ");
      showToast(
        `일련번호가 겹칩니다: ${preview}${serialPlan.conflicts.length > 5 ? " 외" : ""} — 행별 지정 번호를 확인해 주세요.`,
        "error",
      );
      return;
    }
    setSubmitting(true);
    const new_products = newProductsForSubmit.map((r) => ({
      title: r.title.trim(),
      // 과목 미선택("자동")이면 null → RPC가 상품명에서 파싱
      subject: r.subject || null,
      brand: r.brand || null,
      book_type: r.bookType || null,
      original_price: String(r.originalPrice).replaceAll(",", "").trim() || null,
      discount_type: r.discountType || "none",
      discount_value: r.discountType === "none" ? null : String(r.discountValue).replaceAll(",", "").trim() || null,
      option: r.option.trim(),
      // 같은 구성 여러 권 등록 — RPC가 옵션 수 × 수량 만큼 books 생성
      quantity: parseRowQuantity(r.quantity),
      location: r.location.trim() || null,
      // 행별 일련번호 직접 지정 (비우면 시작 번호 순차/자동 채번)
      serial_override: parseSerialStart(r.serialOverride),
      cover_image_url: r.coverUrl || null,
      inspection_image_urls: r.detailUrls || [],
      is_public: publishOnComplete,
    }));
    const existing_additions = existingAdditions.map((a) => ({
      product_id: a.product.id,
      location: a.location || null,
      serial_override: parseSerialStart(a.serialOverride),
      cover_image_url: a.coverUrl || null,
      inspection_image_urls: a.detailUrls || [],
      is_public: publishOnComplete,
      options: a.options.map((o) => ({
        option: o.option || "",
        quantity: o.quantity,
        price: o.price === "" || o.price == null ? null : String(o.price).replaceAll(",", "").trim(),
        original_price:
          o.original_price === "" || o.original_price == null ? null : String(o.original_price).replaceAll(",", "").trim(),
        discount_type: o.discount_type || "none",
        discount_value:
          o.discount_value === "" || o.discount_value == null ? null : String(o.discount_value).replaceAll(",", "").trim(),
      })),
    }));

    const { data, error } = await supabase.rpc("admin_register_customer_inventory", {
      p_shipment_id: shipment.id,
      p_payload: {
        new_products,
        existing_additions,
        // 시작 일련번호 지정 시 등록 순서대로 순차 배정 (비우면 시퀀스 자동 채번)
        serial_start: serialPlan.startNum,
      },
    });
    setSubmitting(false);
    if (error) {
      showToast(error.message || "등록에 실패했습니다.", "error");
      return;
    }
    const createdProducts = data?.created_products ?? 0;
    const createdBooks = data?.created_books ?? 0;
    const createdSerials = Array.isArray(data?.created_serials) ? data.created_serials : [];
    // 등록에 성공했으면 임시 저장 초안은 역할이 끝났다
    clearDraft();
    setDraftSavedAt(null);
    setDraftRestoredAt(null);
    showToast(
      `교재 ${createdProducts}종 · 재고 ${createdBooks}권 등록 완료${publishOnComplete ? " (스토어 공개)" : ""}`,
      "success",
    );
    // 자동 채번된 일련번호를 확인하고 실물에 라벨을 붙일 수 있게 완료 모달을 띄운 뒤 이동
    setCompleteInfo({
      products: createdProducts,
      books: createdBooks,
      serials: createdSerials,
      shipmentId: shipment.id,
    });
  };

  const goAfterComplete = () => {
    const sid = completeInfo?.shipmentId;
    setCompleteInfo(null);
    navigate(sid ? `/admin/shipments/${sid}` : "/admin/products");
  };

  const canChangeCustomer = !shipmentIdParam;

  return (
    <AdminShell
      activeModule="register"
      description="고객별 교재 등록 — 기존 교재 재고 추가 또는 신규 교재 일괄 등록"
      title="상품 등록"
    >
      {!isSupabaseConfigured ? (
        <p className="rounded-md bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          Supabase 환경 변수가 설정되지 않아 기능을 사용할 수 없습니다.
        </p>
      ) : null}

      {/* 스텝 표시 */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-3">
        <StepBadge index={1} label="고객 선택" active={step === "customer"} done={Boolean(shipment)} />
        <span className="text-slate-300">›</span>
        <StepBadge index={2} label="교재 목록" active={step === "list"} done={step === "photos"} />
        <span className="text-slate-300">›</span>
        <StepBadge index={3} label="사진 · 완료" active={step === "photos"} done={false} />
        {shipment ? (
          <div className="ml-auto flex items-center gap-3">
            <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-bold text-white">
              고객: {shipment.seller_name} 님
            </span>
            {canChangeCustomer ? (
              <button
                type="button"
                className="text-xs font-semibold text-slate-500 underline hover:text-slate-800"
                onClick={() => {
                  setShipment(null);
                  setStep("customer");
                }}
              >
                고객 변경
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* 임시 저장 — 새로고침·실수 이탈로 작성 내용이 날아가지 않게 (2026-08-11) */}
      {hasItems || draftRestoredAt ? (
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2">
          {draftRestoredAt ? (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
              임시 저장된 작성 내용을 불러왔습니다 ({formatDraftTime(draftRestoredAt)} 저장)
            </span>
          ) : null}
          {draftSavedAt ? (
            <span className="text-xs font-semibold text-slate-500">
              자동 저장됨 · {formatDraftTime(draftSavedAt)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={discardDraft}
            className="ml-auto text-xs font-semibold text-slate-500 underline hover:text-rose-600"
          >
            작성 내용 비우기
          </button>
        </div>
      ) : null}

      <div className="mt-5">
        {/* ── STEP 1: 고객 선택/생성 ─────────────────────────────── */}
        {step === "customer" ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-black text-slate-900">고객 · 수거신청 검색</h2>
              <p className="mt-1 text-sm text-slate-500">
                이름 · 전화번호 · 수거신청 번호로 검색하세요. 회원 수거신청도 함께 나옵니다.
              </p>
              <input
                type="search"
                value={custSearch}
                onChange={(e) => setCustSearch(e.target.value)}
                placeholder="예: 나유찬 / 010-1234-5678 / PU-2608-0005"
                className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                {custLoading ? (
                  <p className="py-4 text-center text-sm text-slate-400"><InlineLoading label="검색 중..." /></p>
                ) : custResults.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-400">
                    {custSearch.trim() ? "검색 결과가 없습니다." : "검색어를 입력하세요."}
                  </p>
                ) : (
                  custResults.map((c) => {
                    const isRequest = c.kind === "pickup_request";
                    return (
                      <button
                        key={`${c.kind}-${c.ref_id}`}
                        type="button"
                        disabled={creatingCust}
                        onClick={() => selectCustomer(c)}
                        className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left disabled:opacity-50 ${
                          isRequest
                            ? "border-indigo-200 bg-indigo-50/60 hover:border-indigo-500"
                            : "border-slate-200 hover:border-slate-900 hover:bg-slate-50"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-slate-900">{c.seller_name}</span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                                isRequest ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {isRequest ? "수거신청" : "직접입고"}
                            </span>
                            {c.user_id ? (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700">
                                회원
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {c.seller_phone}
                            {isRequest ? ` · ${c.request_number}` : ""}
                            {c.target_date ? ` · ${c.target_date}` : ""}
                          </p>
                          <p className="mt-0.5 text-xs font-semibold text-slate-600">
                            {(isRequest ? pickupRequestStatusLabel : shipmentStatusLabel)[c.status] ?? c.status}
                            {" · "}
                            등록 {c.book_count}권
                            {isRequest && c.expected_book_count ? ` / 예상 ${c.expected_book_count}권` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 pl-3 text-xs font-semibold text-slate-400">선택 →</span>
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-black text-slate-900">새 고객 등록</h2>
              <p className="mt-1 text-sm text-slate-500">
                수거신청 없이 직접 입고된 셀러용입니다. 회원 수거신청은 왼쪽에서 고르세요.
              </p>

              {/* 같은 번호로 진행 중인 수거신청이 있으면 새로 만들지 못하게 막고 그쪽으로 보낸다.
                  여기서 새로 만들면 검수 결과가 셀러 마이페이지에 안 뜬다. */}
              {(sellerContext?.pending_requests ?? []).length > 0 ? (
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <p className="text-sm font-bold text-amber-900">
                    이 번호로 진행 중인 수거신청이 있습니다
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    새로 만들지 말고 아래 신청을 선택하세요. 새로 만들면 셀러 마이페이지에
                    검수 결과가 연결되지 않습니다.
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {sellerContext.pending_requests.map((pr) => (
                      <button
                        key={pr.id}
                        type="button"
                        disabled={creatingCust}
                        onClick={() =>
                          selectCustomer({
                            kind: "pickup_request",
                            ref_id: pr.id,
                            request_number: pr.request_number,
                          })
                        }
                        className="flex w-full items-center justify-between rounded-md border border-amber-300 bg-white px-3 py-2 text-left text-xs hover:border-amber-600 disabled:opacity-50"
                      >
                        <span className="font-bold text-slate-900">
                          {pr.request_number}
                          <span className="ml-1.5 font-semibold text-slate-500">
                            {pickupRequestStatusLabel[pr.status] ?? pr.status}
                            {pr.expected_book_count ? ` · 예상 ${pr.expected_book_count}권` : ""}
                          </span>
                        </span>
                        <span className="font-bold text-amber-700">이 신청으로 등록 →</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* 회원 매칭 안내 — 이름까지 맞아야 자동 연결된다 */}
              {(sellerContext?.members ?? []).length > 0 ? (
                <p
                  className={`mt-3 rounded-md px-3 py-2 text-xs font-semibold ${
                    sellerContext.members.filter((m) => m.name_matches).length === 1
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {sellerContext.members.filter((m) => m.name_matches).length === 1
                    ? `회원 ${sellerContext.members.find((m) => m.name_matches).name} 님으로 자동 연결됩니다.`
                    : `이 번호를 쓰는 회원이 ${sellerContext.members.length}명 있는데 이름이 일치하지 않습니다 (${sellerContext.members
                        .map((m) => m.name)
                        .filter(Boolean)
                        .join(", ")}). 이름을 회원 정보와 똑같이 입력하면 자동 연결됩니다.`}
                </p>
              ) : null}

              <form onSubmit={handleCreateCustomer} className="mt-3 space-y-3">
                <label className="block">
                  <span className="text-xs font-bold text-slate-700">판매자 이름 *</span>
                  <input
                    type="text"
                    value={newCust.seller_name}
                    onChange={(e) => setNewCust((f) => ({ ...f, seller_name: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-slate-700">전화번호 *</span>
                  <input
                    type="tel"
                    value={newCust.seller_phone}
                    onChange={(e) => setNewCust((f) => ({ ...f, seller_phone: e.target.value }))}
                    placeholder="010-0000-0000"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-slate-700">수거 일자 *</span>
                  <input
                    type="date"
                    value={newCust.pickup_date}
                    onChange={(e) => setNewCust((f) => ({ ...f, pickup_date: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  disabled={creatingCust}
                  className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {creatingCust ? <BusyText>등록 중...</BusyText> : "이 고객으로 상품 등록 시작"}
                </button>
              </form>
            </section>
          </div>
        ) : null}

        {/* ── STEP 2: 교재 목록 작성 (Frame 2) ───────────────────── */}
        {step === "list" && shipment ? (
          <div className="space-y-5">
            <div className="grid gap-5 xl:grid-cols-2">
              {/* 좌측: 기존 교재 검색 */}
              <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-black text-slate-900">기존 교재 추가하기</h2>
                <p className="mt-1 text-sm text-slate-500">
                  이미 등록된 교재인지 검색하고, 선택해 재고/옵션을 추가합니다.
                </p>

                {/* 표지 스캔 — 스캐너 저장 폴더 감시 or 사진 선택 → 인식 후보 원클릭 */}
                <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black text-indigo-900">표지 스캔</span>
                    <button
                      type="button"
                      onClick={toggleCoverWatch}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-bold ${
                        coverScan.watching
                          ? "bg-indigo-600 text-white hover:bg-indigo-500"
                          : "border border-indigo-300 bg-white text-indigo-700 hover:border-indigo-600"
                      }`}
                    >
                      {coverScan.watching
                        ? `감시 중: ${coverScan.folderName} (중지)`
                        : "스캐너 폴더 감시"}
                    </button>
                    <label className="cursor-pointer rounded-md border border-indigo-300 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:border-indigo-600">
                      사진 선택
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          enqueueCoverScan(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {coverScan.busy ? (
                      <span className="text-xs text-indigo-700">
                        <InlineLoading
                          label={`인식 중...${coverScan.pending ? ` (대기 ${coverScan.pending})` : ""}`}
                        />
                      </span>
                    ) : null}
                  </div>
                  {coverScan.error ? (
                    <p className="mt-2 text-xs font-bold text-red-600">{coverScan.error}</p>
                  ) : null}
                  {coverScan.extracted ? (
                    <div className="mt-2 flex items-start gap-2">
                      {coverScan.shotUrl ? (
                        <img
                          src={coverScan.shotUrl}
                          alt=""
                          className="h-16 w-12 flex-shrink-0 rounded-md border border-indigo-200 bg-white object-cover"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-slate-900">
                          {coverScan.extracted.title || "(제목 인식 실패)"}
                        </p>
                        <p className="truncate text-[11px] text-slate-500">
                          {[
                            coverScan.extracted.instructor_name,
                            coverScan.extracted.brand,
                            coverScan.extracted.published_year,
                            coverScan.extracted.subject,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {(coverScan.candidates || []).slice(0, 3).map((c, i) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => selectScanCandidate(c)}
                              className={`max-w-full truncate rounded-md px-2 py-1 text-left text-[11px] font-bold ${
                                i === 0
                                  ? "bg-slate-900 text-white hover:bg-slate-700"
                                  : "border border-slate-300 bg-white text-slate-700 hover:border-slate-900"
                              }`}
                            >
                              {i + 1}위 · {c.title}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={fillNewRowFromScan}
                            className="rounded-md border border-dashed border-indigo-400 bg-white px-2 py-1 text-[11px] font-bold text-indigo-700 hover:border-indigo-700"
                          >
                            신규 교재로 입력
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <input
                  type="search"
                  value={prodSearch}
                  onChange={(e) => setProdSearch(e.target.value)}
                  placeholder="교재 키워드 검색 (예: 서바이벌 물리)"
                  className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto">
                  {prodLoading ? (
                    <p className="py-4 text-center text-sm text-slate-400"><InlineLoading label="검색 중..." /></p>
                  ) : prodResults.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-400">
                      {prodSearch.trim() ? "검색 결과가 없습니다. 오른쪽에서 신규 교재로 등록하세요." : "검색어를 입력하세요."}
                    </p>
                  ) : (
                    <>
                    {prodResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => openFramePanel(p)}
                        className="flex w-full items-start gap-3 rounded-lg border border-slate-200 p-3 text-left hover:border-slate-900 hover:bg-slate-50"
                      >
                        <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                          {p.cover_image_url ? (
                            // eslint-disable-next-line jsx-a11y/img-redundant-alt
                            <img src={p.cover_image_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                              no img
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1">
                            {p.subject ? (
                              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                                {p.subject}
                              </span>
                            ) : null}
                            {p.brand ? (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                                {p.brand}
                              </span>
                            ) : null}
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                              {p.representative_grade || "S"}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-sm font-bold text-slate-900">{p.title}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            정가: {formatCurrency(p.representative_original_price)} · 재고 {p.inventory_count ?? 0}권
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            옵션: {(p.options || []).map((o) => o.option || "기본").join(", ") || "없음"}
                          </p>
                        </div>
                      </button>
                    ))}
                    {prodHasMore ? (
                      <button
                        type="button"
                        disabled={prodLoadingMore}
                        onClick={loadMoreProducts}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-center text-xs font-bold text-slate-600 hover:border-slate-900 hover:bg-slate-50 disabled:opacity-60"
                      >
                        {prodLoadingMore ? <BusyText>불러오는 중...</BusyText> : `더 보기 ▾ (${PROD_SEARCH_LIMIT}건씩)`}
                      </button>
                    ) : null}
                    </>
                  )}
                </div>
              </section>

              {/* 우측: 신규 교재 등록 표 */}
              <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-black text-slate-900">신규 교재 등록하기</h2>
                <p className="mt-1 text-xs text-slate-500">
                  등록 순서: 연도+브랜드명+교재명+과목+선생님 (예: 2026 강남대성 크럭스 CRUX 수학1 현우진T)
                </p>
                <p className="mt-1 text-xs text-indigo-600">
                  · 할인 방식을 정가로 두면 정가 그대로 판매 · 옵션은 콤마(,)로 여러 개 자동 등록 · 같은 구성이 여러 권이면 수량만 올리면 돼요
                </p>
                <p className="mt-1 text-xs text-indigo-600">
                  · 위치는 행별 입력 (아래 '전체 적용'으로 일괄 채움) · 일련번호는 시작 번호부터 순차 배정, 행별로 직접 지정도 가능
                </p>
                {/* 표 → 교재별 카드. 11칸짜리 가로 표는 상품명이 잘리고 가로 스크롤이
                    필요했다 (2026-08-11 운영자 피드백). 상품명은 한 줄을 통째로 쓰고,
                    나머지 항목은 폭에 맞춰 접히는 그리드로 내린다. */}
                <div className="mt-3 space-y-2">
                  {newRows.map((row) => {
                    const sell = computeSellPrice(row.originalPrice, row.discountType, row.discountValue);
                    const blank = isNewRowBlank(row);
                    const hint = priceHints[row.uid];
                    const showHint = !blank && hint?.found && toNumber(hint.suggested_price) !== null;
                    return (
                      <div
                        key={row.uid}
                        className={`rounded-xl border p-3 ${
                          blank ? "border-dashed border-slate-300 bg-slate-50/60" : "border-slate-200"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={row.title}
                            onChange={(e) => handleRowChange(row.uid, "title", e.target.value)}
                            placeholder={
                              blank
                                ? "새 교재 상품명 입력 (예: 2026 강남대성 크럭스 CRUX 수학1 현우진T)"
                                : "2026 강남대성 …"
                            }
                            aria-label="상품명"
                            className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1.5 text-sm"
                          />
                          {!blank ? (
                            <button
                              type="button"
                              onClick={() => handleRowDelete(row.uid)}
                              className="shrink-0 text-slate-300 hover:text-rose-600"
                              aria-label="행 삭제"
                            >
                              <CloseIcon size={14} />
                            </button>
                          ) : null}
                        </div>

                        {/* 상품명이 비어 있는 마지막 행은 접어둔다 — 입력하면 나머지 칸이 열린다 */}
                        {!blank ? (
                          <div className="mt-2 grid gap-2 text-sm [grid-template-columns:repeat(auto-fill,minmax(6.5rem,1fr))]">
                            <FieldCell label="카테고리">
                              {/* 과목·브랜드·유형은 모달에서 설정 — 칸에는 현재 선택 요약만.
                                  전부 미선택이면 '자동'(상품명에서 파싱). */}
                              <button
                                type="button"
                                onClick={() => setCategoryModalUid(row.uid)}
                                className="w-full truncate rounded border border-slate-200 px-2 py-1.5 text-left text-xs font-semibold text-slate-600 hover:border-slate-400"
                                title="과목 · 브랜드 · 유형 설정"
                              >
                                {[row.subject, row.brand, row.bookType].filter(Boolean).join(" · ") || "자동"}
                              </button>
                            </FieldCell>
                            <FieldCell label="옵션">
                              <input
                                type="text"
                                value={row.option}
                                onChange={(e) => handleRowChange(row.uid, "option", e.target.value)}
                                placeholder="2권, 3권"
                                aria-label="옵션"
                                className="w-full rounded border border-slate-200 px-2 py-1.5"
                              />
                            </FieldCell>
                            <FieldCell label="수량">
                              {/* 같은 구성 여러 권 — 옵션 수 × 수량 만큼 등록 */}
                              <input
                                type="number"
                                min="1"
                                value={row.quantity}
                                onChange={(e) => handleRowChange(row.uid, "quantity", e.target.value)}
                                aria-label="수량"
                                className="w-full rounded border border-slate-200 px-2 py-1.5"
                              />
                            </FieldCell>
                            <FieldCell label="위치">
                              {/* 행별 위치 — 개별 수정 가능, 일괄 채움은 하단 '전체 적용' */}
                              <input
                                type="text"
                                value={row.location}
                                onChange={(e) => handleRowChange(row.uid, "location", e.target.value)}
                                placeholder="A1"
                                aria-label="창고 위치"
                                className="w-full rounded border border-slate-200 px-2 py-1.5"
                              />
                            </FieldCell>
                            <FieldCell label="일련번호">
                              {/* 비우면 시작 번호 순차 배정, 입력하면 이 행만 그 번호부터 배정 */}
                              <input
                                type="number"
                                min="1"
                                value={row.serialOverride}
                                onChange={(e) => handleRowChange(row.uid, "serialOverride", e.target.value)}
                                placeholder={serialRangeText("new", row.uid) || "자동"}
                                aria-label="일련번호"
                                className="w-full rounded border border-slate-200 px-2 py-1.5 font-mono text-xs"
                              />
                              {String(row.serialOverride).trim() && countBooksForNewRow(row) > 1 ? (
                                <span className="mt-0.5 block px-1 font-mono text-[10px] font-bold text-indigo-600">
                                  {serialRangeText("new", row.uid)}
                                </span>
                              ) : null}
                            </FieldCell>
                            <FieldCell label="정가">
                              <input
                                type="number"
                                min="0"
                                value={row.originalPrice}
                                onChange={(e) => handleRowChange(row.uid, "originalPrice", e.target.value)}
                                placeholder="원"
                                aria-label="정가"
                                className="w-full rounded border border-slate-200 px-2 py-1.5"
                              />
                            </FieldCell>
                            <FieldCell label="할인 방식">
                              <select
                                value={row.discountType}
                                onChange={(e) => handleRowChange(row.uid, "discountType", e.target.value)}
                                aria-label="할인 방식"
                                className="w-full rounded border border-slate-200 px-1 py-1.5"
                              >
                                {DISCOUNT_TYPES.map((d) => (
                                  <option key={d.value} value={d.value}>
                                    {d.label}
                                  </option>
                                ))}
                              </select>
                            </FieldCell>
                            <FieldCell label="할인 값">
                              <input
                                type="number"
                                min="0"
                                value={row.discountValue}
                                disabled={row.discountType === "none"}
                                onChange={(e) => handleRowChange(row.uid, "discountValue", e.target.value)}
                                placeholder={row.discountType === "rate" ? "%" : row.discountType === "amount" ? "원" : "-"}
                                aria-label="할인 값"
                                className="w-full rounded border border-slate-200 px-2 py-1.5 disabled:bg-slate-100"
                              />
                            </FieldCell>
                            <FieldCell label="판매가">
                              <span className="block rounded border border-transparent px-2 py-1.5 text-right font-bold text-slate-900">
                                {sell == null ? "—" : formatCurrency(sell)}
                              </span>
                            </FieldCell>
                          </div>
                        ) : null}

                        {showHint ? (
                          <div className="mt-2 rounded-lg bg-indigo-50/70 px-3 py-1.5 text-[11px] font-semibold text-indigo-800">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span className="font-bold">
                                유사 시세 {formatCurrency(hint.suggested_price)}
                                {hint.avg_discount_rate ? ` (정가 대비 약 -${hint.avg_discount_rate}%)` : ""}
                              </span>
                              <span className="min-w-0 flex-1 truncate font-medium text-indigo-500">
                                {hint.product_count}종 {hint.book_count}권 기준:{" "}
                                {(hint.samples || []).slice(0, 3).map((s) => s.title).join(" · ")}
                              </span>
                              <button
                                type="button"
                                onClick={() => applyPriceHint(row.uid)}
                                className="rounded border border-indigo-300 bg-white px-2 py-0.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100"
                              >
                                이 가격 적용
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* 추가된 기존 교재 요약 */}
            {existingAdditions.length > 0 ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="text-sm font-black text-slate-900">추가한 기존 교재 ({existingAdditions.length})</h3>
                <div className="mt-3 space-y-2">
                  {existingAdditions.map((a) => (
                    <div
                      key={a.uid}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{a.product.title}</p>
                        <p className="text-xs text-slate-500">
                          {a.options
                            .map((o) => `${o.option || "기본"} ${o.quantity}권`)
                            .join(" · ")}
                          {a.location ? ` · 위치 ${a.location}` : ""}
                          {serialRangeText("existing", a.uid)
                            ? ` · 일련번호 ${serialRangeText("existing", a.uid)}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {/* 행별 일련번호 직접 지정 — 비우면 시작 번호 순차 배정 */}
                        <input
                          type="number"
                          min="1"
                          value={a.serialOverride ?? ""}
                          onChange={(e) => patchAddition(a.uid, { serialOverride: e.target.value })}
                          placeholder="번호 지정"
                          title="이 교재의 시작 일련번호 직접 지정 (비우면 순차 배정)"
                          className="w-24 rounded border border-slate-200 px-2 py-1 font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => openFramePanel(a.product)}
                          className="text-xs font-semibold text-slate-500 underline hover:text-slate-800"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => removeAddition(a.uid)}
                          className="text-xs font-semibold text-rose-500 underline hover:text-rose-700"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-3">
              {/* 창고 위치 일괄 채움 — 행별 입력이 기본, 이 버튼으로만 전체 적용 (2026-07-22) */}
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <label className="text-xs font-bold text-slate-700" htmlFor="register-batch-location">
                  창고 위치
                </label>
                <input
                  id="register-batch-location"
                  type="text"
                  value={batchLocation}
                  onChange={(e) => setBatchLocation(e.target.value)}
                  placeholder="예: A1"
                  className="w-20 rounded border border-slate-200 px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => applyLocationEverywhere(batchLocation.trim())}
                  className="rounded border border-slate-300 px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  전체 적용
                </button>
              </div>
              {/* 시작 일련번호 — 신규 표 → 기존 교재 순서로 start, start+1, ... 자동 배정 */}
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <label className="text-xs font-bold text-slate-700" htmlFor="register-serial-start">
                  시작 일련번호
                </label>
                <input
                  id="register-serial-start"
                  type="number"
                  min="1"
                  value={serialStart}
                  onChange={(e) => setSerialStart(e.target.value)}
                  placeholder="예: 2105"
                  className="w-24 rounded border border-slate-200 px-2 py-1.5 text-sm"
                />
                <span
                  className={`text-xs font-semibold ${
                    serialPlan.invalid ? "text-rose-600" : "text-slate-500"
                  }`}
                >
                  {serialPlan.invalid
                    ? "1 이상의 정수를 입력하세요"
                    : serialPlan.total === 0
                      ? "등록할 교재를 추가하세요"
                      : serialPlan.startNum !== null
                        ? `총 ${serialPlan.total}권 → ${formatSerialRange(serialPlan.startNum, serialPlan.total)} 배정`
                        : `총 ${serialPlan.total}권 · 비우면 이어서 자동 채번`}
                </span>
              </div>
              <span className="text-sm text-slate-500">
                신규 {newProductsForSubmit.length}종 · 기존 {existingAdditions.length}종
              </span>
              <button
                type="button"
                disabled={!hasItems}
                onClick={() => setStep("photos")}
                className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-40"
              >
                사진 등록하기 →
              </button>
            </div>
          </div>
        ) : null}

        {/* ── STEP 3: 사진 + 완료 (Frame 4) ───────────────────────── */}
        {step === "photos" && shipment ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep("list")}
                className="text-sm font-semibold text-slate-500 underline hover:text-slate-800"
              >
                ← 교재 목록으로
              </button>
              <p className="text-sm text-slate-500">표지 사진 1장 + 상세페이지 사진 최대 {MAX_DETAIL_PHOTOS}장 (선택 사항)</p>
            </div>

            <p className="rounded-lg bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700">
              교재별 <strong>AI 자동 변환</strong>이 켜진 표지는 올리는 순간 사진 스튜디오 변환을 거쳐
              등록됩니다. 신규 교재는 기본 켜짐 · 기존 교재는 기본 꺼짐 — 이미 변환된 사진을 올릴 땐 꺼주세요.
            </p>

            <div className="space-y-4">
              {photoTargets.map((t) => (
                <section key={`${t.kind}-${t.uid}`} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="mb-3">
                    <p className="text-sm font-black text-slate-900">{t.title}</p>
                    <p className="text-xs text-slate-500">
                      옵션: {t.subtitle}
                      {serialRangeText(t.kind, t.uid) ? ` · 일련번호 ${serialRangeText(t.kind, t.uid)}` : ""}
                      {t.location && t.location.trim() ? ` · 위치 ${t.location.trim()}` : ""}
                    </p>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">
                    {/* 표지 */}
                    <div>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-bold text-slate-700">표지 사진</p>
                        {/* 항목별 AI 변환 토글 — 신규(생사진)와 기존(변환 완료본)이 섞여도 개별 제어 */}
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-700">
                          <input
                            type="checkbox"
                            checked={t.coverAutoStudio}
                            onChange={(e) =>
                              t.kind === "new"
                                ? patchRow(t.uid, { coverAutoStudio: e.target.checked })
                                : patchAddition(t.uid, { coverAutoStudio: e.target.checked })
                            }
                            className="h-3.5 w-3.5"
                          />
                          AI 자동 변환
                        </label>
                      </div>
                      {t.coverUrl ? (
                        <>
                          <div className="relative h-32 w-32 overflow-hidden rounded-lg border border-slate-200">
                            {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
                            <img src={t.coverUrl} alt="" className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => clearCover(t.kind, t.uid)}
                              className="absolute right-1 top-1 rounded-full bg-slate-900/70 px-1.5 text-xs font-bold text-white"
                            >
                              <CloseIcon size={12} />
                            </button>
                          </div>
                          {/* 표지를 먼저 올린 뒤에도 AI 변환을 적용할 수 있는 경로.
                              (토글은 업로드 순간에만 적용돼, 이미 올린 표지엔 무반응이었다) */}
                          {isStudioCover(t.coverUrl) ? (
                            <p className="mt-2 text-[11px] font-bold text-emerald-600">AI 변환 완료</p>
                          ) : (
                            <button
                              type="button"
                              disabled={t.coverBusy}
                              onClick={() => applyStudioToCover(t.kind, t.uid)}
                              className="mt-2 block text-[11px] font-bold text-indigo-600 underline hover:text-indigo-800 disabled:opacity-50"
                            >
                              {t.coverBusy ? <BusyText>AI 변환 중...</BusyText> : "이 표지를 AI 변환"}
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <DropBox
                            className="h-32 w-32"
                            disabled={t.coverBusy}
                            onFiles={(files) => uploadCover(t.kind, t.uid, files[0])}
                          >
                            <span className="text-2xl leading-none"><PlusIcon size={22} /></span>
                            <span className="mt-1 text-[10px]">
                              {t.coverBusy
                                ? <BusyText>{t.coverAutoStudio ? "AI 변환 중..." : "업로드 중..."}</BusyText>
                                : "표지 추가"}
                            </span>
                          </DropBox>
                          {t.detailUrls.length > 0 ? (
                            <button
                              type="button"
                              disabled={t.coverBusy}
                              onClick={() => useDetailAsCover(t.kind, t.uid)}
                              className="mt-2 block text-[11px] font-bold text-indigo-600 underline hover:text-indigo-800 disabled:opacity-50"
                            >
                              상세 1번 사진을 표지로 사용
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>

                    {/* 상세 */}
                    <div>
                      <p className="mb-2 text-xs font-bold text-slate-700">상세페이지 사진 (최대 {MAX_DETAIL_PHOTOS}장)</p>
                      <div className="flex flex-wrap gap-2">
                        {t.detailUrls.map((url) => (
                          <div key={url} className="relative h-24 w-24 overflow-hidden rounded-lg border border-slate-200">
                            {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
                            <img src={url} alt="" className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => removeDetail(t.kind, t.uid, url)}
                              className="absolute right-1 top-1 rounded-full bg-slate-900/70 px-1.5 text-xs font-bold text-white"
                            >
                              <CloseIcon size={12} />
                            </button>
                          </div>
                        ))}
                        {t.detailUrls.length < MAX_DETAIL_PHOTOS ? (
                          <DropBox
                            className="h-24 w-24"
                            multiple
                            disabled={t.detailBusy}
                            onFiles={(files) => uploadDetails(t.kind, t.uid, files)}
                          >
                            <span className="text-xl leading-none"><PlusIcon size={18} /></span>
                            <span className="mt-1 text-[10px]">{t.detailBusy ? <BusyText>업로드 중...</BusyText> : "사진 추가"}</span>
                          </DropBox>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </section>
              ))}
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={publishOnComplete}
                  onChange={(e) => setPublishOnComplete(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm font-bold text-slate-900">등록 즉시 스토어에 공개</span>
                <span className="text-xs text-slate-500">
                  (정가/판매가가 입력된 책만 공개됩니다. 끄면 비공개로 등록 후 나중에 공개)
                </span>
              </label>
              <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
                <span className="text-sm text-slate-500">
                  신규 {newProductsForSubmit.length}종 · 기존 {existingAdditions.length}종
                  {serialPlan.startNum !== null && serialPlan.total > 0
                    ? ` · 일련번호 ${formatSerialRange(serialPlan.startNum, serialPlan.total)}`
                    : ""}
                </span>
                <button
                  type="button"
                  disabled={submitting || !hasItems}
                  onClick={handleSubmit}
                  className="rounded-md bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  {submitting ? <BusyText>등록 중...</BusyText> : "등록 완료"}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>

      {/* Frame 3: 기존 교재 옵션/재고 추가 모달 */}
      {/* 신규 교재 카테고리 설정 모달 — 과목/브랜드/유형을 각각 선택(미선택=자동 파싱) */}
      {(() => {
        const categoryRow = newRows.find((r) => r.uid === categoryModalUid) ?? null;
        if (!categoryRow) return null;
        return (
          <AdminDialog
            open
            onClose={() => setCategoryModalUid(null)}
            title="카테고리 설정"
            size="sm"
            footer={
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setCategoryModalUid(null)}
                  className="btn-primary !w-auto !px-5 !py-2 text-sm"
                >
                  완료
                </button>
              </div>
            }
          >
            <div className="space-y-4 px-6 py-5">
              <p className="text-xs text-slate-500">
                {categoryRow.title.trim() ? (
                  <>
                    <span className="font-bold text-slate-700">{categoryRow.title.trim()}</span>
                    <br />
                  </>
                ) : null}
                항목별로 하나씩 선택할 수 있어요. <strong>자동</strong>으로 두면 상품명에서
                인식하고, 선택하면 그 값이 우선 적용됩니다.
              </p>
              {CATEGORY_FIELDS.map((field) => (
                <div key={field.key}>
                  <label
                    className="mb-1 block text-xs font-bold text-slate-500"
                    htmlFor={`register-category-${field.key}`}
                  >
                    {field.label}
                  </label>
                  <select
                    id={`register-category-${field.key}`}
                    value={categoryRow[field.key]}
                    onChange={(e) => handleRowChange(categoryRow.uid, field.key, e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">자동 (상품명에서 인식)</option>
                    {field.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </AdminDialog>
        );
      })()}

      <AdminDialog
        open={Boolean(framePanel)}
        onClose={() => setFramePanel(null)}
        title={framePanel?.isEditing ? "기존 교재 재고 수정" : "기존 교재 재고 추가"}
        size="xl"
      >
        {framePanel ? (
          <div className="p-6">
            <div className="flex items-start gap-4 border-b border-slate-200 pb-4">
              <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                {framePanel.product.cover_image_url ? (
                  // eslint-disable-next-line jsx-a11y/img-redundant-alt
                  <img src={framePanel.product.cover_image_url} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div>
                <p className="text-base font-black text-slate-900">{framePanel.product.title}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {[framePanel.product.subject, framePanel.product.brand, framePanel.product.representative_grade]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  정가 {formatCurrency(framePanel.product.representative_original_price)}
                </p>
              </div>
            </div>

            {/* 기존 옵션 재고 추가 — 정가/할인 입력 시 판매가 자동 계산 (신규 등록과 동일 규칙) */}
            <div className="mt-5">
              <h3 className="text-sm font-black text-slate-900">재고 수량 추가하기</h3>
              {framePanel.existingOptions.some((o) => o.isDefaultSynthetic) ? (
                <p className="mt-1 text-xs text-slate-500">
                  옵션이 없는 교재입니다 — 옵션명 없이 <strong>기본 옵션</strong>으로 수량만 추가됩니다.
                </p>
              ) : null}
              {framePanel.existingOptions.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">기존 옵션이 없습니다. 아래에서 새 옵션을 추가하세요.</p>
              ) : (
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-500">
                      <th className="py-2">옵션명</th>
                      <th className="py-2 w-20 text-center">현재 재고</th>
                      <th className="py-2 w-24">추가 수량</th>
                      <th className="py-2 w-24">정가</th>
                      <th className="py-2 w-24">할인 방식</th>
                      <th className="py-2 w-20">할인 값</th>
                      <th className="py-2 w-24">판매가</th>
                    </tr>
                  </thead>
                  <tbody>
                    {framePanel.existingOptions.map((o, idx) => (
                      <tr key={`${o.option}-${idx}`} className="border-b border-slate-100">
                        <td className="py-2 font-semibold text-slate-800">{o.option || "기본 옵션"}</td>
                        <td className="py-2 text-center text-slate-500">{o.stock_count}권</td>
                        <td className="py-2">
                          <input
                            type="number"
                            min="0"
                            value={o.quantity}
                            onChange={(e) => updateExistingOpt(idx, "quantity", e.target.value)}
                            placeholder="0"
                            className="w-full rounded border border-slate-200 px-2 py-1.5"
                          />
                        </td>
                        <td className="py-2">
                          <input
                            type="number"
                            min="0"
                            value={o.originalPrice}
                            onChange={(e) => updateExistingOpt(idx, "originalPrice", e.target.value)}
                            placeholder="원"
                            className="w-full rounded border border-slate-200 px-2 py-1.5"
                          />
                        </td>
                        <td className="py-2">
                          <select
                            value={o.discountType}
                            onChange={(e) => updateExistingOpt(idx, "discountType", e.target.value)}
                            className="w-full rounded border border-slate-200 px-1 py-1.5"
                          >
                            {FRAME_DISCOUNT_TYPES.map((d) => (
                              <option key={d.value} value={d.value}>{d.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2">
                          <input
                            type="number"
                            min="0"
                            value={o.discountValue}
                            disabled={o.discountType === "none"}
                            onChange={(e) => updateExistingOpt(idx, "discountValue", e.target.value)}
                            placeholder={o.discountType === "rate" ? "%" : o.discountType === "amount" ? "원" : "-"}
                            className="w-full rounded border border-slate-200 px-2 py-1.5 disabled:bg-slate-100"
                          />
                        </td>
                        <td className="py-2">
                          {o.discountType === "none" ? (
                            <input
                              type="number"
                              min="0"
                              value={o.price}
                              onChange={(e) => updateExistingOpt(idx, "price", e.target.value)}
                              placeholder="원"
                              className="w-full rounded border border-slate-200 px-2 py-1.5"
                            />
                          ) : (
                            <span className="block px-1 py-1.5 text-right font-bold text-slate-900">
                              {computeSellPrice(o.originalPrice, o.discountType, o.discountValue) == null
                                ? "—"
                                : formatCurrency(computeSellPrice(o.originalPrice, o.discountType, o.discountValue))}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* 신규 옵션 추가 */}
            <div className="mt-6">
              <h3 className="text-sm font-black text-slate-900">신규 옵션 추가하기</h3>
              <p className="mt-1 text-xs text-slate-500">
                수량 1 · 판매가(판매 중 가격)는 미리 채워져요 — 옵션명만 입력하면 됩니다. 판매가를 고치면
                아직 손대지 않은 행에도 같이 적용되고, 정가+할인을 입력하면 판매가가 자동 계산돼요.
              </p>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-500">
                    <th className="py-2">옵션명</th>
                    <th className="py-2 w-24">재고 수량</th>
                    <th className="py-2 w-24">정가</th>
                    <th className="py-2 w-24">할인 방식</th>
                    <th className="py-2 w-20">할인 값</th>
                    <th className="py-2 w-24">판매가</th>
                  </tr>
                </thead>
                <tbody>
                  {framePanel.newOptions.map((o, idx) => (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="py-2">
                        <input
                          type="text"
                          value={o.option}
                          onChange={(e) => updateNewOpt(idx, "option", e.target.value)}
                          placeholder="예: 7권"
                          className="w-full rounded border border-slate-200 px-2 py-1.5"
                        />
                      </td>
                      <td className="py-2">
                        <input
                          type="number"
                          min="0"
                          value={o.quantity}
                          onChange={(e) => updateNewOpt(idx, "quantity", e.target.value)}
                          placeholder="0"
                          className="w-full rounded border border-slate-200 px-2 py-1.5"
                        />
                      </td>
                      <td className="py-2">
                        <input
                          type="number"
                          min="0"
                          value={o.originalPrice}
                          onChange={(e) => updateNewOpt(idx, "originalPrice", e.target.value)}
                          placeholder="원"
                          className="w-full rounded border border-slate-200 px-2 py-1.5"
                        />
                      </td>
                      <td className="py-2">
                        <select
                          value={o.discountType}
                          onChange={(e) => updateNewOpt(idx, "discountType", e.target.value)}
                          className="w-full rounded border border-slate-200 px-1 py-1.5"
                        >
                          {FRAME_DISCOUNT_TYPES.map((d) => (
                            <option key={d.value} value={d.value}>{d.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2">
                        <input
                          type="number"
                          min="0"
                          value={o.discountValue}
                          disabled={o.discountType === "none"}
                          onChange={(e) => updateNewOpt(idx, "discountValue", e.target.value)}
                          placeholder={o.discountType === "rate" ? "%" : o.discountType === "amount" ? "원" : "-"}
                          className="w-full rounded border border-slate-200 px-2 py-1.5 disabled:bg-slate-100"
                        />
                      </td>
                      <td className="py-2">
                        {o.discountType === "none" ? (
                          <input
                            type="number"
                            min="0"
                            value={o.price}
                            onChange={(e) => updateNewOpt(idx, "price", e.target.value)}
                            placeholder="원"
                            className="w-full rounded border border-slate-200 px-2 py-1.5"
                          />
                        ) : (
                          <span className="block px-1 py-1.5 text-right font-bold text-slate-900">
                            {computeSellPrice(o.originalPrice, o.discountType, o.discountValue) == null
                              ? "—"
                              : formatCurrency(computeSellPrice(o.originalPrice, o.discountType, o.discountValue))}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 창고 위치 — 이 교재(배치)로 추가되는 책들에만 적용 (권별 수정은 상품 재고에서) */}
            <div className="mt-6">
              <h3 className="text-sm font-black text-slate-900">창고 위치</h3>
              <input
                type="text"
                value={framePanel.location ?? ""}
                onChange={(e) => setFramePanel((fp) => (fp ? { ...fp, location: e.target.value } : fp))}
                placeholder="예: A1, 모7"
                className="mt-2 w-48 rounded border border-slate-200 px-2 py-1.5 text-sm"
              />
              <p className="mt-2 text-xs text-slate-500">
                이 교재에만 적용됩니다. 일련번호는 목록 확정 후 시작 번호부터 순차 배정되고,
                목록 화면에서 교재별로 직접 지정할 수도 있어요.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setFramePanel(null)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmFramePanel}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
              >
                {framePanel.isEditing ? "수정 반영" : "목록에 추가"}
              </button>
            </div>
          </div>
        ) : null}
      </AdminDialog>

      {/* 등록 완료 — 자동 채번된 일련번호 안내 (실물 라벨링용) */}
      <AdminDialog
        open={Boolean(completeInfo)}
        onClose={goAfterComplete}
        title="등록 완료"
        size="sm"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={goAfterComplete}
              className="btn-primary !w-auto !px-5 !py-2 text-sm"
            >
              확인
            </button>
          </div>
        }
      >
        {completeInfo ? (
          <div className="space-y-3 px-6 py-5">
            <p className="text-sm font-bold text-slate-900">
              교재 {completeInfo.products}종 · 재고 {completeInfo.books}권 등록 완료
              {publishOnComplete ? " (스토어 공개)" : ""}
            </p>
            {completeInfo.serials.length > 0 ? (
              <>
                <p className="text-xs text-slate-500">
                  아래 일련번호가 자동 부여되었습니다. 실물 책에 번호 라벨을 붙여주세요.
                </p>
                <p className="max-h-40 overflow-y-auto rounded-lg bg-slate-50 px-3 py-2 font-mono text-sm font-bold text-slate-800">
                  {formatSerialList(completeInfo.serials)}
                </p>
              </>
            ) : null}
          </div>
        ) : null}
      </AdminDialog>

      {toast ? (
        <div
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md px-4 py-2 text-sm font-bold text-white shadow-lg ${
            toast.tone === "error" ? "bg-rose-600" : toast.tone === "success" ? "bg-emerald-600" : "bg-slate-900"
          }`}
        >
          {toast.message}
        </div>
      ) : null}
      <LoadingOverlay
        detail="책 수량이 많으면 시간이 걸립니다"
        message="상품을 등록하고 있습니다"
        open={submitting}
      />
    </AdminShell>
  );
}

export default AdminProductRegisterPage;
