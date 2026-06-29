import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import AdminDialog from "../components/AdminDialog";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { formatCurrency } from "@shared-domain/format";

// 통합 상품 등록 플로우 (Frame 2~4 프로토타입).
//   고객(수거) 선택/생성 → 교재 목록 작성(기존 검색 + 신규 표) → 사진 일괄 → 등록 완료
//   교재 = products(카탈로그), 재고/권 = books(1권=1row), 고객 = shipments(소유)
//   할인/등급/메타 처리는 admin_register_customer_inventory RPC가 담당.

const COVER_BUCKET = "product-covers";
const DETAIL_BUCKET = "inspection-images";
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const DISCOUNT_TYPES = [
  { value: "none", label: "정가" },
  { value: "amount", label: "정액(원)" },
  { value: "rate", label: "정률(%)" },
];

let uidCounter = 0;
function nextUid() {
  uidCounter += 1;
  return `u${Date.now().toString(36)}-${uidCounter.toString(36)}`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function blankNewRow() {
  return {
    uid: nextUid(),
    title: "",
    option: "",
    originalPrice: "",
    discountType: "none",
    discountValue: "",
    coverUrl: "",
    coverBusy: false,
    detailUrls: [],
    detailBusy: false,
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
        {done ? "✓" : index}
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

  // 완료/공개
  const [publishOnComplete, setPublishOnComplete] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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
        p_limit: 20,
      });
      if (!active) return;
      if (error) {
        showToast(error.message || "교재 검색에 실패했습니다.", "error");
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

  // 신규 교재 행 편집 — 마지막 행이 채워지면 빈 행 자동 추가
  const handleRowChange = (uid, field, value) => {
    setNewRows((prev) => {
      let rows = prev.map((r) => (r.uid === uid ? { ...r, [field]: value } : r));
      const last = rows[rows.length - 1];
      if (last && !isNewRowBlank(last)) rows = [...rows, blankNewRow()];
      return rows;
    });
  };
  const handleRowDelete = (uid) => {
    setNewRows((prev) => {
      const rows = prev.filter((r) => r.uid !== uid);
      if (rows.length === 0 || !isNewRowBlank(rows[rows.length - 1])) rows.push(blankNewRow());
      return rows;
    });
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
    setFramePanel({
      product,
      existingOptions,
      newOptions: [{ option: "", quantity: "", price: product.representative_original_price ?? "" }],
    });
  };

  const updateExistingOpt = (idx, field, val) =>
    setFramePanel((fp) => ({
      ...fp,
      existingOptions: fp.existingOptions.map((o, i) => (i === idx ? { ...o, [field]: val } : o)),
    }));
  const updateNewOpt = (idx, field, val) =>
    setFramePanel((fp) => {
      let arr = fp.newOptions.map((o, i) => (i === idx ? { ...o, [field]: val } : o));
      const last = arr[arr.length - 1];
      if (last && (last.option.trim() || String(last.quantity).trim() || String(last.price).trim())) {
        arr = [...arr, { option: "", quantity: "", price: "" }];
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
      if (q !== null && q >= 1) {
        options.push({ option: o.option.trim(), quantity: Math.trunc(q), price: o.price });
      }
    });
    if (options.length === 0) {
      showToast("추가할 옵션의 수량을 1 이상 입력하세요.", "error");
      return;
    }
    setExistingAdditions((prev) => {
      const others = prev.filter((a) => a.product.id !== fp.product.id);
      return [
        ...others,
        {
          uid: nextUid(),
          product: fp.product,
          options,
          coverUrl: fp.product.cover_image_url || "",
          coverBusy: false,
          detailUrls: [],
          detailBusy: false,
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
    setItemBusy(kind, uid, "coverBusy", true);
    try {
      const url = await uploadImageToBucket(COVER_BUCKET, file);
      if (url) {
        if (kind === "new") patchRow(uid, { coverUrl: url });
        else patchAddition(uid, { coverUrl: url });
      }
    } catch (err) {
      showToast(err?.message || "표지 업로드 실패", "error");
    } finally {
      setItemBusy(kind, uid, "coverBusy", false);
    }
  };

  const uploadDetails = async (kind, uid, files) => {
    setItemBusy(kind, uid, "detailBusy", true);
    const urls = [];
    for (const file of files) {
      try {
        const url = await uploadImageToBucket(DETAIL_BUCKET, file);
        if (url) urls.push(url);
      } catch (err) {
        showToast(err?.message || "상세 사진 업로드 실패", "error");
      }
    }
    if (kind === "new") {
      setNewRows((prev) =>
        prev.map((r) => (r.uid === uid ? { ...r, detailUrls: [...(r.detailUrls || []), ...urls], detailBusy: false } : r)),
      );
    } else {
      setExistingAdditions((prev) =>
        prev.map((a) => (a.uid === uid ? { ...a, detailUrls: [...(a.detailUrls || []), ...urls], detailBusy: false } : a)),
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
        coverUrl: r.coverUrl,
        coverBusy: r.coverBusy,
        detailUrls: r.detailUrls || [],
        detailBusy: r.detailBusy,
      })),
      ...existingAdditions.map((a) => ({
        kind: "existing",
        uid: a.uid,
        title: a.product.title,
        subtitle: a.options.map((o) => o.option || "옵션 없음").join(", "),
        coverUrl: a.coverUrl,
        coverBusy: a.coverBusy,
        detailUrls: a.detailUrls || [],
        detailBusy: a.detailBusy,
      })),
    ],
    [newProductsForSubmit, existingAdditions],
  );

  const handleSubmit = async () => {
    if (!shipment) return;
    setSubmitting(true);
    const new_products = newProductsForSubmit.map((r) => ({
      title: r.title.trim(),
      original_price: String(r.originalPrice).replaceAll(",", "").trim() || null,
      discount_type: r.discountType || "none",
      discount_value: r.discountType === "none" ? null : String(r.discountValue).replaceAll(",", "").trim() || null,
      option: r.option.trim(),
      cover_image_url: r.coverUrl || null,
      inspection_image_urls: r.detailUrls || [],
      is_public: publishOnComplete,
    }));
    const existing_additions = existingAdditions.map((a) => ({
      product_id: a.product.id,
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
      p_payload: { new_products, existing_additions },
    });
    setSubmitting(false);
    if (error) {
      showToast(error.message || "등록에 실패했습니다.", "error");
      return;
    }
    const createdProducts = data?.created_products ?? 0;
    const createdBooks = data?.created_books ?? 0;
    showToast(
      `교재 ${createdProducts}종 · 재고 ${createdBooks}권 등록 완료${publishOnComplete ? " (스토어 공개)" : ""}`,
      "success",
    );
    navigate(`/admin/shipments/${shipment.id}`);
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
                    prodResults.map((p) => (
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
                    ))
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
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-500">
                        <th className="py-2 pr-2">상품명</th>
                        <th className="py-2 pr-2 w-28">옵션</th>
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
                        return (
                          <tr key={row.uid} className="border-b border-slate-100 align-top">
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
                                  ✕
                                </button>
                              ) : null}
                            </td>
                          </tr>
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

            <div className="flex items-center justify-end gap-3">
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
              <p className="text-sm text-slate-500">표지 사진 1장 + 상세페이지 사진 여러 장 (선택 사항)</p>
            </div>

            <p className="rounded-lg bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700">
              AI 사진 변환(사진 스튜디오)에서 변환·다운로드한 이미지를 아래 칸에 추가하세요. 빈칸 클릭 또는 드래그&드롭.
            </p>

            <div className="space-y-4">
              {photoTargets.map((t) => (
                <section key={`${t.kind}-${t.uid}`} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="mb-3">
                    <p className="text-sm font-black text-slate-900">{t.title}</p>
                    <p className="text-xs text-slate-500">옵션: {t.subtitle}</p>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">
                    {/* 표지 */}
                    <div>
                      <p className="mb-2 text-xs font-bold text-slate-700">표지 사진</p>
                      {t.coverUrl ? (
                        <div className="relative h-32 w-32 overflow-hidden rounded-lg border border-slate-200">
                          {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
                          <img src={t.coverUrl} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => clearCover(t.kind, t.uid)}
                            className="absolute right-1 top-1 rounded-full bg-slate-900/70 px-1.5 text-xs font-bold text-white"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <DropBox
                          className="h-32 w-32"
                          disabled={t.coverBusy}
                          onFiles={(files) => uploadCover(t.kind, t.uid, files[0])}
                        >
                          <span className="text-2xl">＋</span>
                          <span className="mt-1 text-[10px]">{t.coverBusy ? "업로드 중..." : "표지 추가"}</span>
                        </DropBox>
                      )}
                    </div>

                    {/* 상세 */}
                    <div>
                      <p className="mb-2 text-xs font-bold text-slate-700">상세페이지 사진</p>
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
                              ✕
                            </button>
                          </div>
                        ))}
                        <DropBox
                          className="h-24 w-24"
                          multiple
                          disabled={t.detailBusy}
                          onFiles={(files) => uploadDetails(t.kind, t.uid, files)}
                        >
                          <span className="text-xl">＋</span>
                          <span className="mt-1 text-[10px]">{t.detailBusy ? "업로드 중..." : "사진 추가"}</span>
                        </DropBox>
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
              <div className="mt-4 flex items-center justify-end gap-3">
                <span className="text-sm text-slate-500">
                  신규 {newProductsForSubmit.length}종 · 기존 {existingAdditions.length}종
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
