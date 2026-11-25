// 학습지 표지 — 고른 파일(그림 또는 PDF의 첫 쪽)을 올릴 JPEG로 바꾼다. 브라우저에서만 돈다(앱 저장소 docs/adr/0060).

import { fitCoverSize } from "./ilseongCover";
import { openPageSource } from "./ilseongPageImages";

const isPdf = (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

/** 고른 파일(그림 또는 PDF의 첫 쪽)을 올릴 JPEG로 바꾼다. */
export async function toCoverJpeg(file) {
  if (isPdf(file)) {
    const source = await openPageSource([file]);
    try {
      return await source.page(1);
    } finally {
      await source.close();
    }
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name}: 그림 파일을 읽지 못했어요. JPG, PNG, PDF 가운데 하나로 골라 주세요.`);
  }
  try {
    const size = fitCoverSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    // 투명한 PNG는 흰 바탕 위에 그린다(JPEG에는 투명이 없다)
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw new Error(`${file.name}: 그림을 바꾸지 못했어요.`);
    return blob;
  } finally {
    bitmap.close?.();
  }
}
