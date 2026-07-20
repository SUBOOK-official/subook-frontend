import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminShell from "../components/AdminShell";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { DETAIL_BUCKET, MAX_DETAIL_PHOTOS, uploadImageToBucket } from "../lib/adminImageUpload";
import { CheckCircleIcon, CloseIcon, InboxIcon, SearchIcon } from "../components/icons";

// 사진 입고 (스캐너 연동) — 2026-07-20
//
// 스캐너가 로컬 폴더에 내지(상세) 사진을 떨구면, 이 페이지가 폴더를 감시(File System
// Access API)해서 새 스캔을 즉시 집어 올리고, "상세사진 없는 상품" 큐(위치 순서)에
// 차례로 붙인다. 책마다 1~2장이 가변이므로 자동 넘김 없이 Enter로 확정한다.
//
//  · 큐 모드(기본): 위치순 작업 큐 — 스캔 → (스캔) → Enter(저장&다음)
//  · 일련번호 모드: 번호 입력 → 해당 책의 상품으로 점프 → 스캔 → Enter
//  · 2장 초과 스캔은 자동으로 붙이지 않고 "미배정 트레이"로 (실수 방지)
//  · 저장 = admin_update_product_master 재사용 (상세사진은 책 종류 단위 · 전 권 동일 적용)
//  · 처리된 스캔 파일은 폴더 안 "완료/" 하위폴더로 이동 (재등록 방지 + 진행률 가시화)

const SCAN_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];
const POLL_INTERVAL_MS = 1500;
const RESIZE_MAX_EDGE = 1600;
const DONE_DIR_NAME = "완료";

const locationCollator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });

function isScanFileName(name) {
  const lower = String(name || "").toLowerCase();
  return SCAN_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function processedStorageKey(folderName) {
  return `photoIntakeProcessed:${folderName || "default"}`;
}

function loadProcessedNames(folderName) {
  try {
    const raw = window.localStorage.getItem(processedStorageKey(folderName));
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

function saveProcessedNames(folderName, set) {
  try {
    // 최근 5,000개만 유지 (localStorage 비대화 방지)
    const list = [...set].slice(-5000);
    window.localStorage.setItem(processedStorageKey(folderName), JSON.stringify(list));
  } catch {
    /* 저장 실패는 치명적이지 않음 — 완료 폴더 이동이 1차 방어선 */
  }
}

// 스캔 원본(PNG 수 MB)을 긴 변 기준으로 줄여 JPEG로 변환 — 업로드·상세페이지 로딩 최적화
async function toUploadFile(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, RESIZE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("이미지 변환 실패");
    const baseName = String(file.name || "scan").replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    // 변환 실패 시 원본 업로드 (용량 가드는 업로드 헬퍼가 수행)
    return file;
  }
}

function primaryLocation(locations) {
  if (!Array.isArray(locations) || locations.length === 0) return null;
  return [...locations].sort((a, b) => locationCollator.compare(a, b))[0];
}

function AdminPhotoIntakePage() {
  // ── 데이터 (상품 · 책) ─────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [products, setProducts] = useState([]); // 전체 (selling + sold_out)
  const [serialIndex, setSerialIndex] = useState(() => new Map());

  // ── 폴더 감시 ──────────────────────────────────────────────────
  const [folderName, setFolderName] = useState("");
  const [watchError, setWatchError] = useState("");
  const dirHandleRef = useRef(null);
  const seenNamesRef = useRef(new Set());
  const pendingRef = useRef(new Map()); // name → size (쓰기 완료 대기)
  const processedRef = useRef(new Set());
  const ingestingRef = useRef(false);

  // ── 작업 상태 ──────────────────────────────────────────────────
  const [queueFilter, setQueueFilter] = useState("missing"); // missing | all
  const [currentId, setCurrentId] = useState(null);
  const [staged, setStaged] = useState([]); // { name, url } — 현재 상품에 붙일 스캔 (≤2)
  const [tray, setTray] = useState([]); // 미배정 스캔
  const [uploadingCount, setUploadingCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [lastAction, setLastAction] = useState(null); // { productId, title, prevImagesByBook, fileNames }
  const [toast, setToast] = useState(null);
  const [serialQuery, setSerialQuery] = useState("");

  const showToast = useCallback((message, tone = "info") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  // ── 상품·책 로드 ───────────────────────────────────────────────
  const loadCatalog = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    setIsLoading(true);
    setLoadError("");
    try {
      const productRows = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("products")
          .select("id,title,option,status,cover_image_url")
          .neq("status", "hidden")
          .order("id", { ascending: true })
          .range(from, from + 999);
        if (error) throw error;
        productRows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }

      const bookRows = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("books")
          .select("id,product_id,status,option,inspection_image_urls,serial_number,location")
          .not("product_id", "is", null)
          .order("id", { ascending: true })
          .range(from, from + 999);
        if (error) throw error;
        bookRows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }

      const byProduct = new Map();
      for (const book of bookRows) {
        if (!byProduct.has(book.product_id)) byProduct.set(book.product_id, []);
        byProduct.get(book.product_id).push(book);
      }

      const serialMap = new Map();
      const entries = [];
      for (const product of productRows) {
        const books = byProduct.get(product.id) ?? [];
        if (books.length === 0) continue;
        const onSale = books.filter((b) => b.status === "on_sale");
        const locations = [
          ...new Set(onSale.map((b) => (b.location ?? "").trim()).filter(Boolean)),
        ].sort((a, b) => locationCollator.compare(a, b));
        const serials = onSale
          .map((b) => b.serial_number)
          .filter((v) => v != null)
          .sort((a, b) => a - b);
        const withImages = books.find(
          (b) => Array.isArray(b.inspection_image_urls) && b.inspection_image_urls.length > 0,
        );
        // RPC의 옵션 전파 가드와 동일 규칙으로 "안전한 p_option"을 미리 계산해 둔다.
        // 상품 옵션이 비어 있는데 권 옵션이 균일한 상품에서 null을 보내면 권 옵션이
        // 지워질 수 있으므로, 그 경우엔 권들의 균일 옵션을 그대로 넘긴다.
        const distinctBookOptions = [...new Set(books.map((b) => (b.option ?? "").trim()))];
        const uniformBookOption =
          distinctBookOptions.length === 1 && distinctBookOptions[0] !== ""
            ? books.find((b) => (b.option ?? "").trim() !== "")?.option ?? null
            : null;
        const safeOption = product.option ?? uniformBookOption;
        const prevImagesByBook = {};
        for (const b of books) {
          prevImagesByBook[b.id] = Array.isArray(b.inspection_image_urls)
            ? b.inspection_image_urls
            : [];
        }
        for (const b of books) {
          if (b.serial_number != null) serialMap.set(Number(b.serial_number), product.id);
        }
        entries.push({
          id: product.id,
          title: product.title,
          option: safeOption,
          status: product.status,
          coverImageUrl: product.cover_image_url ?? null,
          bookIds: books.map((b) => b.id),
          onSaleCount: onSale.length,
          locations,
          serials,
          hasDetail: Boolean(withImages),
          detailImages: withImages ? withImages.inspection_image_urls : [],
          prevImagesByBook,
        });
      }

      setProducts(entries);
      setSerialIndex(serialMap);
    } catch (err) {
      setLoadError(err?.message || "상품 데이터를 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // ── 큐 구성 ────────────────────────────────────────────────────
  const workQueue = useMemo(() => {
    const base =
      queueFilter === "missing"
        ? products.filter((p) => !p.hasDetail && p.status === "selling" && p.onSaleCount > 0)
        : products.filter((p) => p.onSaleCount > 0);
    return [...base].sort((a, b) => {
      const la = primaryLocation(a.locations);
      const lb = primaryLocation(b.locations);
      if (la && lb) {
        const cmp = locationCollator.compare(la, lb);
        if (cmp !== 0) return cmp;
      } else if (la || lb) {
        return la ? -1 : 1;
      }
      return a.id - b.id;
    });
  }, [products, queueFilter]);

  const current = useMemo(() => {
    if (currentId != null) {
      const found = products.find((p) => p.id === currentId);
      if (found) return found;
    }
    return workQueue[0] ?? null;
  }, [products, workQueue, currentId]);

  // 폴링 콜백에서 최신 상태를 읽기 위한 ref 미러 (StrictMode 이중 호출에도 안전)
  const currentRef = useRef(null);
  const stagedRef = useRef([]);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);
  useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);

  // 선택 상품이 바뀌면(수동 클릭·건너뛰기) 붙어있던 스캔은 트레이로 — 엉뚱한 상품에
  // 저장되는 사고 방지. 저장 직후에는 staged가 이미 비어 있어 아무 일도 없다.
  const prevProductIdRef = useRef(null);
  useEffect(() => {
    const prevId = prevProductIdRef.current;
    prevProductIdRef.current = current?.id ?? null;
    if (prevId != null && current?.id !== prevId && stagedRef.current.length > 0) {
      const orphaned = stagedRef.current;
      setStaged([]);
      setTray((t) => [...t, ...orphaned]);
      showToast("선택 상품이 바뀌어 대기 중이던 스캔을 트레이로 옮겼어요.", "info");
    }
  }, [current?.id, showToast]);

  const goToOffset = useCallback(
    (delta) => {
      if (workQueue.length === 0) return;
      const idx = current ? workQueue.findIndex((p) => p.id === current.id) : -1;
      const nextIdx = Math.min(Math.max(idx + delta, 0), workQueue.length - 1);
      const next = workQueue[nextIdx];
      if (next) setCurrentId(next.id);
    },
    [workQueue, current],
  );

  // ── 폴더 연결 · 감시 ───────────────────────────────────────────
  const supportsFolderWatch = typeof window !== "undefined" && "showDirectoryPicker" in window;

  const connectFolder = async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      dirHandleRef.current = handle;
      seenNamesRef.current = new Set();
      pendingRef.current = new Map();
      processedRef.current = loadProcessedNames(handle.name);
      setFolderName(handle.name);
      setWatchError("");
      showToast(`"${handle.name}" 폴더 감시를 시작했습니다.`, "success");
    } catch (err) {
      if (err?.name !== "AbortError") {
        setWatchError(err?.message || "폴더 연결에 실패했습니다.");
      }
    }
  };

  const markProcessed = useCallback((name) => {
    processedRef.current.add(name);
    saveProcessedNames(dirHandleRef.current?.name, processedRef.current);
  }, []);

  const moveToDone = useCallback(
    async (name) => {
      const dir = dirHandleRef.current;
      markProcessed(name);
      if (!dir) return;
      try {
        const fileHandle = await dir.getFileHandle(name);
        const doneDir = await dir.getDirectoryHandle(DONE_DIR_NAME, { create: true });
        if (typeof fileHandle.move === "function") {
          await fileHandle.move(doneDir, name);
          return;
        }
        // move 미지원 브라우저 폴백: 복사 후 원본 삭제
        const file = await fileHandle.getFile();
        const target = await doneDir.getFileHandle(name, { create: true });
        const writable = await target.createWritable();
        await writable.write(file);
        await writable.close();
        await dir.removeEntry(name);
      } catch {
        // 이동 실패해도 processed 기록이 재등록을 막는다
      }
    },
    [markProcessed],
  );

  // 새 스캔 1건 처리: 리사이즈 → 업로드 → 현재 상품(2장 미만) 또는 트레이
  const ingestScan = useCallback(
    async (name, file) => {
      setUploadingCount((n) => n + 1);
      try {
        const uploadFile = await toUploadFile(file);
        const url = await uploadImageToBucket(DETAIL_BUCKET, uploadFile, "scan");
        if (!url) throw new Error("업로드 결과 URL 없음");
        const scan = { name, url };
        // 목적지 판정은 ref 미러로 — setState 업데이터 안에서 다른 setState를 부르지 않는다
        if (currentRef.current && stagedRef.current.length < MAX_DETAIL_PHOTOS) {
          setStaged((list) => [...list, scan]);
        } else {
          setTray((list) => [...list, scan]);
          showToast("현재 상품에 이미 2장이 있어 트레이로 보냈어요.", "info");
        }
      } catch (err) {
        showToast(`${name} 업로드 실패: ${err?.message || "알 수 없는 오류"}`, "error");
        // 실패 파일은 다시 시도할 수 있게 seen에서 제거
        seenNamesRef.current.delete(name);
      } finally {
        setUploadingCount((n) => Math.max(0, n - 1));
      }
    },
    [showToast],
  );

  // 폴더 폴링 — 파일 크기가 두 번 연속 같을 때만 집어온다 (스캐너 쓰기 완료 대기)
  useEffect(() => {
    if (!folderName) return undefined;
    let cancelled = false;

    const poll = async () => {
      const dir = dirHandleRef.current;
      if (!dir || ingestingRef.current) return;
      ingestingRef.current = true;
      try {
        for await (const [name, handle] of dir.entries()) {
          if (cancelled) break;
          if (handle.kind !== "file" || !isScanFileName(name)) continue;
          if (seenNamesRef.current.has(name) || processedRef.current.has(name)) continue;
          let file;
          try {
            file = await handle.getFile();
          } catch {
            continue;
          }
          const pendingSize = pendingRef.current.get(name);
          if (pendingSize === file.size && file.size > 0) {
            pendingRef.current.delete(name);
            seenNamesRef.current.add(name);
            await ingestScan(name, file);
          } else {
            pendingRef.current.set(name, file.size);
          }
        }
        setWatchError("");
      } catch (err) {
        setWatchError(err?.message || "폴더를 읽지 못했습니다. 다시 연결해 주세요.");
      } finally {
        ingestingRef.current = false;
      }
    };

    const timer = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [folderName, ingestScan]);

  // ── 배정 조작 ──────────────────────────────────────────────────
  const removeStaged = (name) => {
    setStaged((list) => {
      const target = list.find((s) => s.name === name);
      if (target) setTray((t) => [...t, target]);
      return list.filter((s) => s.name !== name);
    });
  };

  const assignFromTray = (name) => {
    if (staged.length >= MAX_DETAIL_PHOTOS) {
      showToast(`상세사진은 최대 ${MAX_DETAIL_PHOTOS}장까지예요.`, "error");
      return;
    }
    const target = tray.find((s) => s.name === name);
    if (!target) return;
    setTray((list) => list.filter((s) => s.name !== name));
    setStaged((list) => (list.length >= MAX_DETAIL_PHOTOS ? list : [...list, target]));
  };

  // 트레이 X = 완전 삭제 — 폴더 원본 파일과 업로드된 스토리지 사본까지 지운다 (2026-07-20 피드백)
  const deleteScan = async (scan) => {
    setTray((list) => list.filter((s) => s.name !== scan.name));
    markProcessed(scan.name); // 파일 삭제가 실패해도 재수집은 막는다
    try {
      await dirHandleRef.current?.removeEntry(scan.name);
    } catch {
      /* 이미 없거나 잠긴 파일 — processed 기록으로 충분 */
    }
    try {
      const marker = `/object/public/${DETAIL_BUCKET}/`;
      const idx = String(scan.url).indexOf(marker);
      if (idx !== -1) {
        const path = decodeURIComponent(String(scan.url).slice(idx + marker.length));
        await supabase.storage.from(DETAIL_BUCKET).remove([path]);
      }
    } catch {
      /* 스토리지 잔재는 무해 — 실패해도 진행 */
    }
    showToast("스캔을 삭제했습니다.", "info");
  };

  // ── 저장 · 되돌리기 ────────────────────────────────────────────
  const saveCurrent = useCallback(async () => {
    if (!current || staged.length === 0 || isSaving) return;
    setIsSaving(true);
    const urls = staged.map((s) => s.url);
    const fileNames = staged.map((s) => s.name);
    const { error } = await supabase.rpc("admin_update_product_master", {
      p_product_id: current.id,
      p_title: current.title,
      p_option: current.option ?? null,
      p_books: current.bookIds.map((id) => ({ id, inspection_image_urls: urls })),
    });
    if (error) {
      setIsSaving(false);
      showToast(error.message || "저장에 실패했습니다.", "error");
      return;
    }

    setLastAction({
      productId: current.id,
      title: current.title,
      option: current.option ?? null,
      prevImagesByBook: current.prevImagesByBook,
      fileNames,
    });
    for (const name of fileNames) {
      // eslint-disable-next-line no-await-in-loop
      await moveToDone(name);
    }

    // 로컬 상태 갱신 — 재조회 없이 큐에서 빠지도록
    setProducts((list) =>
      list.map((p) =>
        p.id === current.id
          ? {
              ...p,
              hasDetail: true,
              detailImages: urls,
              prevImagesByBook: Object.fromEntries(p.bookIds.map((id) => [id, urls])),
            }
          : p,
      ),
    );
    setStaged([]);
    setSavedCount((n) => n + 1);
    setIsSaving(false);
    showToast(`"${current.title}" 상세사진 ${urls.length}장 저장 완료`, "success");
    // 큐 모드: 저장한 상품이 필터에서 빠지므로 자연스럽게 다음 항목이 current가 된다
    setCurrentId(null);
  }, [current, staged, isSaving, moveToDone, showToast]);

  const undoLast = async () => {
    if (!lastAction || isSaving) return;
    setIsSaving(true);
    const { error } = await supabase.rpc("admin_update_product_master", {
      p_product_id: lastAction.productId,
      p_title: lastAction.title,
      p_option: lastAction.option,
      p_books: Object.entries(lastAction.prevImagesByBook).map(([id, images]) => ({
        id: Number(id),
        inspection_image_urls: images,
      })),
    });
    setIsSaving(false);
    if (error) {
      showToast(error.message || "되돌리기에 실패했습니다.", "error");
      return;
    }
    const prevByBook = lastAction.prevImagesByBook;
    const hadImages = Object.values(prevByBook).some((arr) => arr.length > 0);
    setProducts((list) =>
      list.map((p) =>
        p.id === lastAction.productId
          ? {
              ...p,
              hasDetail: hadImages,
              detailImages: Object.values(prevByBook).find((arr) => arr.length > 0) ?? [],
              prevImagesByBook: prevByBook,
            }
          : p,
      ),
    );
    setCurrentId(lastAction.productId);
    setSavedCount((n) => Math.max(0, n - 1));
    showToast(
      "마지막 저장을 되돌렸습니다. (스캔 파일은 완료 폴더에 그대로 있어요)",
      "info",
    );
    setLastAction(null);
  };

  // ── 일련번호 점프 ──────────────────────────────────────────────
  const jumpToSerial = () => {
    const serial = Number(String(serialQuery).trim());
    if (!Number.isInteger(serial) || serial <= 0) {
      showToast("일련번호를 숫자로 입력해 주세요.", "error");
      return;
    }
    const productId = serialIndex.get(serial);
    if (!productId) {
      showToast(`일련번호 ${serial}에 해당하는 책을 찾지 못했습니다.`, "error");
      return;
    }
    setCurrentId(productId);
    setSerialQuery("");
    showToast(`No.${serial} → 상품으로 이동했습니다.`, "success");
  };

  // ── 키보드: Enter 저장&다음, ←/→ 이동 (입력 필드에서는 무시) ────
  useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      const tag = target instanceof HTMLElement ? target.tagName : "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.key === "Enter") {
        event.preventDefault();
        void saveCurrent();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToOffset(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToOffset(-1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveCurrent, goToOffset]);

  const missingCount = useMemo(
    () => products.filter((p) => !p.hasDetail && p.status === "selling" && p.onSaleCount > 0).length,
    [products],
  );
  const currentQueuePos = current ? workQueue.findIndex((p) => p.id === current.id) : -1;

  return (
    <AdminShell
      activeModule="photo-intake"
      description="스캐너 폴더를 감시해 상세사진을 상품에 바로 붙입니다 — 스캔 → Enter(저장&다음)"
      title="사진 입고 (스캐너)"
    >
      {!isSupabaseConfigured ? (
        <p className="notice-error">Supabase 환경 변수가 설정되지 않아 사용할 수 없습니다.</p>
      ) : null}

      {/* 상단: 폴더 연결 + 진행 상태 + 일련번호 점프 */}
      <div className="card flex flex-wrap items-center gap-3 p-4">
        {supportsFolderWatch ? (
          <button className="btn-primary !w-auto !px-4 !py-2 text-sm" onClick={connectFolder} type="button">
            {folderName ? "스캔 폴더 다시 선택" : "스캔 폴더 연결"}
          </button>
        ) : (
          <p className="text-sm font-semibold text-rose-600">
            이 브라우저는 폴더 감시를 지원하지 않아요. Chrome 또는 Edge에서 열어주세요.
          </p>
        )}
        {folderName ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
            <CheckCircleIcon size={13} /> "{folderName}" 감시 중
          </span>
        ) : null}
        {uploadingCount > 0 ? (
          <span className="text-xs font-bold text-indigo-600">업로드 중 {uploadingCount}건...</span>
        ) : null}
        {watchError ? <span className="text-xs font-bold text-rose-600">{watchError}</span> : null}

        <div className="flex-1" />

        <span className="text-sm font-semibold text-slate-600">
          오늘 저장 <strong className="text-slate-900">{savedCount}</strong>권 · 남은 상품{" "}
          <strong className="text-slate-900">{missingCount}</strong>개
        </span>

        <div className="flex items-center gap-1.5">
          <SearchIcon size={14} />
          <input
            className="input-base !mt-0 !w-36 !py-2 text-sm"
            inputMode="numeric"
            onChange={(event) => setSerialQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                jumpToSerial();
              }
            }}
            placeholder="일련번호 점프"
            type="text"
            value={serialQuery}
          />
        </div>
      </div>

      {loadError ? <p className="notice-error mt-4">{loadError}</p> : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[320px_1fr]">
        {/* 좌: 작업 큐 */}
        <section className="card !p-0 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-black text-slate-900">작업 큐</h2>
            <div className="flex-1" />
            <select
              className="input-base !mt-0 !w-auto !py-1.5 text-xs"
              onChange={(event) => setQueueFilter(event.target.value)}
              value={queueFilter}
            >
              <option value="missing">상세사진 없는 상품</option>
              <option value="all">전체 상품</option>
            </select>
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            {isLoading ? (
              <p className="p-6 text-center text-sm text-slate-400">불러오는 중...</p>
            ) : workQueue.length === 0 ? (
              <p className="p-6 text-center text-sm font-semibold text-emerald-700">
                {queueFilter === "missing" ? "상세사진 없는 상품이 없습니다. 끝!" : "표시할 상품이 없습니다."}
              </p>
            ) : (
              workQueue.slice(0, 400).map((product, index) => {
                const isCurrent = current?.id === product.id;
                return (
                  <button
                    className={`flex w-full items-start gap-2 border-b border-slate-100 px-4 py-2.5 text-left transition ${
                      isCurrent ? "bg-slate-950 text-white" : "hover:bg-slate-50"
                    }`}
                    key={product.id}
                    onClick={() => setCurrentId(product.id)}
                    type="button"
                  >
                    <span
                      className={`mt-0.5 font-mono text-[11px] font-bold ${
                        isCurrent ? "text-white/70" : "text-indigo-600"
                      }`}
                    >
                      {primaryLocation(product.locations) ?? "—"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">{product.title}</span>
                      <span className={`block text-[11px] ${isCurrent ? "text-white/60" : "text-slate-400"}`}>
                        No.{product.serials.slice(0, 4).join(", ") || "—"}
                        {product.serials.length > 4 ? " 외" : ""} · {product.onSaleCount}권
                        {product.hasDetail ? " · 상세 있음" : ""}
                      </span>
                    </span>
                    <span className={`text-[10px] font-bold ${isCurrent ? "text-white/60" : "text-slate-300"}`}>
                      {index + 1}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* 우: 현재 상품 + 트레이 */}
        <div className="space-y-4">
          <section className="card p-5">
            {current ? (
              <>
                <div className="flex flex-wrap items-start gap-4">
                  <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                    {current.coverImageUrl ? (
                      <img alt="" className="h-full w-full object-cover" src={current.coverImageUrl} />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                        no img
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-600">
                      지금 스캔할 책{currentQueuePos >= 0 ? ` — 큐 ${currentQueuePos + 1}/${workQueue.length}` : ""}
                    </p>
                    <h2 className="mt-0.5 text-lg font-black text-slate-900">{current.title}</h2>
                    <p className="mt-1 font-mono text-sm font-bold text-indigo-700">
                      위치 {current.locations.join(" · ") || "미지정"} · No.
                      {current.serials.join(", ") || "—"}
                    </p>
                    {current.hasDetail ? (
                      <p className="mt-1 text-xs font-semibold text-amber-700">
                        이미 상세사진 {current.detailImages.length}장 있음 — 저장하면 새 스캔으로 교체됩니다.
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* 스캔 슬롯 */}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {[0, 1].map((slot) => {
                    const scan = staged[slot];
                    return scan ? (
                      <div className="relative h-40 w-32" key={scan.name}>
                        <img
                          alt={`스캔 ${slot + 1}`}
                          className="h-full w-full rounded-lg border border-slate-200 object-cover"
                          src={scan.url}
                        />
                        <button
                          aria-label="이 스캔을 트레이로 빼기"
                          className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-rose-600"
                          onClick={() => removeStaged(scan.name)}
                          type="button"
                        >
                          <CloseIcon size={13} />
                        </button>
                      </div>
                    ) : (
                      <div
                        className="flex h-40 w-32 flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400"
                        key={`empty-${slot}`}
                      >
                        <InboxIcon size={20} />
                        <span className="mt-1 text-[11px] font-semibold">
                          {slot === 0 ? "스캔 대기" : "(선택) 2장째"}
                        </span>
                      </div>
                    );
                  })}

                  <div className="flex flex-col gap-2">
                    <button
                      className="btn-primary !w-auto !px-6 !py-3 text-sm"
                      disabled={staged.length === 0 || isSaving}
                      onClick={() => void saveCurrent()}
                      type="button"
                    >
                      {isSaving ? "저장 중..." : `저장 & 다음 (Enter) — ${staged.length}장`}
                    </button>
                    <div className="flex gap-2">
                      <button
                        className="btn-secondary !w-auto !px-4 !py-2 text-xs"
                        onClick={() => goToOffset(1)}
                        type="button"
                      >
                        건너뛰기 →
                      </button>
                      {lastAction ? (
                        <button
                          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
                          disabled={isSaving}
                          onClick={() => void undoLast()}
                          type="button"
                        >
                          마지막 저장 되돌리기
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="p-6 text-center text-sm text-slate-400">
                {isLoading ? "불러오는 중..." : "작업할 상품이 없습니다."}
              </p>
            )}
          </section>

          {/* 미배정 트레이 */}
          {tray.length > 0 ? (
            <section className="card p-4">
              <h3 className="text-sm font-black text-slate-900">
                미배정 스캔 ({tray.length}) —{" "}
                <span className="font-semibold text-slate-500">
                  2장 초과분이나 트레이로 뺀 스캔입니다. 클릭하면 현재 상품에 붙어요.
                </span>
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {tray.map((scan) => (
                  <div className="relative" key={scan.name}>
                    <button
                      className="block h-28 w-24 overflow-hidden rounded-lg border border-slate-200 transition hover:ring-2 hover:ring-indigo-400"
                      onClick={() => assignFromTray(scan.name)}
                      title={`${scan.name} — 현재 상품에 추가`}
                      type="button"
                    >
                      <img alt={scan.name} className="h-full w-full object-cover" src={scan.url} />
                    </button>
                    <button
                      aria-label="스캔 삭제"
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white hover:bg-rose-600"
                      onClick={() => void deleteScan(scan)}
                      title="스캔 삭제 (파일도 지워집니다)"
                      type="button"
                    >
                      <CloseIcon size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <p className="text-xs leading-relaxed text-slate-400">
            사용법: ① 스캔 폴더 연결 → ② 큐의 현재 책을 스캐너에 올리고 스캔 (1~2장) → ③ Enter로
            저장&다음. 순서 없이 작업할 땐 일련번호 점프를 쓰세요. 저장된 스캔 파일은 폴더 안 "
            {DONE_DIR_NAME}" 하위폴더로 이동합니다. 상세사진은 책 종류 단위라 그 상품의 모든 권에
            함께 적용돼요.
          </p>
        </div>
      </div>

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

export default AdminPhotoIntakePage;
