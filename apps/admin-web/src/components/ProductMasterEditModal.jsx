import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AdminDialog from "./AdminDialog";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { formatCurrency } from "@shared-domain/format";
import { COVER_BUCKET, DETAIL_BUCKET, MAX_DETAIL_PHOTOS, uploadImageToBucket } from "../lib/adminImageUpload";
import { CloseIcon } from "./icons";
import { BOOK_TYPE_OPTIONS, BRAND_OPTIONS, SUBJECT_OPTIONS } from "../lib/productCategories";
import {
  EDITABLE_BOOK_GRADES,
  GRADE_LOCKED_MESSAGE,
  PRICE_LOCKED_MESSAGE,
  isBookGradeLocked,
  isBookPriceLocked,
} from "../lib/bookEditRules";
import { bookConditionLabel, bookStatusLabel } from "@shared-domain/status";

// 상품 마스터 수정 모달 (2026-07-06 운영 피드백: 제목/가격/사진 수정 기능).
//
// - 제목/정가/대표사진/카테고리(과목·브랜드·유형): 상품 + 소속 books 전체에 적용
//   (admin_update_product_master — 카테고리는 2026-07-14부터 수정 가능)
// - 옵션: 권별 옵션이 모두 같을 때만 books에 전파 (2026-07-19 — 주간지처럼 권별 옵션이
//   다른 상품에서 상품 옵션 하나로 전 권이 덮어써지는 사고 차단, 서버 가드와 동일 규칙)
// - 상세사진: 책 종류(상품) 단위 1세트 — 저장 시 모든 권에 동일 적용 (2026-07-19)
// - 판매가: book(1권) 단위 개별 적용
// - 정산완료(settled)·폐기(discarded) 책의 판매가는 서버에서 변경을 막는다
//   (레거시 셀러 조회가 books.price로 정산액을 표시하므로 이력 보호)

function toPositiveInt(value) {
  const n = Number(String(value ?? "").replaceAll(",", "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

// 현재 값이 canonical 목록에 없으면(레거시 값 등) 맨 앞에 끼워 선택 상태를 보존한다
function withCurrentOption(options, current) {
  const value = (current ?? "").trim();
  return value && !options.includes(value) ? [value, ...options] : options;
}

// 숨김 file input + 버튼 트리거
function FileButton({ accept = "image/*", busy = false, children, className = "", multiple = false, onFiles }) {
  const inputRef = useRef(null);

  return (
    <>
      <input
        accept={accept}
        className="hidden"
        multiple={multiple}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) onFiles(files);
          event.target.value = "";
        }}
        ref={inputRef}
        type="file"
      />
      <button
        className={className || "btn-secondary !w-auto !px-3 !py-1.5 text-xs"}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        {busy ? "업로드 중..." : children}
      </button>
    </>
  );
}

function ProductMasterEditModal({ onClose, onSaved, product }) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [title, setTitle] = useState("");
  const [option, setOption] = useState("");
  const [subject, setSubject] = useState("");
  const [brand, setBrand] = useState("");
  const [bookType, setBookType] = useState("");
  const [originalPriceInput, setOriginalPriceInput] = useState("");
  const [originalPriceDirty, setOriginalPriceDirty] = useState(false);
  const [originalPriceUniform, setOriginalPriceUniform] = useState(true);
  const [coverUrl, setCoverUrl] = useState("");
  const [coverDirty, setCoverDirty] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [books, setBooks] = useState([]);
  // 상세사진 — 책 종류(상품) 단위 1세트. 저장 시 모든 권에 동일 적용 (2026-07-19)
  const [detailImages, setDetailImages] = useState([]);
  const [detailDirty, setDetailDirty] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailUniform, setDetailUniform] = useState(true);
  // 닫기 전 확인용 — 아무 필드든 건드리면 true
  const [touched, setTouched] = useState(false);

  // 모달이 열릴 때 소속 books 로드 + 드래프트 초기화
  useEffect(() => {
    if (!product || !isSupabaseConfigured || !supabase) return undefined;
    let cancelled = false;

    setTitle(product.title ?? "");
    setOption(product.option ?? "");
    setSubject(product.subject ?? "");
    setBrand(product.brand ?? "");
    setBookType(product.book_type ?? "");
    setCoverUrl(product.cover_image_url ?? "");
    setCoverDirty(false);
    setOriginalPriceInput("");
    setOriginalPriceDirty(false);
    setOriginalPriceUniform(true);
    setBooks([]);
    setDetailImages([]);
    setDetailDirty(false);
    setDetailUniform(true);
    setErrorMessage("");
    setTouched(false);
    setIsLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from("books")
        .select("id,shipment_id,option,serial_number,location,price,original_price,condition_grade,status,is_public,inspection_image_urls,cover_image_url")
        .eq("product_id", product.id)
        .order("id", { ascending: true });

      if (cancelled) return;
      setIsLoading(false);

      if (error) {
        setErrorMessage(error.message || "책 목록을 불러오지 못했습니다.");
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      setBooks(
        rows.map((row) => ({
          id: row.id,
          shipmentId: row.shipment_id,
          option: row.option,
          // 권별 옵션명 편집값 (2026-07-23) — 저장 시 p_books[].option으로 전달
          optionInput: row.option ?? "",
          serialNumber: row.serial_number,
          location: row.location,
          priceInput: row.price != null ? String(row.price) : "",
          originalPrice: row.original_price,
          conditionGrade: row.condition_grade,
          // 권별 등급 편집값 (2026-07-23 A+ 유지 정책) — 바뀐 책만 저장 시 전달
          gradeInput: row.condition_grade ?? "",
          status: row.status,
          isPublic: row.is_public,
        })),
      );

      // 상세사진: 책 종류 단위 1세트 — 첫 번째로 사진이 있는 권의 세트를 대표로 사용.
      // 권별로 세트가 다르면(과거 데이터) 안내 문구를 띄우고, 수정·저장 시에만 통일한다.
      const imageSets = rows.map((row) =>
        JSON.stringify(Array.isArray(row.inspection_image_urls) ? row.inspection_image_urls : []),
      );
      const firstWithImages = rows.find((row) => (row.inspection_image_urls?.length ?? 0) > 0);
      setDetailImages(firstWithImages ? [...firstWithImages.inspection_image_urls] : []);
      setDetailUniform(new Set(imageSets).size <= 1);

      // 정가: 모든 인스턴스가 같은 값이면 미리 채우고, 다르면 비워두고 입력 시에만 일괄 적용
      const originalPrices = [...new Set(rows.map((row) => row.original_price ?? null))];
      if (originalPrices.length === 1 && originalPrices[0] != null) {
        setOriginalPriceInput(String(originalPrices[0]));
      } else if (originalPrices.length > 1) {
        setOriginalPriceUniform(false);
      }

      // 대표사진이 product에 없으면 첫 book의 커버로 미리보기
      if (!product.cover_image_url) {
        const firstCover = rows.find((row) => row.cover_image_url)?.cover_image_url;
        if (firstCover) setCoverUrl(firstCover);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [product]);

  const uploadCover = async (files) => {
    setCoverBusy(true);
    setErrorMessage("");
    try {
      const url = await uploadImageToBucket(COVER_BUCKET, files[0], "edit-cover");
      if (url) {
        setCoverUrl(url);
        setCoverDirty(true);
        setTouched(true);
      }
    } catch (error) {
      setErrorMessage(error?.message || "대표사진 업로드에 실패했습니다.");
    } finally {
      setCoverBusy(false);
    }
  };

  // 상세사진 업로드 — 책 종류(상품) 단위 1세트, 최대 MAX_DETAIL_PHOTOS장
  const uploadDetails = async (files) => {
    const remaining = MAX_DETAIL_PHOTOS - detailImages.length;
    if (remaining <= 0) {
      setErrorMessage(`상세사진은 최대 ${MAX_DETAIL_PHOTOS}장까지 등록할 수 있습니다.`);
      return;
    }
    const incoming = Array.from(files).slice(0, remaining);
    setDetailBusy(true);
    setErrorMessage(
      files.length > incoming.length
        ? `상세사진은 최대 ${MAX_DETAIL_PHOTOS}장까지입니다. ${incoming.length}장만 추가했습니다.`
        : "",
    );
    try {
      const urls = [];
      for (const file of incoming) {
        // eslint-disable-next-line no-await-in-loop
        const url = await uploadImageToBucket(DETAIL_BUCKET, file, "edit-detail");
        if (url) urls.push(url);
      }
      if (urls.length > 0) {
        setDetailImages((current) => [...current, ...urls].slice(0, MAX_DETAIL_PHOTOS));
        setDetailDirty(true);
        setTouched(true);
      }
    } catch (error) {
      setErrorMessage(error?.message || "상세사진 업로드에 실패했습니다.");
    } finally {
      setDetailBusy(false);
    }
  };

  const removeDetailImage = (url) => {
    setDetailImages((current) => current.filter((image) => image !== url));
    setDetailDirty(true);
    setTouched(true);
  };

  const setBookPrice = (bookId, value) => {
    setTouched(true);
    setBooks((current) =>
      current.map((book) => (book.id === bookId ? { ...book, priceInput: value } : book)),
    );
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage("상품 제목을 입력해 주세요.");
      return;
    }

    let originalPrice = null;
    if (originalPriceDirty && originalPriceInput.trim()) {
      originalPrice = toPositiveInt(originalPriceInput);
      if (originalPrice === null) {
        setErrorMessage("정가는 1원 이상의 숫자로 입력해 주세요.");
        return;
      }
    }

    // 가격 검증 — 가격 수정 가능한 책(판매중/예약)은 양수 필수.
    // 상세사진은 수정했을 때만 페이로드에 실어 모든 권에 동일 적용한다 (미수정 시 기존 유지).
    const bookPayload = [];
    for (const book of books) {
      const editable = !["settled", "discarded"].includes(book.status);
      // 권별 옵션명 — 항상 현재 입력값을 보낸다 (빈 값 = 옵션 없음). 상태 무관 수정 가능.
      const entry = { id: book.id, option: book.optionInput ?? "" };
      // 권별 등급 — 바뀐 책만 전달 (RPC가 정산완료/폐기·무효값을 재차 가드)
      if (
        book.gradeInput &&
        EDITABLE_BOOK_GRADES.includes(book.gradeInput) &&
        book.gradeInput !== (book.conditionGrade ?? "")
      ) {
        entry.condition_grade = book.gradeInput;
      }
      if (detailDirty) {
        entry.inspection_image_urls = detailImages;
      }
      if (editable) {
        const price = toPositiveInt(book.priceInput);
        if (price === null) {
          setErrorMessage(`#${book.id} 판매가를 1원 이상의 숫자로 입력해 주세요.`);
          return;
        }
        entry.price = price;
      }
      bookPayload.push(entry);
    }

    setIsSaving(true);
    setErrorMessage("");
    const { data, error } = await supabase.rpc("admin_update_product_master", {
      p_product_id: product.id,
      p_title: trimmedTitle,
      // 옵션 입력 UI 없음 — 프리필된 기존 값을 그대로 보내 products.option 유지
      p_option: option.trim() || null,
      p_original_price: originalPrice,
      p_cover_image_url: coverDirty ? coverUrl || null : null,
      p_books: bookPayload,
      // 카테고리 — null이면 서버가 기존 값 유지
      p_subject: subject.trim() || null,
      p_brand: brand.trim() || null,
      p_book_type: bookType.trim() || null,
    });
    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message || "상품 수정에 실패했습니다.");
      return;
    }

    onSaved?.(data);
  };

  // 권별 옵션명 입력 (2026-07-23: 일괄 rename 대신 책 하나하나 세세하게 수정)
  const setBookOption = (bookId, value) => {
    setBooks((current) =>
      current.map((book) => (book.id === bookId ? { ...book, optionInput: value } : book)),
    );
    setTouched(true);
  };

  // 권별 등급 선택 (2026-07-23)
  const setBookGrade = (bookId, value) => {
    setBooks((current) =>
      current.map((book) => (book.id === bookId ? { ...book, gradeInput: value } : book)),
    );
    setTouched(true);
  };

  const busy = isSaving || coverBusy || detailBusy;

  return (
    <AdminDialog
      busy={busy}
      dirty={touched}
      onClose={onClose}
      open={Boolean(product)}
      size="xl"
      title={product ? `상품 수정 — ${product.title}` : ""}
    >
      {product ? (
        <div className="p-6 space-y-5">
          {errorMessage ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </p>
          ) : null}

          {isLoading ? (
            <div className="p-8 text-center text-sm text-slate-400">불러오는 중...</div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">상품 제목 *</span>
                  <input
                    className="input-base"
                    onChange={(event) => {
                      setTitle(event.target.value);
                      setTouched(true);
                    }}
                    type="text"
                    value={title}
                  />
                </label>
                {/* 상품 공통 옵션 입력은 제거(2026-07-19) — 옵션은 권별(books)로만 관리.
                    저장 시에는 기존 products.option 값을 그대로 보내 유지한다. */}
                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                    정가(원){originalPriceUniform ? "" : " — 권별 상이"}
                  </span>
                  <input
                    className="input-base font-mono"
                    inputMode="numeric"
                    onChange={(event) => {
                      setOriginalPriceInput(event.target.value);
                      setOriginalPriceDirty(true);
                      setTouched(true);
                    }}
                    placeholder={originalPriceUniform ? "예: 32,000" : "입력 시 모든 책에 일괄 적용"}
                    type="text"
                    value={originalPriceInput}
                  />
                </label>
                {/* 카테고리 — 등록 후에도 변경 가능 (2026-07-14). 스토어 필터·검색에 즉시 반영 */}
                <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
                  <label>
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">과목</span>
                    <select
                      className="input-base"
                      onChange={(event) => {
                        setSubject(event.target.value);
                        setTouched(true);
                      }}
                      value={subject}
                    >
                      {!product.subject ? <option value="">선택 안 함</option> : null}
                      {withCurrentOption(SUBJECT_OPTIONS, product.subject).map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">브랜드</span>
                    <select
                      className="input-base"
                      onChange={(event) => {
                        setBrand(event.target.value);
                        setTouched(true);
                      }}
                      value={brand}
                    >
                      {!product.brand ? <option value="">선택 안 함</option> : null}
                      {withCurrentOption(BRAND_OPTIONS, product.brand).map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">유형</span>
                    <select
                      className="input-base"
                      onChange={(event) => {
                        setBookType(event.target.value);
                        setTouched(true);
                      }}
                      value={bookType}
                    >
                      {!product.book_type ? <option value="">선택 안 함</option> : null}
                      {withCurrentOption(BOOK_TYPE_OPTIONS, product.book_type).map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">대표 사진</span>
                <div className="flex items-center gap-3">
                  <div className="h-20 w-20 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                    {coverUrl ? (
                      <img alt="대표 사진 미리보기" className="h-full w-full object-cover" src={coverUrl} />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                        no img
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <FileButton busy={coverBusy} onFiles={uploadCover}>
                      사진 교체
                    </FileButton>
                    <p className="text-xs text-slate-400">
                      교체 시 이 상품의 모든 책 표지에 함께 적용됩니다.
                    </p>
                  </div>
                </div>
              </div>

              {/* 상세사진 — 책 종류(상품) 단위 1세트 (2026-07-19: 권별 업로드 폐지) */}
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  상세페이지 사진 (최대 {MAX_DETAIL_PHOTOS}장 — 책 종류 공통)
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {detailImages.map((url) => (
                    <div className="relative h-20 w-20" key={url}>
                      <img
                        alt="상세 사진"
                        className="h-full w-full rounded-md border border-slate-200 object-cover"
                        src={url}
                      />
                      <button
                        aria-label="사진 삭제"
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white hover:bg-rose-600"
                        onClick={() => removeDetailImage(url)}
                        type="button"
                      >
                        <CloseIcon size={12} />
                      </button>
                    </div>
                  ))}
                  {detailImages.length < MAX_DETAIL_PHOTOS ? (
                    <FileButton busy={detailBusy} multiple onFiles={uploadDetails}>
                      + 상세사진 추가
                    </FileButton>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  상세사진은 옵션(권)별이 아니라 책 종류 단위입니다. 수정 후 저장하면 이 상품의
                  모든 권에 동일하게 적용됩니다.
                  {!detailUniform
                    ? " (현재 권별 사진이 서로 달라 첫 세트만 표시 중 — 사진을 수정·저장하면 이 세트로 통일됩니다)"
                    : ""}
                </p>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-bold text-slate-700">
                  권별 옵션·판매가 ({books.length}권)
                </h3>
                {books.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-400">
                    연결된 책이 없습니다. (제목/옵션/대표사진만 수정됩니다)
                  </p>
                ) : (
                  <div className="space-y-3">
                    {books.map((book) => {
                      // 공용 규칙(lib/bookEditRules) — 수거 상세 워크스페이스와 동일 잠금
                      const priceLocked = isBookPriceLocked(book);
                      return (
                        <div className="rounded-lg border border-slate-200 p-3" key={book.id}>
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="font-mono text-xs font-bold text-slate-500">#{book.id}</span>
                            {/* 권별 옵션명 — 저장 시 이 책에만 반영 (2026-07-23) */}
                            <input
                              className="input-base !w-28 !py-1 text-xs font-bold"
                              onChange={(event) => setBookOption(book.id, event.target.value)}
                              placeholder="옵션 없음"
                              title="이 책의 옵션명 (저장 시 반영)"
                              type="text"
                              value={book.optionInput ?? ""}
                            />
                            {book.serialNumber != null || book.location ? (
                              <span className="font-mono text-[11px] font-bold text-slate-500">
                                {book.location ?? "위치 미지정"}
                                {book.serialNumber != null ? ` · No.${book.serialNumber}` : ""}
                              </span>
                            ) : null}
                            {/* 권별 등급 선택 (2026-07-23 A+ 유지 정책) — 정산완료/폐기는 잠금 */}
                            <select
                              className="input-base !w-auto !py-1 text-xs font-bold"
                              disabled={isBookGradeLocked(book)}
                              onChange={(event) => setBookGrade(book.id, event.target.value)}
                              title={isBookGradeLocked(book) ? GRADE_LOCKED_MESSAGE : "이 책의 등급 (저장 시 반영)"}
                              value={book.gradeInput ?? ""}
                            >
                              {!book.gradeInput || !EDITABLE_BOOK_GRADES.includes(book.gradeInput) ? (
                                <option disabled value={book.gradeInput ?? ""}>
                                  {bookConditionLabel[book.gradeInput] ?? book.gradeInput ?? "등급 미지정"}
                                </option>
                              ) : null}
                              {EDITABLE_BOOK_GRADES.map((grade) => (
                                <option key={grade} value={grade}>
                                  {bookConditionLabel[grade] ?? grade}
                                </option>
                              ))}
                            </select>
                            <span className="text-xs text-slate-500">
                              {bookStatusLabel[book.status] ?? book.status}
                              {book.isPublic ? " · 노출 중" : ""}
                            </span>
                            {book.shipmentId ? (
                              <Link
                                className="text-xs font-bold text-brand underline underline-offset-2"
                                onClick={onClose}
                                to={`/admin/shipments/${book.shipmentId}`}
                              >
                                수거 건 열기
                              </Link>
                            ) : null}
                            <div className="flex-1" />
                            <label className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-600">판매가</span>
                              <input
                                className="input-base !w-32 font-mono text-right"
                                disabled={priceLocked}
                                inputMode="numeric"
                                onChange={(event) => setBookPrice(book.id, event.target.value)}
                                title={priceLocked ? PRICE_LOCKED_MESSAGE : ""}
                                type="text"
                                value={book.priceInput}
                              />
                            </label>
                          </div>
                          {priceLocked ? (
                            <p className="mt-1 text-right text-[11px] text-slate-400">
                              판매완료/폐기 책 — 가격 변경 불가 (현재 {book.priceInput ? formatCurrency(Number(book.priceInput)) : "-"})
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <p className="rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800">
                제목·정가·대표사진·상세사진·카테고리(과목/브랜드/유형)는 이 상품의{" "}
                <strong>모든 책</strong>에 함께 적용되고, <strong>옵션명·판매가는 권별로</strong>{" "}
                저장됩니다. 저장 즉시 고객 사이트(검색·카테고리 필터 포함)에 반영됩니다.
              </p>

              <div className="flex gap-2">
                <button className="btn-ghost flex-1" disabled={busy} onClick={onClose} type="button">
                  취소
                </button>
                <button className="btn-primary flex-1" disabled={busy} onClick={handleSave} type="button">
                  {isSaving ? "저장 중..." : "저장"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </AdminDialog>
  );
}

export default ProductMasterEditModal;
