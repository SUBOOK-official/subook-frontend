// 고른 PDF·이미지를 일성월심 교재 쪽 이미지(JPEG)로 바꾼다. 이 브라우저 안에서 바꾸므로 앱 서버는 완성된 쪽만 받는다
// (앱 저장소 docs/adr/0020, 0029). PDF는 pdf.js로 한 쪽씩 그린다. pdf.js는 무거워서 PDF를 처음 고를 때 불러온다.
// 글자 지도·기본 서체·이미지 해독기는 이 사이트가 /pdfjs/ 에서 내준다(pdfjsAssetsPlugin.js).

import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { commonAspect, fitInShape, needsPadNotice, shapeOf } from "./ilseongPageShape.js";

/** 이미지로 올릴 때 긴 변이 이보다 작으면 앱에서 흐리게 보여 받지 않는다. */
const MIN_LONG_SIDE = 1000;
const MAX_PAGES = 1000;
const MAX_SOURCE_PAGES = 4000;
// 쪽 모양(세로 ÷ 가로)은 교재마다 다를 수 있다(앱 저장소 docs/adr/0048). 고른 파일의 쪽 크기를 재서 그 교재의 모양을 정하고
// (ilseongPageShape.js), 모든 쪽을 그 모양의 이미지로 만든다. 모양이 다른 쪽(표지·접지)은 흰 여백을 넣어 맞춘다.
// 가로로 긴 교재도 그대로 받는다. 앱과 앱 서버는 여기서 정한 모양을 그대로 쓴다.
const JPEG_QUALITY = 0.9;
const MAX_BYTES = 4 * 1024 * 1024;

/** 사용자에게 그대로 보여 줄 수 있는 문구를 담는다. */
export class PagePrepareError extends Error {}

export function releasePages(pages) {
  pages.forEach((page) => URL.revokeObjectURL(page.url));
}

const isPdf = (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);
const isImage = (file) => /^image\/(jpeg|png)$/.test(file.type) || /\.(jpe?g|png)$/i.test(file.name);
// 파일 이름 순서가 쪽 순서다. 숫자는 수로 견준다(p2가 p10보다 앞)
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/** 그린 쪽을 교재의 쪽 모양 바탕(흰색) 가운데에 옮겨 그린다. 원래 캔버스는 비운다. */
function padToShape(drawn, shape) {
  const canvas = document.createElement("canvas");
  canvas.width = shape.width;
  canvas.height = shape.height;
  const context = canvas.getContext("2d");
  if (!context) throw new PagePrepareError("이 브라우저에서는 이미지를 바꿀 수 없어요. 크롬에서 해 주세요.");
  const place = fitInShape(drawn.width, drawn.height, shape);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = "high";
  context.drawImage(drawn, place.x, place.y, place.width, place.height);
  drawn.width = 0;
  drawn.height = 0;
  return canvas;
}

async function toJpeg(canvas, label) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  // 다 쓴 캔버스의 메모리를 바로 돌려준다(쪽이 많으면 브라우저가 느려진다)
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new PagePrepareError(`${label}을 이미지로 바꾸지 못했어요.`);
  if (blob.size > MAX_BYTES) throw new PagePrepareError(`${label} 이미지가 너무 커요(최대 4MB).`);
  return blob;
}

/** aspect = 이 교재의 쪽 모양(모든 쪽이 같다). padded = 이 쪽은 모양이 달라 여백이 눈에 띈다. */
async function toPage(canvas, no, shape, padded = false) {
  const blob = await toJpeg(canvas, `${no}쪽`);
  return { no, blob, url: URL.createObjectURL(blob), padded, aspect: shape.aspect };
}

/** PDF 파일을 연다. 다 쓰면 task.destroy()로 닫는다. */
async function openPdf(file) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    wasmUrl: "/pdfjs/wasm/",
    iccUrl: "/pdfjs/iccs/",
    isEvalSupported: false,
  });
  try {
    return { task, doc: await task.promise };
  } catch (error) {
    throw new PagePrepareError(
      error?.name === "PasswordException"
        ? `암호가 걸린 PDF는 올릴 수 없어요: ${file.name}`
        : `PDF를 읽지 못했어요. 파일이 깨지지 않았는지 확인해 주세요: ${file.name}`,
    );
  }
}

/** PDF 한 쪽의 크기(회전까지 반영한, 보이는 그대로의 가로·세로). */
async function pdfPageSize(doc, no) {
  const page = await doc.getPage(no);
  const natural = page.getViewport({ scale: 1 });
  page.cleanup();
  return { width: natural.width, height: natural.height };
}

/**
 * PDF의 한 쪽을 교재의 쪽 모양(shape) 크기의 캔버스로 그린다.
 * 모양이 다른 쪽은 바탕 가운데에 맞춰 넣고, 여백이 눈에 띄면 canvas.padded = true로 알린다.
 */
async function renderPdfPage(doc, no, shape) {
  const page = await doc.getPage(no);
  const natural = page.getViewport({ scale: 1 });
  const place = fitInShape(natural.width, natural.height, shape);
  const fills = place.width === shape.width && place.height === shape.height;
  const viewport = page.getViewport({ scale: place.width / natural.width });
  const canvas = document.createElement("canvas");
  canvas.width = fills ? shape.width : Math.round(viewport.width);
  canvas.height = fills ? shape.height : Math.round(viewport.height);
  // 쪽 모양이 같으면 바탕 크기로 바로 그린다. 세로는 반올림만큼(1% 안) 맞춰 늘인다(다시 줄였다 늘리면 글자가 흐려진다)
  const transform = fills ? [1, 0, 0, shape.height / viewport.height, 0, 0] : undefined;
  // print로 그리면 화면 갱신 주기를 기다리지 않는다. 다른 탭을 보고 있어도 멈추지 않는다
  await page.render({ canvas, viewport, intent: "print", transform }).promise;
  page.cleanup();
  const out = fills ? canvas : padToShape(canvas, shape);
  out.padded = needsPadNotice(natural.width, natural.height, shape);
  return out;
}

async function fromPdf(file, out, onProgress, stopped) {
  const { task, doc } = await openPdf(file);
  try {
    const total = doc.numPages;
    if (total > MAX_PAGES) throw new PagePrepareError(`쪽이 너무 많아요(${total}쪽). 교재 한 권만 올려 주세요.`);
    onProgress(0, total);
    // 먼저 쪽 크기만 재서 이 교재의 쪽 모양을 정한다
    const sizes = [];
    for (let no = 1; no <= total && !stopped(); no += 1) sizes.push(await pdfPageSize(doc, no));
    const shape = shapeOf(commonAspect(sizes));
    for (let no = 1; no <= total && !stopped(); no += 1) {
      const canvas = await renderPdfPage(doc, no, shape);
      out.push(await toPage(canvas, no, shape, canvas.padded === true));
      onProgress(no, total);
    }
  } finally {
    await task.destroy();
  }
}

async function fromImages(files, out, onProgress, stopped) {
  if (files.length > MAX_PAGES) throw new PagePrepareError(`이미지가 너무 많아요(${files.length}장). 교재 한 권만 올려 주세요.`);
  const sorted = [...files].sort(byName);
  onProgress(0, sorted.length);
  // 이미지는 첫 장의 모양이 그 교재의 쪽 모양이다
  let shape = null;
  for (let index = 0; index < sorted.length && !stopped(); index += 1) {
    const file = sorted[index];
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new PagePrepareError(`그림으로 읽지 못한 파일이 있어요: ${file.name}`);
    }
    try {
      if (Math.max(bitmap.width, bitmap.height) < MIN_LONG_SIDE) {
        throw new PagePrepareError(
          `${file.name}: ${bitmap.width}×${bitmap.height}px이라 너무 작아요. 긴 변이 ${MIN_LONG_SIDE}px 이상이어야 해요.`,
        );
      }
      shape ??= shapeOf(bitmap.height / bitmap.width);
      const place = fitInShape(bitmap.width, bitmap.height, shape);
      const canvas = document.createElement("canvas");
      canvas.width = shape.width;
      canvas.height = shape.height;
      const context = canvas.getContext("2d");
      if (!context) throw new PagePrepareError("이 브라우저에서는 이미지를 바꿀 수 없어요. 크롬에서 해 주세요.");
      // 투명한 PNG와 여백은 흰 바탕으로
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, place.x, place.y, place.width, place.height);
      out.push(await toPage(canvas, index + 1, shape, needsPadNotice(bitmap.width, bitmap.height, shape)));
    } finally {
      bitmap.close();
    }
    onProgress(index + 1, sorted.length);
  }
}

/**
 * 교재 한 권: PDF 한 개, 또는 쪽 순서대로 이름을 붙인 이미지 여러 장을 받아 쪽마다 { no, blob, url, padded, aspect }로 만든다.
 * aspect = 이 교재의 쪽 모양(세로 ÷ 가로). 모든 쪽이 같은 값이고, 올릴 때 앱 서버에 함께 알린다.
 * stopped()가 참이 되면(창을 닫았을 때) 그만두고 빈 목록을 준다.
 */
export async function preparePages(files, onProgress, stopped) {
  const pdfs = files.filter(isPdf);
  const images = files.filter(isImage);
  if (pdfs.length + images.length !== files.length || files.length === 0) {
    throw new PagePrepareError("PDF나 JPG·PNG 이미지만 올릴 수 있어요.");
  }
  if (pdfs.length > 0 && (pdfs.length > 1 || images.length > 0)) {
    throw new PagePrepareError("PDF는 교재 한 권을 한 파일로 올려 주세요. PDF와 이미지를 함께 고를 수 없어요.");
  }
  const pages = [];
  try {
    if (pdfs.length === 1) await fromPdf(pdfs[0], pages, onProgress, stopped);
    else await fromImages(images, pages, onProgress, stopped);
  } catch (error) {
    releasePages(pages);
    throw error;
  }
  if (stopped()) {
    releasePages(pages);
    return [];
  }
  return pages;
}

/**
 * 여러 PDF를 이름 순서대로 이어 붙인 하나의 쪽 묶음. 과목 전체(모든 주차)를 한 번에 올릴 때 쓴다.
 * 쪽이 수백 장이라 미리 다 그려 두지 않고, 올릴 때 한 쪽씩 그린다.
 * @returns {Promise<{ files: {name: string, pages: number}[], total: number, close(): Promise<void>,
 *                     aspectOf(nos: number[]): Promise<number>, page(no: number, aspect?: number): Promise<Blob>,
 *                     padded(): boolean }>}
 *   aspectOf(nos) = 그 쪽들(교재 한 권)의 쪽 모양. page(no, aspect) = 그 모양으로 그린 쪽(aspect가 없으면 그 쪽 그대로의 모양).
 *   padded() = 지금까지 그린 쪽 가운데 모양이 달라 여백이 눈에 띄는 쪽이 있었나
 */
export async function openPageSource(files) {
  if (files.length === 0 || !files.every(isPdf)) throw new PagePrepareError("PDF 파일만 올릴 수 있어요.");
  const opened = [];
  const close = async () => {
    await Promise.all(opened.splice(0).map((entry) => entry.task.destroy()));
  };
  try {
    for (const file of [...files].sort(byName)) {
      const { task, doc } = await openPdf(file);
      opened.push({ name: file.name, pages: doc.numPages, task, doc });
    }
  } catch (error) {
    await close();
    throw error;
  }
  const list = opened.map((entry) => ({ name: entry.name, pages: entry.pages }));
  const total = list.reduce((sum, file) => sum + file.pages, 0);
  if (total > MAX_SOURCE_PAGES) {
    await close();
    throw new PagePrepareError(`쪽이 너무 많아요(${total}쪽).`);
  }
  let anyPadded = false;
  /** 이어 붙인 쪽 번호 → 그 쪽이 든 PDF와 그 안의 쪽 번호 */
  const locate = (no) => {
    let rest = no;
    for (const entry of opened) {
      if (rest >= 1 && rest <= entry.pages) {
        return { doc: entry.doc, no: rest, label: opened.length > 1 ? `${entry.name} ${rest}쪽` : `${rest}쪽` };
      }
      rest -= entry.pages;
    }
    throw new PagePrepareError(`${no}쪽이 없어요.`);
  };
  const sizes = new Map();
  const sizeOf = async (no) => {
    if (!sizes.has(no)) {
      const at = locate(no);
      sizes.set(no, await pdfPageSize(at.doc, at.no));
    }
    return sizes.get(no);
  };
  return {
    files: list,
    total,
    close,
    padded: () => anyPadded,
    async aspectOf(nos) {
      const measured = [];
      for (const no of nos) measured.push(await sizeOf(no));
      return commonAspect(measured);
    },
    async page(no, aspect) {
      const at = locate(no);
      const own = await sizeOf(no);
      const shape = shapeOf(aspect ?? own.height / own.width);
      const canvas = await renderPdfPage(at.doc, at.no, shape);
      if (aspect !== undefined && canvas.padded === true) anyPadded = true;
      return toJpeg(canvas, at.label);
    },
  };
}
