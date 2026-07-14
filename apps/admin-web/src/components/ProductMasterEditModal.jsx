import { useEffect, useRef, useState } from "react";
import AdminDialog from "./AdminDialog";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { formatCurrency } from "@shared-domain/format";
import { COVER_BUCKET, DETAIL_BUCKET, uploadImageToBucket } from "../lib/adminImageUpload";
import { CloseIcon } from "./icons";

// 상품 마스터 수정 모달 (2026-07-06 운영 피드백: 제목/가격/사진 수정 기능).
//
// - 제목/옵션/정가/대표사진: 상품 + 소속 books 전체에 적용 (admin_update_product_master)
// - 판매가/상세사진: book(1권) 단위 개별 적용
// - 정산완료(settled)·폐기(discarded) 책의 판매가는 서버에서 변경을 막는다
//   (레거시 셀러 조회가 books.price로 정산액을 표시하므로 이력 보호)

const CONDITION_LABEL = {
  S: "S (새 책)",
  A_PLUS: "A+ (사용감 적음)",
  A: "A (사용감 있음)",
};

const BOOK_STATUS_LABEL = {
  on_sale: "판매중",
  reserved: "예약(주문)",
  settled: "정산완료",
  discarded: "폐기",
};

function toPositiveInt(value) {
  const n = Number(String(value ?? "").replaceAll(",", "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
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
  const [originalPriceInput, setOriginalPriceInput] = useState("");
  const [originalPriceDirty, setOriginalPriceDirty] = useState(false);
  const [originalPriceUniform, setOriginalPriceUniform] = useState(true);
  const [coverUrl, setCoverUrl] = useState("");
  const [coverDirty, setCoverDirty] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [books, setBooks] = useState([]);
  const [detailBusyBookId, setDetailBusyBookId] = useState(null);
  // 닫기 전 확인용 — 아무 필드든 건드리면 true
  const [touched, setTouched] = useState(false);

  // 모달이 열릴 때 소속 books 로드 + 드래프트 초기화
  useEffect(() => {
    if (!product || !isSupabaseConfigured || !supabase) return undefined;
    let cancelled = false;

    setTitle(product.title ?? "");
    setOption(product.option ?? "");
    setCoverUrl(product.cover_image_url ?? "");
    setCoverDirty(false);
    setOriginalPriceInput("");
    setOriginalPriceDirty(false);
    setOriginalPriceUniform(true);
    setBooks([]);
    setErrorMessage("");
    setTouched(false);
    setIsLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from("books")
        .select("id,price,original_price,condition_grade,status,is_public,inspection_image_urls,cover_image_url")
        .eq("product_id", product.id)
        .order("id", { ascending: true });

      if (cancelled) return;
      setIsLoading(false);

      if (error) {
        setErrorMessage(error.message || "인스턴스 목록을 불러오지 못했습니다.");
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      setBooks(
        rows.map((row) => ({
          id: row.id,
          priceInput: row.price != null ? String(row.price) : "",
          originalPrice: row.original_price,
          conditionGrade: row.condition_grade,
          status: row.status,
          isPublic: row.is_public,
          images: Array.isArray(row.inspection_image_urls) ? row.inspection_image_urls : [],
        })),
      );

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

  const uploadBookDetails = async (bookId, files) => {
    setDetailBusyBookId(bookId);
    setErrorMessage("");
    try {
      const urls = [];
      for (const file of files) {
        // eslint-disable-next-line no-await-in-loop
        const url = await uploadImageToBucket(DETAIL_BUCKET, file, "edit-detail");
        if (url) urls.push(url);
      }
      setBooks((current) =>
        current.map((book) =>
          book.id === bookId ? { ...book, images: [...book.images, ...urls] } : book,
        ),
      );
      if (urls.length > 0) setTouched(true);
    } catch (error) {
      setErrorMessage(error?.message || "상세사진 업로드에 실패했습니다.");
    } finally {
      setDetailBusyBookId(null);
    }
  };

  const removeBookImage = (bookId, url) => {
    setTouched(true);
    setBooks((current) =>
      current.map((book) =>
        book.id === bookId
          ? { ...book, images: book.images.filter((image) => image !== url) }
          : book,
      ),
    );
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

    // 가격 검증 — 가격 수정 가능한 책(판매중/예약)은 양수 필수
    const bookPayload = [];
    for (const book of books) {
      const editable = !["settled", "discarded"].includes(book.status);
      const entry = { id: book.id, inspection_image_urls: book.images };
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
      p_option: option.trim() || null,
      p_original_price: originalPrice,
      p_cover_image_url: coverDirty ? coverUrl || null : null,
      p_books: bookPayload,
    });
    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message || "상품 수정에 실패했습니다.");
      return;
    }

    onSaved?.(data);
  };

  const busy = isSaving || coverBusy || detailBusyBookId !== null;

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
                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">옵션</span>
                  <input
                    className="input-base"
                    onChange={(event) => {
                      setOption(event.target.value);
                      setTouched(true);
                    }}
                    placeholder="예: 2026, 상/하 세트"
                    type="text"
                    value={option}
                  />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                    정가(원){originalPriceUniform ? "" : " — 인스턴스별 상이"}
                  </span>
                  <input
                    className="input-base font-mono"
                    inputMode="numeric"
                    onChange={(event) => {
                      setOriginalPriceInput(event.target.value);
                      setOriginalPriceDirty(true);
                      setTouched(true);
                    }}
                    placeholder={originalPriceUniform ? "예: 32,000" : "입력 시 전체 인스턴스에 일괄 적용"}
                    type="text"
                    value={originalPriceInput}
                  />
                </label>
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
                      교체 시 이 상품의 모든 인스턴스 커버에 함께 적용됩니다.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-bold text-slate-700">
                  인스턴스별 판매가·상세사진 ({books.length}권)
                </h3>
                {books.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-400">
                    연결된 인스턴스가 없습니다. (제목/옵션/대표사진만 수정됩니다)
                  </p>
                ) : (
                  <div className="space-y-3">
                    {books.map((book) => {
                      const priceLocked = ["settled", "discarded"].includes(book.status);
                      return (
                        <div className="rounded-lg border border-slate-200 p-3" key={book.id}>
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="font-mono text-xs font-bold text-slate-500">#{book.id}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                              {CONDITION_LABEL[book.conditionGrade] ?? book.conditionGrade ?? "-"}
                            </span>
                            <span className="text-xs text-slate-500">
                              {BOOK_STATUS_LABEL[book.status] ?? book.status}
                              {book.isPublic ? " · 노출 중" : ""}
                            </span>
                            <div className="flex-1" />
                            <label className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-600">판매가</span>
                              <input
                                className="input-base !w-32 font-mono text-right"
                                disabled={priceLocked}
                                inputMode="numeric"
                                onChange={(event) => setBookPrice(book.id, event.target.value)}
                                title={priceLocked ? "정산완료/폐기된 책의 가격은 변경할 수 없습니다." : ""}
                                type="text"
                                value={book.priceInput}
                              />
                            </label>
                          </div>
                          {priceLocked ? (
                            <p className="mt-1 text-right text-[11px] text-slate-400">
                              정산완료/폐기 책 — 가격 변경 불가 (현재 {book.priceInput ? formatCurrency(Number(book.priceInput)) : "-"})
                            </p>
                          ) : null}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {book.images.map((url) => (
                              <div className="relative h-16 w-16" key={url}>
                                <img
                                  alt="상세 사진"
                                  className="h-full w-full rounded-md border border-slate-200 object-cover"
                                  src={url}
                                />
                                <button
                                  aria-label="사진 삭제"
                                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white hover:bg-rose-600"
                                  onClick={() => removeBookImage(book.id, url)}
                                  type="button"
                                >
                                  <CloseIcon size={12} />
                                </button>
                              </div>
                            ))}
                            <FileButton
                              busy={detailBusyBookId === book.id}
                              multiple
                              onFiles={(files) => uploadBookDetails(book.id, files)}
                            >
                              + 상세사진 추가
                            </FileButton>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <p className="rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800">
                제목·옵션·정가·대표사진은 이 상품의 <strong>모든 인스턴스</strong>에 함께 적용됩니다.
                저장 즉시 고객 사이트에 반영됩니다.
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
