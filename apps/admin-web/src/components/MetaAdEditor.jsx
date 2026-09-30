import { useEffect, useRef, useState } from "react";
import {
  metaAdsChoices,
  metaAdsRequest,
} from "@shared-supabase/adminMetaAdsClient";
import { metaKinds, koreaInput, koreaTimestamp } from "@shared-domain/metaAds";
import { useBodyScrollLock } from "@shared-domain/useBodyScrollLock";
import { useFocusTrap } from "@shared-domain/useFocusTrap";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100";
const buttonClass =
  "rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40";
function Field({ label, children, hint }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      {children}
      {hint && (
        <span className="mt-1 block text-xs font-normal text-slate-500">
          {hint}
        </span>
      )}
    </label>
  );
}
function initialValues(kind, entity, draft, parent) {
  if (draft) return draft.payload;
  const data = entity || {};
  const target = data.targeting || {};
  return {
    name: data.name || "",
    objective: data.objective || "OUTCOME_SALES",
    campaign_id: data.campaign_id || (kind === "adset" ? parent?.id : "") || "",
    adset_id: data.adset_id || (kind === "ad" ? parent?.id : "") || "",
    creative_id: data.creative?.id || "",
    budgetType:
      Number(data.lifetime_budget) > 0
        ? "lifetime"
        : Number(data.daily_budget) > 0
          ? "daily"
          : kind === "campaign"
            ? "adset"
            : entity ||
                Number(parent?.daily_budget || parent?.lifetime_budget) > 0
              ? "campaign"
              : "daily",
    budget: data.lifetime_budget || data.daily_budget || "",
    start: koreaInput(data.start_time),
    end: koreaInput(data.end_time || data.stop_time),
    editTargeting: !entity,
    ageMin: target.age_min || 18,
    ageMax: target.age_max || 65,
    gender: target.genders?.length === 1 ? String(target.genders[0]) : "all",
    countries: target.geo_locations?.countries?.join(",") || "KR",
    platforms: target.publisher_platforms || [],
    audiences: target.custom_audiences?.map((row) => row.id) || [],
    excludedAudiences:
      target.excluded_custom_audiences?.map((row) => row.id) || [],
    optimization_goal:
      data.optimization_goal ||
      (parent?.objective === "OUTCOME_TRAFFIC"
        ? "LANDING_PAGE_VIEWS"
        : "OFFSITE_CONVERSIONS"),
    pixel_id: data.promoted_object?.pixel_id || "",
    format: "image",
    page_id: "",
    instagram_id: "",
    image_hash: "",
    video_id: "",
    thumbnail_url: "",
    message: "",
    title: "",
    description: "",
    link: "https://subook.kr/",
    cta: "SHOP_NOW",
    post_id: "",
    source: "instagram",
    medium: "cpc",
    campaign: "",
    trackingId: "",
    content: "",
  };
}
export function editorValues(kind, form, entity) {
  const values = { name: form.name };
  if (kind === "campaign") {
    if (!entity) values.objective = form.objective;
    if (form.budgetType !== "adset") {
      values.budgetType = form.budgetType;
      values.budget = form.budget;
    }
  }
  if (kind === "campaign" || kind === "adset") {
    if (form.start && (!entity || form.start !== koreaInput(entity.start_time)))
      values.start_time = koreaTimestamp(form.start);
    if (
      form.end &&
      (!entity || form.end !== koreaInput(entity.end_time || entity.stop_time))
    )
      values[kind === "campaign" ? "stop_time" : "end_time"] = koreaTimestamp(
        form.end,
      );
  }
  if (kind === "adset") {
    if (!entity) {
      values.campaign_id = form.campaign_id;
      values.optimization_goal = form.optimization_goal;
      if (form.optimization_goal === "OFFSITE_CONVERSIONS")
        values.pixel_id = form.pixel_id;
    }
    if (form.budgetType !== "campaign") {
      values.budgetType = form.budgetType;
      values.budget = form.budget;
    }
    if (form.editTargeting) {
      values.targeting = {
        age_min: Number(form.ageMin),
        age_max: Number(form.ageMax),
        genders: form.gender === "all" ? [] : [Number(form.gender)],
      };
      const hasGranularGeo = Object.keys(
        entity?.targeting?.geo_locations || {},
      ).some((key) => key !== "countries");
      if (!hasGranularGeo)
        values.targeting.countries = form.countries
          .split(",")
          .map((v) => v.trim().toUpperCase())
          .filter(Boolean);
      if (form.platforms.length)
        values.targeting.publisher_platforms = form.platforms;
      if (form.audiences.length || entity?.targeting?.custom_audiences?.length)
        values.targeting.custom_audiences = form.audiences;
      if (
        form.excludedAudiences.length ||
        entity?.targeting?.excluded_custom_audiences?.length
      )
        values.targeting.excluded_custom_audiences = form.excludedAudiences;
    }
  }
  if (kind === "ad") {
    if (!entity) values.adset_id = form.adset_id;
    if (!entity || form.creative_id !== entity.creative?.id)
      values.creative_id = form.creative_id;
  }
  if (kind === "creative" && !entity) {
    for (const key of [
      "format",
      "page_id",
      "instagram_id",
      "image_hash",
      "video_id",
      "thumbnail_url",
      "message",
      "title",
      "description",
      "link",
      "cta",
      "post_id",
    ])
      values[key] = form[key];
    values.tracking = {
      source: form.source,
      medium: form.medium,
      campaign: form.campaign,
      id: form.trackingId,
      content: form.content,
    };
  }
  return values;
}

export default function MetaAdEditor({
  kind,
  entity,
  draft,
  parent,
  canManage,
  onClose,
  onPrepare,
  onDraftSaved,
  suspended = false,
}) {
  const [form, setForm] = useState(() =>
    initialValues(kind, entity, draft, parent),
  );
  const [choices, setChoices] = useState({});
  const [choiceErrors, setChoiceErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [savedDraft, setSavedDraft] = useState(draft);
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, !suspended);
  useBodyScrollLock(true);
  useEffect(() => {
    if (!suspended) dialogRef.current?.querySelector("input")?.focus();
  }, [suspended]);
  const set = (key, value) => setForm((prior) => ({ ...prior, [key]: value }));
  useEffect(() => {
    const controller = new AbortController();
    const requests =
      kind === "adset"
        ? [
            ["campaigns", { view: "list", kind: "campaign" }],
            ["pixels", { view: "assets", kind: "pixels" }],
            ["audiences", { view: "assets", kind: "audiences" }],
          ]
        : kind === "ad"
          ? [
              ["adsets", { view: "list", kind: "adset" }],
              ["creatives", { view: "list", kind: "creative" }],
            ]
          : kind === "creative" && !entity
            ? ["pages", "instagram", "images", "videos"].map((key) => [
                key,
                { view: "assets", kind: key },
              ])
            : [];
    setLoading(requests.length > 0);
    Promise.allSettled(
      requests.map(async ([key, query]) => [
        key,
        await metaAdsChoices(query, controller.signal),
      ]),
    ).then((results) => {
      if (controller.signal.aborted) return;
      const ready = {},
        errors = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled")
          ready[result.value[0]] = result.value[1];
        else
          errors.push(
            `${{ campaigns: "캠페인", pixels: "픽셀", audiences: "대상 그룹", adsets: "광고세트", creatives: "소재", pages: "페이지", instagram: "Instagram", images: "이미지", videos: "동영상" }[requests[index][0]]}: ${result.reason.message}`,
          );
      });
      setChoices(ready);
      setChoiceErrors(errors);
      setLoading(false);
    });
    return () => controller.abort();
  }, [kind, entity]);
  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      await onPrepare({
        action: entity ? "update" : "create",
        kind,
        ...(entity ? { id: entity.id, version: entity.version } : {}),
        values: editorValues(kind, form, entity),
      });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };
  const saveDraft = async () => {
    setBusy(true);
    setMessage("");
    try {
      const data = await metaAdsRequest(
        {},
        {
          action: "saveDraft",
          draft: {
            ...(savedDraft
              ? { id: savedDraft.id, version: savedDraft.version }
              : {}),
            kind,
            title: form.name.trim() || `새 ${metaKinds[kind]} 초안`,
            payload: form,
          },
        },
      );
      setSavedDraft(data);
      setMessage(
        "초안을 수북에 저장했습니다. Meta에는 아직 반영하지 않았습니다.",
      );
      onDraftSaved();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };
  const chooseCampaign = (id) => {
    const row = choices.campaigns?.find((v) => v.id === id);
    setForm((prior) => ({
      ...prior,
      campaign_id: id,
      optimization_goal:
        row?.objective === "OUTCOME_TRAFFIC"
          ? "LANDING_PAGE_VIEWS"
          : "OFFSITE_CONVERSIONS",
      budgetType:
        Number(row?.daily_budget || row?.lifetime_budget) > 0
          ? "campaign"
          : "daily",
    }));
  };
  const options = (rows, selectedId, name = "name") => (
    <>
      <option value="">선택해 주세요</option>
      {selectedId && !rows?.some((row) => row.id === selectedId) && (
        <option value={selectedId}>현재 항목 · {selectedId}</option>
      )}
      {(rows || []).map((row) => (
        <option key={row.id} value={row.id}>
          {row[name] || row.name || row.id} · {row.id}
        </option>
      ))}
    </>
  );
  const selectedImage = choices.images?.find(
    (row) => row.hash === form.image_hash,
  );
  const hasGranularGeo = Object.keys(
    entity?.targeting?.geo_locations || {},
  ).some((key) => key !== "countries");
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 p-3">
      <section
        ref={dialogRef}
        inert={suspended ? "" : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="meta-editor-title"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="meta-editor-title" className="text-lg font-bold">
            {metaKinds[kind]} {entity ? "수정" : "만들기"}
          </h2>
          <button
            type="button"
            className={buttonClass}
            disabled={busy}
            onClick={onClose}
          >
            닫기
          </button>
        </div>
        {loading && (
          <p className="mt-3 text-sm text-slate-500" role="status">
            계정에 연결된 선택 항목을 불러오는 중…
          </p>
        )}
        {choiceErrors.length > 0 && (
          <div
            role="alert"
            className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900"
          >
            {choiceErrors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        )}
        <form onSubmit={submit} className="mt-5 space-y-5">
          <Field label="이름">
            <input
              className={inputClass}
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
              maxLength={200}
              required
            />
          </Field>
          {kind === "campaign" && !entity && (
            <Field label="광고 목표">
              <select
                className={inputClass}
                value={form.objective}
                onChange={(event) => set("objective", event.target.value)}
              >
                <option value="OUTCOME_SALES">판매 · 웹사이트 구매</option>
                <option value="OUTCOME_TRAFFIC">사이트 방문</option>
              </select>
            </Field>
          )}
          {kind === "adset" && !entity && (
            <Field label="캠페인">
              <select
                className={inputClass}
                value={form.campaign_id}
                onChange={(event) => chooseCampaign(event.target.value)}
                required
              >
                {options(choices.campaigns, form.campaign_id)}
              </select>
            </Field>
          )}
          {(kind === "campaign" || kind === "adset") && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="예산 방식">
                  <select
                    className={inputClass}
                    value={form.budgetType}
                    onChange={(event) => set("budgetType", event.target.value)}
                    disabled={Boolean(entity)}
                  >
                    {kind === "campaign" && (
                      <option value="adset">광고세트별로 설정</option>
                    )}
                    {kind === "adset" && (
                      <option value="campaign">캠페인 예산 사용</option>
                    )}
                    <option value="daily">하루 예산</option>
                    <option value="lifetime">전체 기간 예산</option>
                  </select>
                </Field>
                {["daily", "lifetime"].includes(form.budgetType) && (
                  <Field label="예산 (원)">
                    <input
                      className={inputClass}
                      type="number"
                      min="1"
                      max="1000000000"
                      step="1"
                      value={form.budget}
                      onChange={(event) => set("budget", event.target.value)}
                      required
                    />
                  </Field>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="시작 (한국시간)"
                  hint="비워두면 기존 설정 또는 Meta의 시작 기준을 사용합니다."
                >
                  <input
                    className={inputClass}
                    type="datetime-local"
                    value={form.start}
                    onChange={(event) => set("start", event.target.value)}
                  />
                </Field>
                <Field label="종료 (한국시간)">
                  <input
                    className={inputClass}
                    type="datetime-local"
                    value={form.end}
                    onChange={(event) => set("end", event.target.value)}
                    required={form.budgetType === "lifetime"}
                  />
                </Field>
              </div>
              <p className="text-xs text-slate-500">
                일일 예산은 하루 평균 예산입니다. 실제 일별 지출은 Meta의 예산
                운영 방식에 따라 달라질 수 있습니다.
              </p>
            </>
          )}
          {kind === "adset" && (
            <>
              {!entity && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="성과 목표">
                    <select
                      className={inputClass}
                      value={form.optimization_goal}
                      onChange={(event) =>
                        set("optimization_goal", event.target.value)
                      }
                    >
                      <option value="OFFSITE_CONVERSIONS">웹사이트 구매</option>
                      <option value="LANDING_PAGE_VIEWS">
                        도착 페이지 조회
                      </option>
                      <option value="LINK_CLICKS">링크 클릭</option>
                    </select>
                  </Field>
                  {form.optimization_goal === "OFFSITE_CONVERSIONS" && (
                    <Field label="구매 픽셀">
                      <select
                        className={inputClass}
                        value={form.pixel_id}
                        onChange={(event) =>
                          set("pixel_id", event.target.value)
                        }
                        required
                      >
                        {options(choices.pixels, form.pixel_id)}
                      </select>
                    </Field>
                  )}
                </div>
              )}
              {entity && (
                <label className="flex gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={form.editTargeting}
                    onChange={(event) =>
                      set("editTargeting", event.target.checked)
                    }
                  />
                  광고 대상 수정
                </label>
              )}
              {form.editTargeting && (
                <fieldset className="space-y-4 rounded-xl border border-slate-200 p-4">
                  <legend className="px-2 text-sm font-bold">
                    누구에게 보여줄까요?
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="최소 연령">
                      <input
                        className={inputClass}
                        type="number"
                        min="18"
                        max="65"
                        value={form.ageMin}
                        onChange={(event) => set("ageMin", event.target.value)}
                        required
                      />
                    </Field>
                    <Field label="최대 연령">
                      <input
                        className={inputClass}
                        type="number"
                        min="18"
                        max="65"
                        value={form.ageMax}
                        onChange={(event) => set("ageMax", event.target.value)}
                        required
                      />
                    </Field>
                    <Field label="성별">
                      <select
                        className={inputClass}
                        value={form.gender}
                        onChange={(event) => set("gender", event.target.value)}
                      >
                        <option value="all">전체</option>
                        <option value="1">남성</option>
                        <option value="2">여성</option>
                      </select>
                    </Field>
                  </div>
                  <Field
                    label="대상 국가"
                    hint={
                      hasGranularGeo
                        ? "현재 도시·반경 등의 세부 지역 설정을 유지합니다."
                        : "대한민국은 KR. 여러 국가는 쉼표로 구분합니다."
                    }
                  >
                    <input
                      className={inputClass}
                      value={form.countries}
                      disabled={hasGranularGeo}
                      onChange={(event) => set("countries", event.target.value)}
                      required
                    />
                  </Field>
                  <fieldset>
                    <legend className="text-sm font-semibold">게재 위치</legend>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {[
                        ["facebook", "Facebook"],
                        ["instagram", "Instagram"],
                        ["messenger", "Messenger"],
                        ["audience_network", "Audience Network"],
                        ["threads", "Threads"],
                      ].map(([value, label]) => (
                        <label className="flex gap-1 text-sm" key={value}>
                          <input
                            type="checkbox"
                            checked={form.platforms.includes(value)}
                            onChange={(event) =>
                              set(
                                "platforms",
                                event.target.checked
                                  ? [...form.platforms, value]
                                  : form.platforms.filter(
                                      (item) => item !== value,
                                    ),
                              )
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      선택하지 않으면 새 광고는 자동 게재 위치, 기존 광고는 기존
                      설정을 유지합니다.
                    </p>
                  </fieldset>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ["audiences", "포함할 기존 대상 그룹"],
                      ["excludedAudiences", "제외할 기존 대상 그룹"],
                    ].map(([key, label]) => (
                      <Field label={label} key={key}>
                        <select
                          multiple
                          className={`${inputClass} min-h-24`}
                          value={form[key]}
                          onChange={(event) =>
                            set(
                              key,
                              Array.from(
                                event.target.selectedOptions,
                                (option) => option.value,
                              ),
                            )
                          }
                        >
                          {(choices.audiences || []).map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ))}
                  </div>
                </fieldset>
              )}
            </>
          )}
          {kind === "ad" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {!entity && (
                <Field label="광고세트">
                  <select
                    className={inputClass}
                    value={form.adset_id}
                    onChange={(event) => set("adset_id", event.target.value)}
                    required
                  >
                    {options(choices.adsets, form.adset_id)}
                  </select>
                </Field>
              )}
              <Field label="사용할 소재">
                <select
                  className={inputClass}
                  value={form.creative_id}
                  onChange={(event) => set("creative_id", event.target.value)}
                  required
                >
                  {options(choices.creatives, form.creative_id)}
                </select>
              </Field>
              <p className="text-xs text-slate-500 sm:col-span-2">
                문구·이미지를 바꾸려면 소재 탭에서 새 소재를 만든 뒤 여기에서
                교체하세요.
              </p>
            </div>
          )}
          {kind === "creative" && !entity && (
            <>
              <Field label="소재 형식">
                <select
                  className={inputClass}
                  value={form.format}
                  onChange={(event) => set("format", event.target.value)}
                >
                  <option value="image">이미지 광고</option>
                  <option value="video">동영상 광고</option>
                  <option value="post">기존 Facebook 게시물</option>
                </select>
              </Field>
              {form.format === "post" ? (
                <Field label="게시물 ID" hint="페이지ID_게시물ID 형식입니다.">
                  <input
                    className={inputClass}
                    value={form.post_id}
                    onChange={(event) => set("post_id", event.target.value)}
                    required
                  />
                </Field>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Facebook 페이지">
                      <select
                        className={inputClass}
                        value={form.page_id}
                        onChange={(event) => set("page_id", event.target.value)}
                        required
                      >
                        {options(choices.pages, form.page_id)}
                      </select>
                    </Field>
                    <Field label="Instagram 계정 (선택)">
                      <select
                        className={inputClass}
                        value={form.instagram_id}
                        onChange={(event) =>
                          set("instagram_id", event.target.value)
                        }
                      >
                        {options(
                          choices.instagram,
                          form.instagram_id,
                          "username",
                        )}
                      </select>
                    </Field>
                  </div>
                  {form.format === "image" ? (
                    <Field
                      label="이미지"
                      hint="새 파일은 이미지·영상 탭에서 먼저 업로드해 주세요."
                    >
                      <select
                        className={inputClass}
                        value={form.image_hash}
                        onChange={(event) =>
                          set("image_hash", event.target.value)
                        }
                        required
                      >
                        <option value="">이미지 선택</option>
                        {(choices.images || []).map((row) => (
                          <option value={row.hash} key={row.hash}>
                            {row.name || row.hash}
                          </option>
                        ))}
                      </select>
                      {selectedImage?.url && (
                        <img
                          className="mt-2 max-h-48 rounded-lg object-contain"
                          src={selectedImage.url}
                          alt="선택한 광고 이미지"
                          referrerPolicy="no-referrer"
                        />
                      )}
                    </Field>
                  ) : (
                    <>
                      <Field label="동영상">
                        <select
                          className={inputClass}
                          value={form.video_id}
                          onChange={(event) => {
                            const video = choices.videos?.find(
                              (row) => row.id === event.target.value,
                            );
                            setForm((prior) => ({
                              ...prior,
                              video_id: event.target.value,
                              thumbnail_url:
                                video?.thumbnails?.data?.[0]?.uri || "",
                            }));
                          }}
                          required
                        >
                          {options(choices.videos, form.video_id, "title")}
                        </select>
                      </Field>
                      <Field label="영상 썸네일 주소">
                        <input
                          className={inputClass}
                          type="url"
                          value={form.thumbnail_url}
                          onChange={(event) =>
                            set("thumbnail_url", event.target.value)
                          }
                          required
                        />
                      </Field>
                    </>
                  )}
                  <Field label="광고 본문">
                    <textarea
                      className={inputClass}
                      rows={4}
                      maxLength={2000}
                      value={form.message}
                      onChange={(event) => set("message", event.target.value)}
                      required
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="제목">
                      <input
                        className={inputClass}
                        maxLength={150}
                        value={form.title}
                        onChange={(event) => set("title", event.target.value)}
                        required
                      />
                    </Field>
                    <Field label="설명 (선택)">
                      <input
                        className={inputClass}
                        maxLength={300}
                        value={form.description}
                        onChange={(event) =>
                          set("description", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                  <Field label="고객이 도착할 수북 주소">
                    <input
                      className={inputClass}
                      type="url"
                      value={form.link}
                      onChange={(event) => set("link", event.target.value)}
                      required
                    />
                  </Field>
                  <Field label="광고 버튼">
                    <select
                      className={inputClass}
                      value={form.cta}
                      onChange={(event) => set("cta", event.target.value)}
                    >
                      <option value="SHOP_NOW">구매하기</option>
                      <option value="LEARN_MORE">더 알아보기</option>
                      <option value="SIGN_UP">가입하기</option>
                      <option value="CONTACT_US">문의하기</option>
                    </select>
                  </Field>
                </>
              )}
              <fieldset className="rounded-xl border border-slate-200 p-4">
                <legend className="px-2 text-sm font-bold">
                  광고 출처 이름표
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["source", "출처", "instagram"],
                    ["medium", "매체", "cpc"],
                    ["campaign", "캠페인 이름", "202610_sales_math"],
                    ["trackingId", "실제 캠페인 ID", "광고 목록의 캠페인 ID"],
                    ["content", "소재 구분명", "feed_video_a"],
                  ].map(([key, label, placeholder]) => (
                    <Field key={key} label={label}>
                      <input
                        className={inputClass}
                        value={form[key]}
                        onChange={(event) =>
                          set(key, event.target.value.toLowerCase())
                        }
                        placeholder={placeholder}
                        pattern="[a-z0-9_.-]+"
                        maxLength={100}
                        required
                      />
                    </Field>
                  ))}
                </div>
              </fieldset>
            </>
          )}
          {message && (
            <p className="rounded-lg bg-slate-100 p-3 text-sm" role="status">
              {message}
            </p>
          )}
          {!canManage && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              광고 관리 권한 연결 전입니다. 초안을 저장해 두고 연결 후 반영할 수
              있습니다.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {!entity && (
              <button
                className={buttonClass}
                type="button"
                disabled={busy}
                onClick={saveDraft}
              >
                수북 초안 저장
              </button>
            )}
            <button
              type="submit"
              className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              disabled={!canManage || busy || loading}
            >
              {busy ? "확인 중…" : "반영 전 내용 확인"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
