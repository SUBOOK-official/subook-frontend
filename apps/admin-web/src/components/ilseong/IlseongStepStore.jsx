import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AdminDialog from "../AdminDialog";
import { BusyText } from "../Loading";
import { COVER_BUCKET, uploadImageToBucket, validateImageFile } from "../../lib/adminImageUpload";
import { formatCount } from "../../lib/ilseongFormat";
import { sellBlockers } from "../../lib/ilseongGuide";
import { finalPrice, storeProductProblem } from "../../lib/ilseongProducts";
import {
  createStoreProduct,
  findStoreProduct,
  linkStoreProduct,
  readGuideTemplateStatus,
  readStoreStock,
  startSelling,
  stopSelling,
  unlinkStoreProduct,
} from "../../lib/ilseongStore";
import { BOOK_TYPE_OPTIONS, BRAND_OPTIONS, SUBJECT_OPTIONS } from "../../lib/productCategories";
import { AlertTriangleIcon, CheckIcon } from "../icons";
import { Badge, ErrorNote, FIELD_CLASS, Field, SMALL_BUTTON, WarnNote, useIlseongFeedback } from "./IlseongUi";

// 3단계 판매 상품 만들기, 4단계 판매 시작.
// 수북 사이트(subook.kr)에서 팔 상품을 만들면 이 학습지에 이어진다. 그 상품을 산 회원이 수북 계정으로 앱에
// 로그인하면 이 학습지의 교재가 등록된다. 운영진은 "앱 상품"이나 상품 코드를 볼 일이 없다(앱 저장소 docs/adr/0041).

const onlyDigits = (text, max = 9) => text.replace(/\D/g, "").slice(0, max);
const won = (value) => (value === null || value === undefined ? "—" : `${formatCount(value)}원`);

/** 이 학습지에 이어진 수북 상품들의 가격·표지·재고. { [상품 번호]: 재고 정보 } */
function useStoreStock(store) {
  const ids = store.map((item) => item.product_id).join(",");
  const [state, setState] = useState({ ids: "", stock: {}, error: null });
  const load = useCallback(async () => {
    if (!ids) return;
    try {
      const entries = await Promise.all(ids.split(",").map(async (id) => [id, await readStoreStock(Number(id))]));
      setState({ ids, stock: Object.fromEntries(entries), error: null });
    } catch (error) {
      setState((prev) => ({ ...prev, ids, error }));
    }
  }, [ids]);
  useEffect(() => {
    void load();
  }, [load]);
  return { stock: state.ids === ids ? state.stock : {}, error: state.error, reload: load };
}

function ProductLine({ item, stock }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {stock?.cover
        ? <img alt="" className="h-20 w-[57px] shrink-0 rounded-md border border-slate-200 object-cover" src={stock.cover} />
        : <span className="flex h-20 w-[57px] shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] text-slate-400">표지 없음</span>}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-bold text-slate-900">{item.title}{item.option ? ` · ${item.option}` : ""}</span>
          {item.is_listed ? <Badge tone="green">사이트에 보여요</Badge> : <Badge>숨김</Badge>}
        </p>
        <p className="mt-1 text-sm tabular-nums text-slate-600">
          {stock
            ? <>판매가 {won(stock.price)}{stock.originalPrice && stock.originalPrice !== stock.price ? <span className="text-slate-400"> (정가 {won(stock.originalPrice)})</span> : null} · 재고 {formatCount(stock.onSale)}세트</>
            : "가격과 재고를 확인하는 중이에요."}
        </p>
      </div>
    </div>
  );
}

// ── 3단계 ────────────────────────────────────────────────────

/** onChanged(): 상품을 만들거나 잇거나 뗀 뒤 — 수북 상품 목록을 다시 읽으라는 신호. */
export function StoreStep({ series, progress, onChanged }) {
  const { confirm, toast } = useIlseongFeedback();
  const { stock, error: stockError } = useStoreStock(progress.store);
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const unlink = async (item) => {
    const ok = await confirm({
      title: `'${item.title}' 상품을 이 학습지에서 뗄까요?`,
      message: "이 상품을 사도 앱에 교재가 등록되지 않게 돼요. 이미 결제된 주문은 그대로 등록돼요.\n상품과 재고는 지워지지 않아요.",
      confirm: "떼기",
      danger: true,
    });
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      await unlinkStoreProduct(item.product_id);
      toast("학습지에서 뗐어요");
      onChanged();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  };

  const linkDialog = linking ? (
    <LinkDialog
      onClose={() => setLinking(false)}
      onLinked={() => {
        setLinking(false);
        onChanged();
      }}
      series={series}
    />
  ) : null;

  if (progress.store.length === 0) {
    return (
      <div className="space-y-5">
        <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
          수북 사이트(subook.kr)에서 팔 상품을 만들어요. 이 상품을 산 사람이 수북 계정으로 앱에 로그인하면 {series.name}의 교재가 모두 등록돼요.
          만들어도 바로 팔리지는 않아요. 다음 단계에서 [판매 시작]을 눌러야 사이트에 보여요.
        </p>
        <StoreProductForm onCreated={onChanged} series={series} />
        <p className="text-sm text-slate-500">
          상품 재고에 이미 만들어 둔 상품이 있나요?{" "}
          <button className="font-semibold text-brand hover:underline" onClick={() => setLinking(true)} type="button">그 상품을 이 학습지에 잇기</button>
        </p>
        {linkDialog}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ErrorNote error={error ?? stockError} />
      <ul className="divide-y divide-slate-100">
        {progress.store.map((item) => (
          <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-3 first:pt-0 last:pb-0" key={item.product_id}>
            <div className="min-w-0 flex-1"><ProductLine item={item} stock={stock[item.product_id]} /></div>
            <span className="flex flex-wrap gap-1.5">
              <Link className={`btn-secondary ${SMALL_BUTTON}`} to={`/admin/products?product=${item.product_id}`}>가격·표지·재고 고치기</Link>
              <button className={`btn-danger-weak ${SMALL_BUTTON}`} disabled={busy} onClick={() => void unlink(item)} type="button">학습지에서 떼기</button>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[13px] leading-relaxed text-slate-500">
        가격·표지·재고·상세 사진은 [상품 재고] 화면에서 고쳐요.{" "}
        <button className="font-semibold text-brand hover:underline" onClick={() => setLinking(true)} type="button">다른 상품도 이 학습지에 잇기</button>
      </p>
      {linkDialog}
    </div>
  );
}

function StoreProductForm({ series, onCreated }) {
  const { toast } = useIlseongFeedback();
  const fileInput = useRef(null);
  const [form, setForm] = useState({
    title: series.name,
    subject: "기타",
    brand: "기타",
    bookType: "주간지",
    originalPrice: "",
    discountType: "none",
    discountValue: "",
    quantity: "",
  });
  const [cover, setCover] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (value) => {
    setError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  };
  const problem = storeProductProblem(form) ?? (cover ? null : "표지 이미지를 넣어 주세요. 표지가 있어야 사이트에 보여요.");
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
    try {
      await createStoreProduct({ appProductCode: series.product.code, form, coverUrl: cover });
      toast("판매 상품을 만들었어요");
      onCreated();
    } catch (requestError) {
      setError(requestError);
      setSaving(false);
    }
  };

  return (
    <form className="max-w-2xl space-y-5" onSubmit={submit}>
      <Field label="상품 이름 (사이트에 이대로 보여요)">
        <input className={FIELD_CLASS} maxLength={120} onChange={(event) => set("title")(event.target.value)} value={form.title} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="정가(원)">
          <input className={`${FIELD_CLASS} tabular-nums`} inputMode="numeric" onChange={(event) => set("originalPrice")(onlyDigits(event.target.value))} placeholder="예: 120000" value={form.originalPrice} />
        </Field>
        <Field label="할인">
          <select className={FIELD_CLASS} onChange={(event) => set("discountType")(event.target.value)} value={form.discountType}>
            <option value="none">할인 없음</option>
            <option value="amount">금액만큼 깎기</option>
            <option value="rate">비율(%)로 깎기</option>
          </select>
        </Field>
        {form.discountType !== "none" ? (
          <Field label={form.discountType === "rate" ? "할인율(%)" : "깎을 금액(원)"}>
            <input
              className={`${FIELD_CLASS} tabular-nums`}
              inputMode="numeric"
              onChange={(event) => set("discountValue")(onlyDigits(event.target.value, form.discountType === "rate" ? 2 : 9))}
              value={form.discountValue}
            />
          </Field>
        ) : null}
      </div>
      <p className="-mt-2 text-sm text-slate-600">
        사이트에서 팔리는 값: <strong className="font-bold tabular-nums text-slate-900">{price === null ? "—" : `${formatCount(price)}원`}</strong>
      </p>

      <Field className="max-w-[14rem]" label="재고 몇 세트?">
        <input className={`${FIELD_CLASS} tabular-nums`} inputMode="numeric" onChange={(event) => set("quantity")(onlyDigits(event.target.value, 4))} placeholder="예: 300" value={form.quantity} />
      </Field>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-600">표지 이미지</p>
        <div className="flex flex-wrap items-center gap-3">
          {cover ? <img alt="표지 미리 보기" className="h-24 w-[68px] rounded-md border border-slate-200 object-cover" src={cover} /> : null}
          <button className="btn-secondary !px-4 !py-2" disabled={uploading || saving} onClick={() => fileInput.current?.click()} type="button">
            {uploading ? <BusyText>올리는 중</BusyText> : cover ? "다른 이미지로 바꾸기" : "이미지 고르기"}
          </button>
        </div>
        <p className="text-[13px] text-slate-500">JPG·PNG·WEBP. 상세 사진은 만든 뒤 [상품 재고]에서 넣을 수 있어요.</p>
        <input accept="image/jpeg,image/png,image/webp" hidden onChange={pickCover} ref={fileInput} type="file" />
      </div>

      <details className="group">
        <summary className="cursor-pointer list-none text-sm font-semibold text-slate-500 hover:text-slate-800 [&::-webkit-details-marker]:hidden">
          사이트 분류 바꾸기 <span className="font-normal text-slate-400">(지금: {form.subject} · {form.brand} · {form.bookType})</span>
        </summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
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
        <p className="mt-2 text-[13px] text-slate-500">사이트의 검색과 고르기에 쓰는 분류예요. 여러 과목을 묶은 상품은 과목을 '기타'로 두면 돼요.</p>
      </details>

      {problem && (form.originalPrice || form.quantity) ? <WarnNote>{problem}</WarnNote> : null}
      <ErrorNote error={error} />
      <button className="btn-primary !w-auto !px-6" disabled={saving || uploading || Boolean(problem)} type="submit">
        {saving ? <BusyText>만드는 중</BusyText> : "판매 상품 만들기"}
      </button>
    </form>
  );
}

function LinkDialog({ series, onClose, onLinked }) {
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
    try {
      const product = await findStoreProduct(id);
      if (!product) throw new Error("그 번호의 상품이 없어요. [상품 재고]에서 번호를 확인해 주세요.");
      setFound(product);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  };

  const link = async () => {
    if (!found || busy) return;
    setBusy(true);
    setError(null);
    try {
      await linkStoreProduct(found.id, series.product.code);
      toast(`${found.title} 이었어요`);
      onLinked();
    } catch (requestError) {
      setError(requestError);
      setBusy(false);
    }
  };

  return (
    <AdminDialog
      busy={busy}
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-secondary !px-4 !py-2" disabled={busy} onClick={onClose} type="button">닫기</button>
          <button className="btn-primary !w-auto !px-5 !py-2" disabled={busy || !found} onClick={() => void link()} type="button">
            {busy && found ? <BusyText>잇는 중</BusyText> : "이 상품 잇기"}
          </button>
        </div>
      }
      onClose={onClose}
      open
      size="md"
      title="만들어 둔 상품 잇기"
    >
      <div className="space-y-4 px-6 py-5">
        <p className="text-sm leading-relaxed text-slate-600">
          [상품 재고]에 이미 있는 상품을 <strong className="text-slate-900">{series.name}</strong>에 이어요.
          이은 뒤로 그 상품을 사면 앱에 이 학습지의 교재가 등록돼요.
        </p>
        <form className="flex gap-2" id={formId} onSubmit={lookup}>
          <input
            aria-label="상품 번호"
            autoFocus
            className={`${FIELD_CLASS} min-w-0 flex-1 tabular-nums`}
            inputMode="numeric"
            onChange={(event) => { setFound(null); setError(null); setInput(onlyDigits(event.target.value, 12)); }}
            placeholder="상품 번호 ([상품 재고]의 #번호)"
            value={input}
          />
          <button className="btn-secondary !px-4 !py-2" disabled={busy || !input} type="submit">찾기</button>
        </form>
        {found ? (
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <p className="font-semibold text-slate-900">#{found.id} {found.title}</p>
            <p className="mt-1 text-slate-600">{found.is_listed ? "지금 사이트에 보이는 상품이에요." : "지금 숨겨진 상품이에요. 4단계에서 [판매 시작]을 누르면 보여요."}</p>
          </div>
        ) : null}
        <ErrorNote error={error} />
      </div>
    </AdminDialog>
  );
}

// ── 4단계 ────────────────────────────────────────────────────

const GUIDE_STATUS_TEXT = {
  INSPECTING: "카카오가 아직 검수하고 있어요",
  PENDING: "아직 카카오 검수를 받지 않았어요",
  REJECTED: "카카오 검수에서 반려됐어요",
};

function CheckLine({ ok, children }) {
  return (
    <li className="flex items-start gap-2.5 text-sm leading-relaxed">
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${ok ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-700"}`}>
        {ok ? <CheckIcon size={12} strokeWidth={2.6} /> : <AlertTriangleIcon size={12} strokeWidth={2.2} />}
      </span>
      <span className={ok ? "text-slate-700" : "text-slate-900"}>{children}</span>
    </li>
  );
}

/**
 * @param sales     수북 쪽 판매 정보(useIlseongSales의 data). 아직 못 읽었으면 undefined
 * @param onChanged () => Promise — 판매를 시작하거나 멈춘 뒤 판매 정보를 다시 읽는다
 */
export function SellStep({ series, progress, sales, onChanged }) {
  const { confirm, toast } = useIlseongFeedback();
  const { stock, error: stockError, reload: reloadStock } = useStoreStock(progress.store);
  const [guide, setGuide] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const selling = progress.selling;
  const salesEnabled = sales?.settings?.sales_enabled === true;
  // 판매를 켜야 할 때만 안내 알림톡의 카카오 승인 여부를 묻는다
  useEffect(() => {
    if (selling || salesEnabled || !sales) return undefined;
    let stale = false;
    readGuideTemplateStatus().then((status) => { if (!stale) setGuide(status); }).catch(() => { if (!stale) setGuide("UNKNOWN"); });
    return () => {
      stale = true;
    };
  }, [selling, salesEnabled, sales]);

  const hidden = progress.store.filter((item) => !item.is_listed);
  const listed = progress.store.filter((item) => item.is_listed);
  const main = progress.store[0];
  const mainStock = main ? stock[main.product_id] : null;
  const blockers = sellBlockers({ sales, stock: mainStock });
  if (!salesEnabled && GUIDE_STATUS_TEXT[guide]) {
    blockers.push({ key: "guide-status", dev: true, text: `구매한 사람에게 보낼 안내 알림톡을 ${GUIDE_STATUS_TEXT[guide]}.` });
  }
  const { counts } = progress;
  const waiting = counts.total - counts.ready;

  const run = async (work, done) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
      await Promise.all([onChanged(), reloadStock()]);
      toast(done);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    const ok = await confirm({
      title: `${series.name} 판매를 시작할까요?`,
      message:
        `수북 사이트에 바로 보이고 살 수 있게 돼요. 결제가 확인되면 산 사람의 앱에 교재가 등록되고 안내 알림톡이 나가요.${waiting > 0 ? `\n\n아직 PDF를 올리지 않은 교재 ${waiting}권은 학생 앱에 '준비 중'으로 보여요.` : ""}`,
      confirm: "판매 시작",
    });
    if (ok) await run(() => startSelling({ productIds: hidden.map((item) => item.product_id), salesEnabled }), "판매를 시작했어요");
  };

  const stop = async () => {
    const ok = await confirm({
      title: `${series.name} 판매를 멈출까요?`,
      message: "수북 사이트에서 보이지 않게 돼요. 이미 결제된 주문은 그대로 앱에 등록돼요. 다시 [판매 시작]을 누르면 바로 보여요.",
      confirm: "판매 중지",
      danger: true,
    });
    if (ok) await run(() => stopSelling({ productIds: listed.map((item) => item.product_id) }), "판매를 멈췄어요");
  };

  // 사이트에 보이게 했는데 표지·재고가 모자라 실제로는 한 세트도 보이지 않는 경우
  const invisible = selling && mainStock && mainStock.visible === 0;

  return (
    <div className="space-y-4">
      <ErrorNote error={error ?? stockError} />
      <ul className="space-y-2.5">
        <CheckLine ok={counts.ready > 0}>
          {counts.ready === 0
            ? "아직 앱에서 볼 수 있는 교재가 없어요. 2단계에서 PDF를 먼저 올리는 것이 좋아요."
            : waiting > 0
              ? `교재 ${counts.total}권 가운데 ${counts.ready}권을 앱에서 볼 수 있어요. 나머지 ${waiting}권은 팔면서 올려도 돼요(그동안 '준비 중'으로 보여요).`
              : `교재 ${counts.total}권을 모두 앱에서 볼 수 있어요.`}
        </CheckLine>
        {main ? (
          <CheckLine ok={Boolean(mainStock?.cover) && mainStock.onSale > 0}>
            {mainStock
              ? <>판매 상품 <strong className="font-semibold">{main.title}</strong> · {won(mainStock.price)} · 재고 {formatCount(mainStock.onSale)}세트{mainStock.cover ? "" : " · 표지 없음"}</>
              : "판매 상품의 가격과 재고를 확인하는 중이에요."}
          </CheckLine>
        ) : null}
        {blockers.map((blocker) => (
          <CheckLine key={blocker.key} ok={false}>
            {blocker.text}{" "}
            {blocker.dev
              ? <span className="text-slate-600">개발자에게 알려 주세요.</span>
              : main ? <Link className="font-semibold text-brand hover:underline" to={`/admin/products?product=${main.product_id}`}>상품 재고에서 고치기</Link> : null}
          </CheckLine>
        ))}
      </ul>

      {invisible ? (
        <WarnNote>
          판매를 시작했지만 사이트에는 아직 보이지 않아요. 표지 이미지와 재고가 있어야 보여요.{" "}
          <Link className="font-semibold underline" to={`/admin/products?product=${main.product_id}`}>상품 재고에서 확인하기</Link>
        </WarnNote>
      ) : null}

      {selling ? (
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="green">판매 중</Badge>
          {main ? (
            <a className="text-sm font-semibold text-brand hover:underline" href={`https://subook.kr/store/${main.product_id}`} rel="noreferrer" target="_blank">
              사이트에서 보기
            </a>
          ) : null}
          {hidden.length > 0 ? (
            <button className={`btn-secondary ${SMALL_BUTTON}`} disabled={busy} onClick={() => void start()} type="button">숨겨진 상품 {hidden.length}개도 판매 시작</button>
          ) : null}
          <button className={`btn-danger-weak ${SMALL_BUTTON}`} disabled={busy} onClick={() => void stop()} type="button">
            {busy ? <BusyText>처리 중</BusyText> : "판매 중지"}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary !w-auto !px-6" disabled={busy || blockers.length > 0 || !sales || !mainStock} onClick={() => void start()} type="button">
            {busy ? <BusyText>시작하는 중</BusyText> : "판매 시작"}
          </button>
          {blockers.length > 0 ? <span className="text-sm text-slate-500">위의 표시된 것을 먼저 풀어야 시작할 수 있어요.</span> : null}
        </div>
      )}
    </div>
  );
}
