import { useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@shared-supabase/adminSupabaseClient";
import AdminDialog from "../AdminDialog";
import { BusyText } from "../Loading";
import { COVER_BUCKET, uploadImageToBucket, validateImageFile } from "../../lib/adminImageUpload";
import { ilseongAdmin, useIlseongData } from "../../lib/ilseongAdmin";
import { formatCount } from "../../lib/ilseongFormat";
import { finalPrice, storeProductProblem, storeProductsOf } from "../../lib/ilseongProducts";
import { BOOK_TYPE_OPTIONS, BRAND_OPTIONS, SUBJECT_OPTIONS } from "../../lib/productCategories";
import {
  Badge,
  BookList,
  CheckRow,
  EmptyNote,
  ErrorNote,
  FIELD_CLASS,
  Facts,
  Field,
  LoadingNote,
  SMALL_BUTTON,
  Section,
  SubjectDot,
  WarnNote,
  useIlseongFeedback,
} from "./IlseongUi";

// 앱 상품과 수북 상품.
//  - 앱 상품: 한 번 사면(또는 한 번 등록하면) 열리는 교재 묶음. 앱 서버가 가진다(앱 저장소 docs/adr/0039).
//  - 수북 상품: subook.kr에 보이고 결제되는 상품. 앱 상품의 코드를 달고 있으면, 결제가 확인될 때
//    구매한 회원의 앱에 그 교재가 등록된다.
// 여기서 앱 상품을 만들고, 그 앱 상품을 여는 수북 상품을 만들거나(상품·재고·앱 지정을 한 번에) 있는 상품에 잇는다.

/**
 * @param storeProducts  수북 DB에서 앱 상품으로 지정된 상품들({ product_id, title, option, app_product_code, is_listed })
 * @param salesEnabled   앱 패키지 판매가 켜져 있는지(꺼져 있으면 수북 상품을 공개할 수 없다)
 * @param onStoreChanged 수북 상품을 만들거나 바꾼 뒤 — 위 목록을 다시 읽으라는 신호
 */
export default function IlseongProducts({ storeProducts, salesEnabled, onStoreChanged }) {
  const { confirm, toast } = useIlseongFeedback();
  const products = useIlseongData("/api/admin/products");
  const catalog = useIlseongData("/api/admin/series");
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const list = products.data;
  const codes = new Set((list ?? []).map((product) => product.code));
  // 앱 서버에 없는 코드를 단 수북 상품(코드를 잘못 달았거나 앱 상품이 사라진 경우)
  const orphans = (storeProducts ?? []).filter((item) => !codes.has(item.app_product_code));

  const storeAction = async (run, done) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await run();
      if (rpcError) throw new Error(rpcError.message || "바꾸지 못했어요.");
      toast(done);
      onStoreChanged();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  };

  const setListed = async (item, listed) => {
    if (listed && !salesEnabled) {
      setError(new Error("앱 패키지 판매가 꺼져 있어 공개할 수 없어요. 아래 '연결·판매 설정'에서 판매를 먼저 켜 주세요."));
      return;
    }
    const ok = await confirm(
      listed
        ? { title: `'${item.title}' 사이트에 공개할까요?`, message: "subook.kr에 바로 보이고 살 수 있게 돼요. 가격·표지·재고를 확인한 뒤 공개해 주세요.", confirm: "공개" }
        : { title: `'${item.title}' 숨길까요?`, message: "사이트에서 보이지 않게 돼요. 이미 결제된 주문은 그대로 처리돼요.", confirm: "숨기기", danger: true },
    );
    if (!ok) return;
    await storeAction(
      () => supabase.rpc("admin_bulk_set_products_visibility", { p_product_ids: [item.product_id], p_is_public: listed }),
      listed ? "사이트에 공개했어요" : "숨겼어요",
    );
  };

  const unlink = async (item) => {
    const ok = await confirm({
      title: `'${item.title}' 앱 상품에서 뗄까요?`,
      message: "이 상품을 사도 앱에 교재가 등록되지 않게 돼요. 이미 결제된 주문의 등록은 그대로예요.\n상품 자체는 지워지지 않아요.",
      confirm: "떼기",
      danger: true,
    });
    if (!ok) return;
    await storeAction(
      () => supabase.rpc("admin_set_ilseong_app_product", { p_product_id: item.product_id, p_is_app_package: false }),
      "앱 상품에서 뗐어요",
    );
  };

  return (
    <Section
      right={<button className={`btn-primary !w-auto ${SMALL_BUTTON}`} disabled={!catalog.data} onClick={() => setDialog({ kind: "product" })} type="button">앱 상품 만들기</button>}
      sub="앱 상품은 한 번 사면 열리는 교재 묶음이에요. 수북 상품에 앱 상품을 이어 두면, 결제가 확인될 때 구매한 회원의 앱에 그 교재가 등록돼요."
      title="상품"
    >
      {!list ? <ErrorNote error={products.error} onRetry={() => void products.reload()} /> : null}
      {products.loading && !list ? <LoadingNote /> : null}
      <ErrorNote className="mb-3" error={error} />
      {list && list.length === 0 ? <EmptyNote>아직 앱 상품이 없어요.</EmptyNote> : null}

      <div className="space-y-3">
        {(list ?? []).map((product) => {
          const linked = storeProductsOf(storeProducts, product.code);
          return (
            <div className="rounded-xl border border-slate-200 p-4" key={product.code}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-bold text-slate-900">{product.name}</span>
                    {product.active ? <Badge tone="green">등록·판매 가능</Badge> : <Badge>쓰지 않음</Badge>}
                  </p>
                  <p className="mt-0.5 font-mono text-[12px] text-slate-400">{product.code}</p>
                </div>
                <span className="flex flex-wrap gap-1.5">
                  <button className={`btn-secondary ${SMALL_BUTTON}`} disabled={!catalog.data} onClick={() => setDialog({ kind: "product", code: product.code })} type="button">이름·교재 고치기</button>
                  {product.active ? (
                    <>
                      <button className={`btn-secondary ${SMALL_BUTTON}`} onClick={() => setDialog({ kind: "link", code: product.code })} type="button">있는 수북 상품 잇기</button>
                      <button className={`btn-primary !w-auto ${SMALL_BUTTON}`} onClick={() => setDialog({ kind: "store", code: product.code })} type="button">수북 상품 만들기</button>
                    </>
                  ) : null}
                </span>
              </div>
              <div className="mt-3">
                <Facts
                  rows={[
                    ["여는 교재", <BookList books={product.books} key="books" />],
                    ["가진 회원", `${formatCount(product.holders)}명`],
                    ["수북 상품", linked.length === 0
                      ? <span className="text-slate-400" key="none">아직 없어요. 사이트에서 팔려면 [수북 상품 만들기]를 눌러 주세요.</span>
                      : <StoreList busy={busy} items={linked} key="store" onListed={setListed} onUnlink={unlink} />],
                  ]}
                />
              </div>
            </div>
          );
        })}
      </div>

      {orphans.length > 0 ? (
        <WarnNote className="mt-3">
          <p className="font-semibold">앱에 없는 상품 코드를 단 수북 상품이 있어요. 이 상품은 결제돼도 앱에 교재가 등록되지 않아요.</p>
          <StoreList busy={busy} items={orphans} onListed={setListed} onUnlink={unlink} showCode />
        </WarnNote>
      ) : null}

      {dialog?.kind === "product" ? (
        <ProductDialog
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            void products.reload({ quiet: true });
          }}
          product={list?.find((product) => product.code === dialog.code) ?? null}
          series={catalog.data ?? []}
        />
      ) : null}
      {dialog?.kind === "store" ? (
        <StoreProductDialog
          onClose={() => setDialog(null)}
          onCreated={() => {
            setDialog(null);
            onStoreChanged();
          }}
          product={list?.find((product) => product.code === dialog.code)}
          salesEnabled={salesEnabled}
        />
      ) : null}
      {dialog?.kind === "link" ? (
        <LinkDialog
          onClose={() => setDialog(null)}
          onLinked={() => {
            setDialog(null);
            onStoreChanged();
          }}
          product={list?.find((product) => product.code === dialog.code)}
          salesEnabled={salesEnabled}
        />
      ) : null}
    </Section>
  );
}

function StoreList({ items, busy, onListed, onUnlink, showCode = false }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5" key={item.product_id}>
          <Link className="font-semibold text-brand hover:underline" title="상품 재고에서 가격·표지·재고를 봐요" to={`/admin/products?product=${item.product_id}`}>
            #{item.product_id} {item.title}{item.option ? ` · ${item.option}` : ""}
          </Link>
          {showCode ? <span className="font-mono text-[12px] text-slate-500">{item.app_product_code}</span> : null}
          {item.is_listed ? <Badge tone="green">사이트에 공개</Badge> : <Badge>숨김</Badge>}
          <span className="inline-flex gap-1.5">
            <button className={`btn-secondary ${SMALL_BUTTON}`} disabled={busy} onClick={() => void onListed(item, !item.is_listed)} type="button">
              {item.is_listed ? "숨기기" : "공개"}
            </button>
            <button className={`btn-danger-weak ${SMALL_BUTTON}`} disabled={busy} onClick={() => void onUnlink(item)} type="button">떼기</button>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── 앱 상품 만들기·고치기 ────────────────────────────────────

function ProductDialog({ product, series, onClose, onSaved }) {
  const { confirm, toast } = useIlseongFeedback();
  const formId = useId();
  const [name, setName] = useState(product?.name ?? "");
  const [active, setActive] = useState(product?.active ?? true);
  const [picked, setPicked] = useState(() => new Set(product?.bookIds ?? []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const before = useMemo(() => new Set(product?.bookIds ?? []), [product]);
  const added = [...picked].filter((id) => !before.has(id)).length;
  const removed = [...before].filter((id) => !picked.has(id)).length;

  const toggle = (ids, on) => {
    setError(null);
    const next = new Set(picked);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    setPicked(next);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (product && added > 0 && product.holders > 0) {
      const ok = await confirm({
        title: `교재 ${added}권을 더할까요?`,
        message: `이 상품을 이미 가진 회원 ${formatCount(product.holders)}명에게도 바로 열려요.`,
        confirm: "더하고 저장",
      });
      if (!ok) return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = { name: name.trim(), bookIds: [...picked], ...(product ? { active } : {}) };
      await ilseongAdmin.request(product ? "PUT" : "POST", product ? `/api/admin/products/${product.code}` : "/api/admin/products", body);
      toast(product ? `${body.name} 저장했어요` : `${body.name} 만들었어요`);
      onSaved();
    } catch (requestError) {
      setError(requestError);
      setSaving(false);
    }
  };

  return (
    <AdminDialog
      busy={saving}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] text-slate-500">교재 {picked.size}권{product ? ` (더함 ${added} · 뺌 ${removed})` : ""}</span>
          <span className="flex gap-2">
            <button className="btn-secondary !px-4 !py-2" disabled={saving} onClick={onClose} type="button">닫기</button>
            <button className="btn-primary !w-auto !px-5 !py-2" disabled={saving || picked.size === 0 || !name.trim()} form={formId} type="submit">
              {saving ? <BusyText>저장 중</BusyText> : product ? "저장" : "만들기"}
            </button>
          </span>
        </div>
      }
      onClose={onClose}
      open
      size="xl"
      title={product ? `${product.name} 고치기` : "앱 상품 만들기"}
    >
      <form className="space-y-5 px-6 py-5" id={formId} onSubmit={submit}>
        <Field label="상품 이름 (운영진만 봐요)">
          <input autoFocus className={FIELD_CLASS} maxLength={100} onChange={(event) => { setError(null); setName(event.target.value); }} placeholder="예: 파이널 모의고사 전 회차" required value={name} />
        </Field>
        {product ? (
          <CheckRow checked={active} onChange={setActive}>
            이 상품으로 등록·판매해요. 끄면 새 구매와 직접 등록에 쓸 수 없어요(이미 열린 교재는 그대로예요).
          </CheckRow>
        ) : null}

        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-600">이 상품으로 열 교재</p>
          {series.length === 0 ? <EmptyNote>학습지·교재에서 교재를 먼저 만들어 주세요.</EmptyNote> : null}
          {series.map((entry) => {
            const all = entry.subjects.flatMap((subject) => subject.books.map((book) => book.id));
            if (all.length === 0) return null;
            const allOn = all.every((id) => picked.has(id));
            return (
              <div className="rounded-xl border border-slate-200 p-3.5" key={entry.id}>
                <label className="flex items-center gap-2.5 text-sm font-bold text-slate-900">
                  <input checked={allOn} className="h-4 w-4 accent-[#3182f6]" onChange={(event) => toggle(all, event.target.checked)} type="checkbox" />
                  {entry.name} 전체 <span className="font-normal text-slate-400">{all.length}권</span>
                </label>
                <div className="mt-3 space-y-3">
                  {entry.subjects.filter((subject) => subject.books.length > 0).map((subject) => {
                    const ids = subject.books.map((book) => book.id);
                    return (
                      <div key={subject.code}>
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                          <input checked={ids.every((id) => picked.has(id))} className="h-4 w-4 accent-[#3182f6]" onChange={(event) => toggle(ids, event.target.checked)} type="checkbox" />
                          <SubjectDot color={subject.color} />
                          {subject.name}
                        </label>
                        <div className="mt-1.5 flex flex-wrap gap-1.5 pl-6">
                          {subject.books.map((book) => (
                            <label
                              className={`cursor-pointer rounded-full border px-3 py-1 text-[13px] transition-colors ${picked.has(book.id) ? "border-brand bg-blue-50 font-semibold text-brand" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                              key={book.id}
                            >
                              <input checked={picked.has(book.id)} className="sr-only" onChange={(event) => toggle([book.id], event.target.checked)} type="checkbox" />
                              {book.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {product && removed > 0 ? <WarnNote>뺀 교재는 앞으로의 구매·등록에만 빠져요. 이미 가진 회원에게서 거두지는 않아요.</WarnNote> : null}
        </div>
        <ErrorNote error={error} />
      </form>
    </AdminDialog>
  );
}

// ── 수북 상품 만들기 ─────────────────────────────────────────

const onlyDigits = (text, max = 9) => text.replace(/\D/g, "").slice(0, max);

function StoreProductDialog({ product, salesEnabled, onClose, onCreated }) {
  const { toast } = useIlseongFeedback();
  const formId = useId();
  const fileInput = useRef(null);
  const [form, setForm] = useState({
    title: product?.name ?? "",
    subject: "기타",
    brand: "기타",
    bookType: "주간지",
    originalPrice: "",
    discountType: "none",
    discountValue: "",
    quantity: "",
    listed: false,
  });
  const [cover, setCover] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (value) => {
    setError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  };
  const problem = storeProductProblem(form);
  const price = finalPrice(form);

  const pickCover = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      validateImageFile(file);
      setCover(await uploadImageToBucket(COVER_BUCKET, file, "ilseong"));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError : new Error("이미지를 올리지 못했어요."));
    } finally {
      setUploading(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving || problem) return;
    setSaving(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("admin_create_ilseong_store_product", {
      p_payload: {
        title: form.title.trim(),
        app_product_code: product.code,
        subject: form.subject,
        brand: form.brand,
        book_type: form.bookType,
        original_price: form.originalPrice,
        discount_type: form.discountType,
        discount_value: form.discountType === "none" ? null : form.discountValue,
        quantity: form.quantity,
        cover_image_url: cover,
        listed: form.listed && salesEnabled,
      },
    });
    if (rpcError) {
      setError(new Error(rpcError.message || "상품을 만들지 못했어요."));
      setSaving(false);
      return;
    }
    toast(`수북 상품 #${data?.product_id} 만들었어요${data?.is_listed ? " · 사이트에 공개됨" : " · 숨김"}`);
    onCreated();
  };

  return (
    <AdminDialog
      busy={saving || uploading}
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-secondary !px-4 !py-2" disabled={saving} onClick={onClose} type="button">닫기</button>
          <button className="btn-primary !w-auto !px-5 !py-2" disabled={saving || uploading || Boolean(problem)} form={formId} title={problem ?? undefined} type="submit">
            {saving ? <BusyText>만드는 중</BusyText> : "수북 상품 만들기"}
          </button>
        </div>
      }
      onClose={onClose}
      open
      size="lg"
      title="수북 상품 만들기"
    >
      <form className="space-y-5 px-6 py-5" id={formId} onSubmit={submit}>
        <p className="text-sm leading-relaxed text-slate-600">
          subook.kr에서 팔 상품과 재고를 만들고, 앱 상품 <strong className="text-slate-900">{product?.name}</strong>에 이어요.
          이 상품을 산 회원이 수북 계정으로 앱에 로그인하면 교재가 등록돼요.
        </p>
        <Field label="상품 이름 (사이트에 보여요)">
          <input autoFocus className={FIELD_CLASS} maxLength={120} onChange={(event) => set("title")(event.target.value)} required value={form.title} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="과목">
            <select className={FIELD_CLASS} onChange={(event) => set("subject")(event.target.value)} value={form.subject}>
              {SUBJECT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </Field>
          <Field label="브랜드">
            <select className={FIELD_CLASS} onChange={(event) => set("brand")(event.target.value)} value={form.brand}>
              {BRAND_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </Field>
          <Field label="유형">
            <select className={FIELD_CLASS} onChange={(event) => set("bookType")(event.target.value)} value={form.bookType}>
              {BOOK_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </Field>
        </div>
        <p className="-mt-2 text-[13px] text-slate-500">사이트의 검색·필터에 쓰는 분류예요. 여러 과목을 묶은 상품은 과목을 '기타'로 두면 돼요.</p>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="정가(원)">
            <input className={`${FIELD_CLASS} tabular-nums`} inputMode="numeric" onChange={(event) => set("originalPrice")(onlyDigits(event.target.value))} placeholder="예: 120000" required value={form.originalPrice} />
          </Field>
          <Field label="할인">
            <select className={FIELD_CLASS} onChange={(event) => set("discountType")(event.target.value)} value={form.discountType}>
              <option value="none">없음</option>
              <option value="amount">금액 할인</option>
              <option value="rate">비율 할인(%)</option>
            </select>
          </Field>
          <Field label={form.discountType === "rate" ? "할인율(%)" : "할인 금액(원)"}>
            <input
              className={`${FIELD_CLASS} tabular-nums`}
              disabled={form.discountType === "none"}
              inputMode="numeric"
              onChange={(event) => set("discountValue")(onlyDigits(event.target.value, form.discountType === "rate" ? 2 : 9))}
              value={form.discountType === "none" ? "" : form.discountValue}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="재고 수량(세트)">
            <input className={`${FIELD_CLASS} tabular-nums`} inputMode="numeric" onChange={(event) => set("quantity")(onlyDigits(event.target.value, 4))} placeholder="예: 300" required value={form.quantity} />
          </Field>
          <div className="sm:col-span-2">
            <p className="text-sm font-semibold text-slate-600">판매가</p>
            <p className="mt-2 text-[15px] font-bold tabular-nums text-slate-900">{price === null ? "—" : `${formatCount(price)}원`}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-600">표지 이미지</p>
          <div className="flex flex-wrap items-center gap-3">
            {cover ? <img alt="표지 미리 보기" className="h-24 w-[68px] rounded-md border border-slate-200 object-cover" src={cover} /> : null}
            <button className="btn-secondary !px-4 !py-2" disabled={uploading || saving} onClick={() => fileInput.current?.click()} type="button">
              {uploading ? <BusyText>올리는 중</BusyText> : cover ? "다른 이미지로 바꾸기" : "이미지 고르기"}
            </button>
            {cover ? <button className={`btn-danger-weak ${SMALL_BUTTON}`} disabled={saving} onClick={() => setCover(null)} type="button">빼기</button> : null}
          </div>
          <p className="text-[13px] text-slate-500">없이 만들어도 돼요. 표지·상세 사진·가격은 만든 뒤 상품 재고에서 고칠 수 있어요.</p>
          <input accept="image/jpeg,image/png,image/webp" hidden onChange={pickCover} ref={fileInput} type="file" />
        </div>

        <div className="space-y-2">
          <CheckRow checked={form.listed && salesEnabled} disabled={!salesEnabled} onChange={set("listed")}>
            만들자마자 사이트에 공개해요
          </CheckRow>
          <p className="text-[13px] leading-relaxed text-slate-500">
            {salesEnabled
              ? "끄고 만들면 숨긴 채로 만들어져요. 상품 재고에서 내용을 확인한 뒤 이 화면의 [공개]로 켜면 돼요."
              : "앱 패키지 판매가 꺼져 있어 숨긴 채로 만들어져요. 판매를 켠 뒤 이 화면의 [공개]로 켜면 돼요."}
          </p>
        </div>
        {problem && (form.originalPrice || form.quantity) ? <WarnNote>{problem}</WarnNote> : null}
        <ErrorNote error={error} />
      </form>
    </AdminDialog>
  );
}

// ── 있는 수북 상품 잇기 ──────────────────────────────────────

function LinkDialog({ product, salesEnabled, onClose, onLinked }) {
  const { toast } = useIlseongFeedback();
  const formId = useId();
  const [input, setInput] = useState("");
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const lookup = async (event) => {
    event.preventDefault();
    const id = Number(input);
    if (!id || busy) return;
    setBusy(true);
    setError(null);
    setFound(null);
    const { data, error: readError } = await supabase.from("products").select("id, title, is_listed").eq("id", id).maybeSingle();
    setBusy(false);
    if (readError || !data) {
      setError(new Error(readError?.message || "그 번호의 상품이 없어요. 상품 재고에서 번호를 확인해 주세요."));
      return;
    }
    setFound(data);
  };

  const link = async () => {
    if (!found || busy) return;
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("admin_set_ilseong_app_product", {
      p_product_id: found.id,
      p_is_app_package: true,
      p_app_product_code: product.code,
    });
    if (rpcError) {
      setError(new Error(rpcError.message || "잇지 못했어요."));
      setBusy(false);
      return;
    }
    toast(`#${found.id} ${found.title} 이었어요`);
    onLinked();
  };

  return (
    <AdminDialog
      busy={busy}
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-secondary !px-4 !py-2" disabled={busy} onClick={onClose} type="button">닫기</button>
          <button className="btn-primary !w-auto !px-5 !py-2" disabled={busy || !found} onClick={() => void link()} type="button">
            {busy && found ? <BusyText>잇는 중</BusyText> : "이 상품에 잇기"}
          </button>
        </div>
      }
      onClose={onClose}
      open
      size="md"
      title="있는 수북 상품 잇기"
    >
      <div className="space-y-4 px-6 py-5">
        <p className="text-sm leading-relaxed text-slate-600">
          상품 재고에 이미 있는 상품을 앱 상품 <strong className="text-slate-900">{product?.name}</strong>에 이어요.
          이은 뒤로 그 상품을 사면 앱에 교재가 등록돼요.
        </p>
        <form className="flex gap-2" id={formId} onSubmit={lookup}>
          <input
            aria-label="수북 상품 번호"
            autoFocus
            className={`${FIELD_CLASS} min-w-0 flex-1 tabular-nums`}
            inputMode="numeric"
            onChange={(event) => { setFound(null); setError(null); setInput(onlyDigits(event.target.value, 12)); }}
            placeholder="상품 번호 (상품 재고의 #번호)"
            value={input}
          />
          <button className="btn-secondary !px-4 !py-2" disabled={busy || !input} type="submit">찾기</button>
        </form>
        {found ? (
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <p className="font-semibold text-slate-900">#{found.id} {found.title}</p>
            <p className="mt-1 text-slate-600">
              {found.is_listed
                ? salesEnabled ? "지금 사이트에 공개된 상품이에요. 이으면 바로 앱 등록이 붙어요." : "앱 패키지 판매가 꺼져 있어, 이으면 이 상품이 숨김으로 바뀌어요."
                : "지금 숨겨진 상품이에요."}
            </p>
          </div>
        ) : null}
        <ErrorNote error={error} />
      </div>
    </AdminDialog>
  );
}
