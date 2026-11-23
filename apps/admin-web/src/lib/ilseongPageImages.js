// 고른 PDF·이미지를 일성월심 교재 쪽 이미지(JPEG)로 바꾼다. 이 브라우저 안에서 바꾸므로 앱 서버는 완성된 쪽만 받는다
// (앱 저장소 docs/adr/0020, 0029). PDF는 pdf.js로 한 쪽씩 그린다. pdf.js는 무거워서 PDF를 처음 고를 때 불러온다.
// 글자 지도·기본 서체·이미지 해독기는 이 사이트가 /pdfjs/ 에서 내준다(pdfjsAssetsPlugin.js).

import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/** 앱이 쓰는 쪽 이미지의 가로. 세로는 쪽 모양에 맞춘다(B5면 2825). */
const PAGE_WIDTH = 2000;
const MIN_WIDTH = 1000;
const MAX_PAGES = 1000;
const MAX_SOURCE_PAGES = 4000;
/**
 * 앱의 쪽은 B5 세로(182×257mm) 모양이다. 앱 서버도 같은 기준으로 한 번 더 본다.
 * 크기가 다른 세로 교재(단어장 등)는 흰 여백을 넣어 이 모양에 맞춘다. 가로로 긴 쪽은 펼침면을 잘못 내보낸 것으로 보고 받지 않는다.
 */
const PAGE_RATIO = 182 / 257;
const PAGE_HEIGHT = Math.round(PAGE_WIDTH / PAGE_RATIO);
const RATIO_TOLERANCE = 0.03;
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

/** B5 세로 모양인가(조금의 차이는 봐준다). */
export function isPageShape(width, height) {
  return Math.abs(width / height - PAGE_RATIO) <= PAGE_RATIO * RATIO_TOLERANCE;
}

/** 가로로 긴 쪽은 받지 않는다(펼침면). B5가 아닌 세로 쪽은 여백을 넣어 맞추므로 여기서는 통과시킨다. */
function checkShape(width, height, label) {
  if (width > height) {
    throw new PagePrepareError(`${label}: 가로로 긴 쪽이에요. 펼침면이 아니라 한 쪽씩 내보낸 파일인지 확인해 주세요.`);
  }
}

/**
 * B5 모양이 아닌 쪽을 B5 모양의 흰 바탕 가운데에 맞춰 넣을 때의 자리.
 * @returns {{ width: number, height: number, x: number, y: number }} 바탕(PAGE_WIDTH×PAGE_HEIGHT) 안에서 그림이 놓일 크기와 왼쪽 위
 */
export function fitInPage(width, height) {
  const scale = Math.min(PAGE_WIDTH / width, PAGE_HEIGHT / height);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  return { width: w, height: h, x: Math.round((PAGE_WIDTH - w) / 2), y: Math.round((PAGE_HEIGHT - h) / 2) };
}

/** 그린 쪽을 B5 모양의 흰 바탕 가운데에 옮겨 그린다. 원래 캔버스는 비운다. */
function padToPage(drawn) {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new PagePrepareError("이 브라우저에서는 이미지를 바꿀 수 없어요. 크롬에서 해 주세요.");
  const place = fitInPage(drawn.width, drawn.height);
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

async function toPage(canvas, no, padded = false) {
  const blob = await toJpeg(canvas, `${no}쪽`);
  return { no, blob, url: URL.createObjectURL(blob), padded };
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

/**
 * PDF의 한 쪽을 앱이 쓰는 크기의 캔버스로 그린다. label은 오류 안내에 쓰는 쪽 이름.
 * B5 모양이 아닌 세로 쪽은 B5 바탕 가운데에 맞춰 넣고 canvas.padded = true로 알린다.
 */
async function renderPdfPage(doc, no, label) {
  const page = await doc.getPage(no);
  const natural = page.getViewport({ scale: 1 });
  checkShape(natural.width, natural.height, label);
  const fits = isPageShape(natural.width, natural.height);
  const scale = fits ? PAGE_WIDTH / natural.width : fitInPage(natural.width, natural.height).width / natural.width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  // print로 그리면 화면 갱신 주기를 기다리지 않는다. 다른 탭을 보고 있어도 멈추지 않는다
  await page.render({ canvas, viewport, intent: "print" }).promise;
  page.cleanup();
  if (fits) return canvas;
  const padded = padToPage(canvas);
  padded.padded = true;
  return padded;
}

async function fromPdf(file, out, onProgress, stopped) {
  const { task, doc } = await openPdf(file);
  try {
    const total = doc.numPages;
    if (total > MAX_PAGES) throw new PagePrepareError(`쪽이 너무 많아요(${total}쪽). 교재 한 권만 올려 주세요.`);
    onProgress(0, total);
    for (let no = 1; no <= total && !stopped(); no += 1) {
      const canvas = await renderPdfPage(doc, no, `${no}쪽`);
      out.push(await toPage(canvas, no, canvas.padded === true));
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
  for (let index = 0; index < sorted.length && !stopped(); index += 1) {
    const file = sorted[index];
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new PagePrepareError(`그림으로 읽지 못한 파일이 있어요: ${file.name}`);
    }
    try {
      if (bitmap.width < MIN_WIDTH) {
        throw new PagePrepareError(`${file.name}: 가로가 ${bitmap.width}px이라 너무 작아요. ${MIN_WIDTH}px 이상이어야 해요.`);
      }
      checkShape(bitmap.width, bitmap.height, file.name);
      const width = Math.min(bitmap.width, PAGE_WIDTH);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = Math.round((bitmap.height * width) / bitmap.width);
      const context = canvas.getContext("2d");
      if (!context) throw new PagePrepareError("이 브라우저에서는 이미지를 바꿀 수 없어요. 크롬에서 해 주세요.");
      // 투명한 PNG는 흰 바탕으로
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const fits = isPageShape(bitmap.width, bitmap.height);
      out.push(await toPage(fits ? canvas : padToPage(canvas), index + 1, !fits));
    } finally {
      bitmap.close();
    }
    onProgress(index + 1, sorted.length);
  }
}

/**
 * 교재 한 권: PDF 한 개, 또는 쪽 순서대로 이름을 붙인 이미지 여러 장을 받아 쪽마다 { no, blob, url }로 만든다.
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
 * @returns {Promise<{ files: {name: string, pages: number}[], total: number, page(no: number): Promise<Blob>,
 *                     padded(): boolean, close(): Promise<void> }>}  padded() = 지금까지 그린 쪽 가운데 여백을 넣어 맞춘 쪽이 있었나
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
  return {
    files: list,
    total,
    close,
    padded: () => anyPadded,
    async page(no) {
      let rest = no;
      for (const entry of opened) {
        if (rest <= entry.pages) {
          const label = opened.length > 1 ? `${entry.name} ${rest}쪽` : `${rest}쪽`;
          const canvas = await renderPdfPage(entry.doc, rest, label);
          if (canvas.padded === true) anyPadded = true;
          return toJpeg(canvas, label);
        }
        rest -= entry.pages;
      }
      throw new PagePrepareError(`${no}쪽이 없어요.`);
    },
  };
}
