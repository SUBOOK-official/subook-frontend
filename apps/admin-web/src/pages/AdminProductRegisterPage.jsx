import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import AdminDialog from "../components/AdminDialog";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { formatCurrency } from "@shared-domain/format";
import { CheckIcon, CloseIcon, PlusIcon } from "../components/icons";
import { BOOK_TYPE_OPTIONS, BRAND_OPTIONS, SUBJECT_OPTIONS } from "../lib/productCategories";
import { MAX_DETAIL_PHOTOS } from "../lib/adminImageUpload";
import {
  prepareStudioImagePayload,
  requestStudioGeneration,
  studioResultToFile,
} from "../lib/studioClient";

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
    location,
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
function blankNewOption(price = "") {
  return { option: "", quantity: "1", price, priceAuto: true };
}

function isNewRowBlank(row) {
  return (
    !row.title.trim() &&
    !row.option.trim() &&
    !String(row.originalPrice).trim() &&
    !String(row.discountValue).trim()
  );
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

function optionSummary(optionStr) {
  const items = String(optionStr || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items.join(", ") : "옵션 없음";
}

// ── 일련번호 배정 미리보기 ──────────────────────────────────────────
// RPC(admin_register_customer_inventory)와 동일 규칙으로 권수를 세야
// 미리보기 번호와 실제 배정 번호가 어긋나지 않는다.
//   신규 교재: 콤마 옵션 1개당 1권 (옵션 없으면 1권)
//   기존 교재: 옵션별 추가 수량 합
function countBooksForNewRow(row) {
  const optionCount = String(row.option || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean).length;
  return optionCount > 0 ? optionCount : 1;
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

  const [shipment, setShipment] = useState(null);
  const [step, setStep] = useState("customer"); // customer | list | photos
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

  // 신규 교재 (Frame 2 우측)
  const [newRows, setNewRows] = useState([blankNewRow()]);
  // 기존 교재 재고 추가 (Frame 3 결과)
  const [existingAdditions, setExistingAdditions] = useState([]);
  // 교재 검색 (Frame 2 좌측)
  const [prodSearch, setProdSearch] = useState("");
  const [prodResults, setProdResults] = useState([]);
  const [prodLoading, setProdLoading] = useState(false);
  // Frame 3 모달
  const [framePanel, setFramePanel] = useState(null);
  // 신규 교재 카테고리(과목·브랜드·유형) 설정 모달 — 대상 행 uid
  const [categoryModalUid, setCategoryModalUid] = useState(null);
  // 창고 위치 항상성 — 한 곳에서 입력하면 배치 전체(신규 행·기존 교재)에 같은 값이 따라간다
  const [batchLocation, setBatchLocation] = useState("");
  // 시작 일련번호 — 운영자가 정하면 등록 순서대로 start, start+1, ... 순차 배정
  const [serialStart, setSerialStart] = useState("");
  // 유사 시세 힌트 — uid → RPC 결과, 같은 조건은 세션 내 캐시 재사용
  const [priceHints, setPriceHints] = useState({});
  const hintCacheRef = useRef(new Map());

  // 완료/공개
  const [publishOnComplete, setPublishOnComplete] = useState(true);
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
      setStep("list");
    })();
    return () => {
      active = false;
    };
  }, [shipmentIdParam, showToast]);

  // 고객 검색 (디바운스)
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
      const { data } = await supabase
        .from("shipments")
        .select("id,seller_name,seller_phone,pickup_date,status,created_at")
        .or(`seller_name.ilike.%${q}%,seller_phone.ilike.%${q}%`)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!active) return;
      setCustResults(data || []);
      setCustLoading(false);
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [custSearch, step]);

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
      });
      if (!active) return;
      if (error) {
        showToast(`교재 검색에 실패했습니다${error?.message ? ` — ${error.message}` : ""}`, "error");
        setProdResults([]);
      } else {
        setProdResults(Array.isArray(data) ? data : []);
      }
      setProdLoading(false);
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [prodSearch, step, showToast]);

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

  const handleCreateCustomer = async (event) => {
    event.preventDefault();
    if (!newCust.seller_name.trim() || !newCust.seller_phone.trim() || !newCust.pickup_date) {
      showToast("이름 · 전화번호 · 수거 일자를 입력하세요.", "error");
      return;
    }
    setCreatingCust(true);
    const { data, error } = await supabase
      .from("shipments")
      .insert({
        seller_name: newCust.seller_name.trim(),
        seller_phone: newCust.seller_phone.trim(),
        pickup_date: newCust.pickup_date,
        status: "scheduled",
      })
      .select("id,seller_name,seller_phone,pickup_date,status")
      .single();
    setCreatingCust(false);
    if (error) {
      showToast(error.message || "고객 등록에 실패했습니다.", "error");
      return;
    }
    setShipment(data);
    setStep("list");
    showToast(`${data.seller_name} 님 고객을 새로 등록했습니다.`, "success");
  };

  const selectCustomer = (customer) => {
    setShipment(customer);
    setStep("list");
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

  // 창고 위치 항상성 — 어느 한 곳(신규 행·기존 교재 모달)에서 위치를 입력하면
  // 아직 같은 값을 따라가던 항목(빈 값 또는 직전 배치 위치와 동일)을 전부 갱신한다.
  const applyLocationEverywhere = (value, source) => {
    const prevShared = batchLocation;
    const inSync = (loc) => !String(loc ?? "").trim() || loc === prevShared;
    setNewRows((prev) =>
      prev.map((r) =>
        (source?.kind === "row" && r.uid === source.uid) || inSync(r.location)
          ? { ...r, location: value }
          : r,
      ),
    );
    setExistingAdditions((prev) => prev.map((a) => (inSync(a.location) ? { ...a, location: value } : a)));
    setFramePanel((fp) => {
      if (!fp) return fp;
      if (source?.kind === "panel" || inSync(fp.location)) return { ...fp, location: value };
      return fp;
    });
    setBatchLocation(value);
  };
  const patchRow = (uid, patch) => setNewRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  const patchAddition = (uid, patch) =>
    setExistingAdditions((prev) => prev.map((a) => (a.uid === uid ? { ...a, ...patch } : a)));

  // Frame 3 열기
  const openFramePanel = (product) => {
    const existingOptions = (product.options || []).map((o) => ({
      option: o.option ?? "",
      stock_count: o.stock_count ?? 0,
      quantity: "",
      price: o.price ?? product.representative_original_price ?? "",
    }));
    // 신규 옵션 기본 판매가 — 이미 판매 중인 옵션이 있으면 그 판매가를 따라간다 (없으면 정가)
    const defaultNewPrice =
      existingOptions.find((o) => String(o.price ?? "").trim() !== "")?.price ??
      product.representative_original_price ??
      "";
    // 이미 목록에 추가해 둔 배치를 수정하는 경우 위치 입력값은 유지, 아니면 배치 위치 프리필
    const prevAddition = existingAdditions.find((a) => a.product.id === product.id);
    setFramePanel({
      product,
      existingOptions,
      newOptions: [blankNewOption(defaultNewPrice)],
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
        arr = [...arr, blankNewOption(last.price)];
      }
      return { ...fp, newOptions: arr };
    });

  const confirmFramePanel = () => {
    const fp = framePanel;
    if (!fp) return;
    const options = [];
    fp.existingOptions.forEach((o) => {
      const q = toNumber(o.quantity);
      if (q !== null && q >= 1) {
        options.push({
          option: o.option || "",
          quantity: Math.trunc(q),
          price: o.price,
          original_price: fp.product.representative_original_price ?? "",
        });
      }
    });
    fp.newOptions.forEach((o) => {
      const q = toNumber(o.quantity);
      // 수량 1·판매가가 프리필되므로, 옵션명을 입력한 행만 실제 등록 대상으로 본다
      if (o.option.trim() && q !== null && q >= 1) {
        options.push({ option: o.option.trim(), quantity: Math.trunc(q), price: o.price });
      }
    });
    if (options.length === 0) {
      showToast("기존 옵션의 추가 수량을 입력하거나, 신규 옵션명을 입력하세요.", "error");
      return;
    }
    setExistingAdditions((prev) => {
      const prevAddition = prev.find((a) => a.product.id === fp.product.id);
      const others = prev.filter((a) => a.product.id !== fp.product.id);
      return [
        ...others,
        {
          uid: nextUid(),
          product: fp.product,
          options,
          location: (fp.location ?? "").trim(),
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
        },
      ];
    });
    setFramePanel(null);
    showToast(`"${fp.product.title}" 재고를 목록에 추가했습니다.`, "success");
  };

  const removeAddition = (uid) => setExistingAdditions((prev) => prev.filter((a) => a.uid !== uid));

  // ── 사진 업로드 (kind: new | existing) ────────────────────────────
  const setItemBusy = (kind, uid, field, busy) =>
    kind === "new" ? patchRow(uid, { [field]: busy }) : patchAddition(uid, { [field]: busy });

  const uploadCover = async (kind, uid, file) => {
    // 항목별 토글 — 신규/기존이 섞인 배치에서 어떤 표지는 AI 변환, 어떤 표지는 원본 그대로.
    const list = kind === "new" ? newRows : existingAdditions;
    const autoStudio = list.find((x) => x.uid === uid)?.coverAutoStudio === true;
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
    const current = list.find((x) => x.uid === uid)?.detailUrls?.length ?? 0;
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
  // RPC가 같은 순서로 배정하므로 여기 미리보기와 실제 결과가 일치한다.
  const serialPlan = useMemo(() => {
    const startNum = parseSerialStart(serialStart);
    const invalid = String(serialStart).trim() !== "" && startNum === null;
    const ranges = new Map();
    let cursor = startNum;
    let total = 0;
    const assign = (key, count) => {
      if (count <= 0) return;
      if (cursor !== null) {
        ranges.set(key, { from: cursor, count });
        cursor += count;
      }
      total += count;
    };
    newProductsForSubmit.forEach((r) => assign(`new-${r.uid}`, countBooksForNewRow(r)));
    existingAdditions.forEach((a) => assign(`existing-${a.uid}`, countBooksForAddition(a)));
    return { startNum, invalid, ranges, total };
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
      location: r.location.trim() || null,
      cover_image_url: r.coverUrl || null,
      inspection_image_urls: r.detailUrls || [],
      is_public: publishOnComplete,
    }));
    const existing_additions = existingAdditions.map((a) => ({
      product_id: a.product.id,
      location: a.location || null,
      cover_image_url: a.coverUrl || null,
      inspection_image_urls: a.detailUrls || [],
      is_public: publishOnComplete,
      options: a.options.map((o) => ({
        option: o.option || "",
        quantity: o.quantity,
        price: o.price === "" || o.price == null ? null : String(o.price).replaceAll(",", "").trim(),
        original_price:
          o.original_price === "" || o.original_price == null ? null : String(o.original_price).replaceAll(",", "").trim(),
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

      <div className="mt-5">
        {/* ── STEP 1: 고객 선택/생성 ─────────────────────────────── */}
        {step === "customer" ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-black text-slate-900">기존 고객 검색</h2>
              <p className="mt-1 text-sm text-slate-500">이름 또는 전화번호로 검색하세요.</p>
              <input
                type="search"
                value={custSearch}
                onChange={(e) => setCustSearch(e.target.value)}
                placeholder="예: 나유찬 / 010-1234-5678"
                className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                {custLoading ? (
                  <p className="py-4 text-center text-sm text-slate-400">검색 중...</p>
                ) : custResults.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-400">
                    {custSearch.trim() ? "검색 결과가 없습니다." : "검색어를 입력하세요."}
                  </p>
                ) : (
                  custResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectCustomer(c)}
                      className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left hover:border-slate-900 hover:bg-slate-50"
                    >
                      <div>
                        <p className="font-bold text-slate-900">{c.seller_name}</p>
                        <p className="text-xs text-slate-500">{c.seller_phone}</p>
                      </div>
                      <span className="text-xs font-semibold text-slate-400">선택 →</span>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-black text-slate-900">새 고객 등록</h2>
              <p className="mt-1 text-sm text-slate-500">신규 셀러를 등록하고 바로 상품을 추가합니다.</p>
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
                  {creatingCust ? "등록 중..." : "이 고객으로 상품 등록 시작"}
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
                <input
                  type="search"
                  value={prodSearch}
                  onChange={(e) => setProdSearch(e.target.value)}
                  placeholder="교재 키워드 검색 (예: 또선생)"
                  className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto">
                  {prodLoading ? (
                    <p className="py-4 text-center text-sm text-slate-400">검색 중...</p>
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
                    {prodResults.length >= PROD_SEARCH_LIMIT ? (
                      <p className="rounded-md bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-700">
                        상위 {PROD_SEARCH_LIMIT}건만 표시 중입니다 — 원하는 교재가 안 보이면 검색어를 더 좁혀보세요.
                      </p>
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
                  · 할인 방식을 정가로 두면 정가 그대로 판매 · 옵션은 콤마(,)로 여러 개 자동 등록
                </p>
                <p className="mt-1 text-xs text-indigo-600">
                  · 위치는 한 칸만 입력하면 전체에 자동 적용 · 일련번호는 아래 시작 번호부터 순서대로 자동 배정
                </p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-500">
                        <th className="py-2 pr-2">상품명</th>
                        <th className="py-2 pr-2 w-24">카테고리</th>
                        <th className="py-2 pr-2 w-28">옵션</th>
                        <th className="py-2 pr-2 w-20">위치</th>
                        <th className="py-2 pr-2 w-24">일련번호</th>
                        <th className="py-2 pr-2 w-24">정가</th>
                        <th className="py-2 pr-2 w-24">할인 방식</th>
                        <th className="py-2 pr-2 w-20">할인 값</th>
                        <th className="py-2 pr-2 w-24">판매가</th>
                        <th className="py-2 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {newRows.map((row) => {
                        const sell = computeSellPrice(row.originalPrice, row.discountType, row.discountValue);
                        const blank = isNewRowBlank(row);
                        const hint = priceHints[row.uid];
                        const showHint = !blank && hint?.found && toNumber(hint.suggested_price) !== null;
                        return (
                          <Fragment key={row.uid}>
                          <tr className={`align-top ${showHint ? "" : "border-b border-slate-100"}`}>
                            <td className="py-1.5 pr-2">
                              <input
                                type="text"
                                value={row.title}
                                onChange={(e) => handleRowChange(row.uid, "title", e.target.value)}
                                placeholder="2026 강남대성 …"
                                className="w-full rounded border border-slate-200 px-2 py-1.5"
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              {/* 카테고리(과목·브랜드·유형)는 모달에서 설정 — 표가 뚱뚱해지지 않게
                                  셀에는 현재 선택 요약만 보여준다. 전부 미선택이면 '자동'. */}
                              <button
                                type="button"
                                onClick={() => setCategoryModalUid(row.uid)}
                                className="w-full truncate rounded border border-slate-200 px-2 py-1.5 text-left text-xs font-semibold text-slate-600 hover:border-slate-400"
                                title="과목 · 브랜드 · 유형 설정"
                              >
                                {[row.subject, row.brand, row.bookType].filter(Boolean).join(" · ") || "자동"}
                              </button>
                            </td>
                            <td className="py-1.5 pr-2">
                              <input
                                type="text"
                                value={row.option}
                                onChange={(e) => handleRowChange(row.uid, "option", e.target.value)}
                                placeholder="2권, 3권"
                                className="w-full rounded border border-slate-200 px-2 py-1.5"
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              <input
                                type="text"
                                value={row.location}
                                onChange={(e) =>
                                  applyLocationEverywhere(e.target.value, { kind: "row", uid: row.uid })
                                }
                                placeholder="A1"
                                className="w-full rounded border border-slate-200 px-2 py-1.5"
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              {/* 시작 일련번호 기준 자동 배정 — 이 행 몫의 번호 미리보기 */}
                              <span className="block px-1 py-1.5 font-mono text-xs font-bold text-slate-700">
                                {blank ? "-" : serialRangeText("new", row.uid) || "자동"}
                              </span>
                            </td>
                            <td className="py-1.5 pr-2">
                              <input
                                type="number"
                                min="0"
                                value={row.originalPrice}
                                onChange={(e) => handleRowChange(row.uid, "originalPrice", e.target.value)}
                                placeholder="원"
                                className="w-full rounded border border-slate-200 px-2 py-1.5"
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              <select
                                value={row.discountType}
                                onChange={(e) => handleRowChange(row.uid, "discountType", e.target.value)}
                                className="w-full rounded border border-slate-200 px-1 py-1.5"
                              >
                                {DISCOUNT_TYPES.map((d) => (
                                  <option key={d.value} value={d.value}>
                                    {d.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-1.5 pr-2">
                              <input
                                type="number"
                                min="0"
                                value={row.discountValue}
                                disabled={row.discountType === "none"}
                                onChange={(e) => handleRowChange(row.uid, "discountValue", e.target.value)}
                                placeholder={row.discountType === "rate" ? "%" : row.discountType === "amount" ? "원" : "-"}
                                className="w-full rounded border border-slate-200 px-2 py-1.5 disabled:bg-slate-100"
                              />
                            </td>
                            <td className="py-1.5 pr-2 text-right font-bold text-slate-900">
                              {blank ? "-" : sell == null ? "—" : formatCurrency(sell)}
                            </td>
                            <td className="py-1.5">
                              {!blank ? (
                                <button
                                  type="button"
                                  onClick={() => handleRowDelete(row.uid)}
                                  className="text-slate-300 hover:text-rose-600"
                                  aria-label="행 삭제"
                                >
                                  <CloseIcon size={14} />
                                </button>
                              ) : null}
                            </td>
                          </tr>
                          {showHint ? (
                            <tr className="border-b border-slate-100 bg-indigo-50/50">
                              <td colSpan={10} className="px-2 py-1.5 text-[11px] font-semibold text-indigo-800">
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
                              </td>
                            </tr>
                          ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
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
                      ) : (
                        <DropBox
                          className="h-32 w-32"
                          disabled={t.coverBusy}
                          onFiles={(files) => uploadCover(t.kind, t.uid, files[0])}
                        >
                          <span className="text-2xl leading-none"><PlusIcon size={22} /></span>
                          <span className="mt-1 text-[10px]">
                            {t.coverBusy ? (t.coverAutoStudio ? "AI 변환 중..." : "업로드 중...") : "표지 추가"}
                          </span>
                        </DropBox>
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
                            <span className="mt-1 text-[10px]">{t.detailBusy ? "업로드 중..." : "사진 추가"}</span>
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
                  {submitting ? "등록 중..." : "등록 완료"}
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
        title="기존 교재 재고 추가"
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

            {/* 기존 옵션 재고 추가 */}
            <div className="mt-5">
              <h3 className="text-sm font-black text-slate-900">재고 수량 추가하기</h3>
              {framePanel.existingOptions.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">기존 옵션이 없습니다. 아래에서 새 옵션을 추가하세요.</p>
              ) : (
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-500">
                      <th className="py-2">옵션명</th>
                      <th className="py-2 w-24 text-center">현재 재고</th>
                      <th className="py-2 w-28">추가 수량</th>
                      <th className="py-2 w-28">판매가</th>
                    </tr>
                  </thead>
                  <tbody>
                    {framePanel.existingOptions.map((o, idx) => (
                      <tr key={`${o.option}-${idx}`} className="border-b border-slate-100">
                        <td className="py-2 font-semibold text-slate-800">{o.option || "기본"}</td>
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
                            value={o.price}
                            onChange={(e) => updateExistingOpt(idx, "price", e.target.value)}
                            placeholder="원"
                            className="w-full rounded border border-slate-200 px-2 py-1.5"
                          />
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
                아직 손대지 않은 행에도 같이 적용돼요.
              </p>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-500">
                    <th className="py-2">옵션명</th>
                    <th className="py-2 w-28">재고 수량</th>
                    <th className="py-2 w-28">판매가</th>
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
                          value={o.price}
                          onChange={(e) => updateNewOpt(idx, "price", e.target.value)}
                          placeholder="원"
                          className="w-full rounded border border-slate-200 px-2 py-1.5"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 창고 위치 — 이 배치로 추가되는 모든 책에 적용 (권별 수정은 상품 재고에서)
                입력하면 신규 교재 표 등 배치 전체 위치도 함께 따라간다(항상성). */}
            <div className="mt-6">
              <h3 className="text-sm font-black text-slate-900">창고 위치</h3>
              <input
                type="text"
                value={framePanel.location ?? ""}
                onChange={(e) => applyLocationEverywhere(e.target.value, { kind: "panel" })}
                placeholder="예: A1, 모7"
                className="mt-2 w-48 rounded border border-slate-200 px-2 py-1.5 text-sm"
              />
              <p className="mt-2 text-xs text-slate-500">
                일련번호는 목록 확정 후 시작 번호부터 등록 순서대로 자동 배정됩니다.
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
                목록에 추가
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
    </AdminShell>
  );
}

export default AdminProductRegisterPage;
