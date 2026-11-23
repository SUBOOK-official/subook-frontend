import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useIlseongData, useIlseongSales } from "../../lib/ilseongAdmin";
import { STEPS, seriesProgress, seriesStatus, stepNumber } from "../../lib/ilseongGuide";
import { ChevronLeftIcon } from "../icons";
import { SeriesDialog } from "./IlseongCatalogDialogs";
import { PagesStep } from "./IlseongStepPages";
import { SellStep, StoreStep } from "./IlseongStepStore";
import { SetupForm, StructureStep } from "./IlseongStepStructure";
import { Badge, EmptyNote, ErrorNote, LoadingNote, SMALL_BUTTON, Section, Step, ilseongPath } from "./IlseongUi";

// 학습지 — 학습지 하나를 만들어 팔기까지를 네 단계로 따라간다(앱 저장소 docs/adr/0041):
//   1 구성 만들기 → 2 교재 PDF 올리기 → 3 판매 상품 만들기 → 4 판매 시작
// 어디까지 왔는지는 화면이 있는 것을 보고 정한다(lib/ilseongGuide.js). 지금 할 단계만 펼쳐 둔다.
//
// seriesId: 없으면 목록, "new"면 새 학습지 만들기, 번호면 그 학습지.

export default function IlseongSeries({ seriesId }) {
  const catalog = useIlseongData("/api/admin/series");
  const sales = useIlseongSales();
  const list = catalog.data;

  if (!list) {
    return (
      <div className="space-y-4">
        <ErrorNote error={catalog.error} onRetry={() => void catalog.reload()} />
        {catalog.loading ? <LoadingNote /> : null}
      </div>
    );
  }
  if (seriesId === "new") return <NewSeries onCreated={catalog.setData} />;
  const series = seriesId ? list.find((entry) => entry.id === seriesId) : null;
  if (seriesId && !series) {
    return (
      <Section>
        <EmptyNote>
          찾는 학습지가 없어요. <Link className="font-semibold text-brand hover:underline" to={ilseongPath("books")}>학습지 목록</Link>에서 다시 골라 주세요.
        </EmptyNote>
      </Section>
    );
  }
  if (series) return <SeriesDetail catalog={catalog} key={series.id} sales={sales} series={series} />;
  return <SeriesList list={list} sales={sales} />;
}

function BackLink() {
  return (
    <Link className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-slate-500 hover:text-slate-800" to={ilseongPath("books")}>
      <ChevronLeftIcon size={14} />
      학습지 목록
    </Link>
  );
}

// ── 목록 ─────────────────────────────────────────────────────

function SeriesList({ list, sales }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm leading-relaxed text-slate-500">학습지를 고르면 지금 할 일부터 차례로 보여 줘요.</p>
        <Link className="btn-primary !w-auto !px-4 !py-2.5" to={ilseongPath("books", "new")}>새 학습지 만들기</Link>
      </div>
      <ErrorNote error={sales.error} onRetry={() => void sales.reload()} />
      {list.length === 0 ? (
        <Section>
          <EmptyNote>아직 학습지가 없어요. [새 학습지 만들기]로 시작해 주세요.</EmptyNote>
        </Section>
      ) : (
        <ul className="space-y-3">
          {list.map((series) => {
            const progress = seriesProgress(series, sales.data?.products ?? null);
            const status = seriesStatus(progress);
            return (
              <li key={series.id}>
                <Link
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-slate-300 hover:bg-slate-50"
                  to={ilseongPath("books", series.id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold text-slate-950">{series.name}</span>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </span>
                    <span className="mt-1 block text-sm text-slate-500">
                      {series.subjectWord} {progress.counts.subjects}개 · 교재 {progress.counts.total}권
                      {status.note ? <span className="text-slate-700"> · {status.note}</span> : null}
                    </span>
                  </span>
                  <span className={`btn-secondary ${SMALL_BUTTON}`}>{progress.current ? "이어서 하기" : "열기"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── 새 학습지 ────────────────────────────────────────────────

function NewSeries({ onCreated }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <div>
        <BackLink />
        <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">새 학습지 만들기</h2>
      </div>
      <Step no={1} state="current" summary="이름과 과목, 교재 수를 정해요. 만든 뒤에도 고칠 수 있어요." title={STEPS[0].title}>
        <SetupForm
          onCreated={(result) => {
            onCreated(result.series);
            navigate(ilseongPath("books", result.id), { replace: true });
          }}
        />
      </Step>
      {STEPS.slice(1).map((step, index) => (
        <Step key={step.key} no={index + 2} state="locked" summary="앞 단계를 마치면 할 수 있어요." title={step.title} />
      ))}
    </div>
  );
}

// ── 학습지 하나 ──────────────────────────────────────────────

function SeriesDetail({ series, catalog, sales }) {
  const navigate = useNavigate();
  const progress = seriesProgress(series, sales.data?.products ?? null);
  const status = seriesStatus(progress);
  const { counts, done, current } = progress;
  // 지금 할 단계는 펼쳐 두고, 나머지는 누른 것만 펼친다. 단계가 넘어가면 새 단계가 저절로 펼쳐진다
  const [opened, setOpened] = useState({});
  const [settings, setSettings] = useState(false);
  const isOpen = (key) => opened[key] ?? key === current;
  const toggle = (key) => setOpened((prev) => ({ ...prev, [key]: !isOpen(key) }));
  const stateOf = (key, locked) => (locked ? "locked" : key === current ? "current" : done[key] ? "done" : "todo");

  const waiting = counts.total - counts.ready;
  const summaries = {
    structure: counts.total === 0
      ? `${series.subjectWord}·교재를 만들어요.`
      : `${series.subjects.map((subject) => subject.name).join(" · ")} · 교재 ${counts.total}권`,
    pages: counts.total === 0
      ? "앞 단계를 마치면 할 수 있어요."
      : waiting === 0
        ? `교재 ${counts.total}권을 모두 앱에서 볼 수 있어요.`
        : `교재 ${counts.total}권 가운데 ${counts.ready}권을 올렸어요. 올린 교재만 학생 앱에서 볼 수 있어요. 남은 교재는 팔면서 올려도 돼요.`,
    store: counts.total === 0
      ? "앞 단계를 마치면 할 수 있어요."
      : progress.unknownStore
        ? "확인하는 중이에요."
        : done.store
          ? progress.store.map((item) => item.title).join(", ")
          : "수북 사이트(subook.kr)에 올릴 상품을 만들어요.",
    sell: !done.store
      ? "판매 상품을 만들면 할 수 있어요."
      : done.sell
        ? "수북 사이트에서 팔고 있어요. 산 사람이 앱에 로그인하면 교재가 등록돼요."
        : "아직 사이트에 보이지 않아요.",
  };

  return (
    <div className="space-y-4">
      <div>
        <BackLink />
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">{series.name}</h2>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <button className={`btn-secondary ${SMALL_BUTTON}`} onClick={() => setSettings(true)} type="button">이름 설정</button>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {current
            ? <>지금 할 일: <strong className="font-semibold text-slate-800">{stepNumber(current)}단계 {STEPS.find((step) => step.key === current).title}</strong></>
            : status.note}
        </p>
      </div>
      <ErrorNote error={sales.error} onRetry={() => void sales.reload()} />

      <Step no={1} onToggle={() => toggle("structure")} open={isOpen("structure")} state={stateOf("structure", false)} summary={summaries.structure} title={STEPS[0].title}>
        <StructureStep onChanged={catalog.setData} series={series} />
      </Step>

      <Step
        badge={waiting > 0 && counts.ready > 0 && current !== "pages" ? <Badge tone="orange">{waiting}권 남음</Badge> : null}
        no={2}
        onToggle={() => toggle("pages")}
        open={isOpen("pages")}
        state={stateOf("pages", counts.total === 0)}
        summary={summaries.pages}
        title={STEPS[1].title}
      >
        <PagesStep onChanged={() => void catalog.reload({ quiet: true })} series={series} />
      </Step>

      <Step
        no={3}
        onToggle={() => toggle("store")}
        open={isOpen("store")}
        state={stateOf("store", counts.total === 0 || progress.unknownStore)}
        summary={summaries.store}
        title={STEPS[2].title}
      >
        <StoreStep onChanged={() => void sales.reload()} progress={progress} series={series} />
      </Step>

      <Step no={4} onToggle={() => toggle("sell")} open={isOpen("sell")} state={stateOf("sell", !done.store)} summary={summaries.sell} title={STEPS[3].title}>
        <SellStep onChanged={() => sales.reload()} progress={progress} sales={sales.data} series={series} />
      </Step>

      {settings ? (
        <SeriesDialog
          onClose={() => setSettings(false)}
          onSaved={(next) => {
            catalog.setData(next);
            setSettings(false);
            // 비어 있는 학습지를 지웠으면 목록으로 돌아간다
            if (!next.some((entry) => entry.id === series.id)) navigate(ilseongPath("books"), { replace: true });
          }}
          series={series}
        />
      ) : null}
    </div>
  );
}
