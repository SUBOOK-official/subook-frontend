// 일성월심 교재의 쪽 모양(세로 ÷ 가로)을 정하는 계산. 교재마다 쪽 모양이 다를 수 있다(앱 저장소 docs/adr/0048).
// 올리는 사람이 판형을 몰라도 되게, 고른 파일의 쪽 크기를 재서 정한다. 앱과 앱 서버는 여기서 정한 값을 그대로 쓴다.

/** 따로 정하지 않은 교재의 쪽 모양: B5 세로(182×257mm). 앱의 기본값과 같다. */
export const B5_ASPECT = 1.4125;
/** 앱 서버가 받는 범위. 이보다 길쭉한 쪽은 이 모양의 바탕에 여백을 넣어 맞춘다. */
const MIN_ASPECT = 0.4;
const MAX_ASPECT = 2.5;
/** 쪽 이미지의 넓이(px). B5 세로일 때 2000×2825가 된다. 가로로 긴 쪽도 같은 넓이라 선명함이 같다. */
const PAGE_AREA = 2000 * 2825;
/** 이만큼 안에서 다르면 같은 모양으로 본다(B5와 A4·A5처럼 거의 같은 판형). */
const SAME_SHAPE = 0.005;
/** 교재의 쪽 모양과 이보다 많이 다른 쪽에 여백을 넣었으면 올리는 사람에게 알린다. */
const PAD_NOTICE = 0.03;
/** 바탕과 이만큼 안에서 다르면 여백 없이 꽉 채운다(B5로 맞춘 A4, 반올림 차이). 늘어나는 것이 눈에 보이지 않는다. */
const FILL_WITHIN = 0.01;

/** 잰 값을 앱이 쓰는 값으로: 범위 안으로 넣고, B5와 거의 같으면 B5로 맞추고, 소수 넷째 자리까지. */
export function snapAspect(aspect) {
  if (!Number.isFinite(aspect) || aspect <= 0) return B5_ASPECT;
  const clamped = Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, aspect));
  if (Math.abs(clamped - B5_ASPECT) <= B5_ASPECT * SAME_SHAPE) return B5_ASPECT;
  return Math.round(clamped * 10000) / 10000;
}

/**
 * 그 쪽 모양의 이미지 크기(px).
 * @returns {{ aspect: number, width: number, height: number }}
 */
export function shapeOf(aspect) {
  const snapped = snapAspect(aspect);
  const width = Math.round(Math.sqrt(PAGE_AREA / snapped));
  return { aspect: snapped, width, height: Math.round(width * snapped) };
}

/**
 * 교재 한 권의 쪽 모양: 가장 많은 쪽이 가진 모양. 표지나 접지 한두 쪽만 크기가 달라도 본문의 모양을 따른다.
 * @param {{ width: number, height: number }[]} sizes 쪽마다 잰 크기(단위는 무엇이든)
 */
export function commonAspect(sizes) {
  const buckets = new Map();
  sizes.forEach((size, index) => {
    if (!(size.width > 0 && size.height > 0)) return;
    const aspect = size.height / size.width;
    const key = Math.round(aspect * 100);
    const bucket = buckets.get(key) ?? { first: index, values: [] };
    bucket.values.push(aspect);
    buckets.set(key, bucket);
  });
  let best = null;
  for (const bucket of buckets.values()) {
    // 쪽 수가 같으면 앞에 나온 모양을 고른다
    if (!best || bucket.values.length > best.values.length || (bucket.values.length === best.values.length && bucket.first < best.first)) {
      best = bucket;
    }
  }
  if (!best) return B5_ASPECT;
  const sorted = [...best.values].sort((a, b) => a - b);
  return snapAspect(sorted[Math.floor(sorted.length / 2)]);
}

/**
 * 쪽을 교재의 쪽 모양 바탕 가운데에 맞춰 넣을 때의 자리(잘리지 않게 줄이거나 늘린다).
 * @returns {{ width: number, height: number, x: number, y: number }} 바탕 안에서 그림이 놓일 크기와 왼쪽 위
 */
export function fitInShape(width, height, shape) {
  const scale = Math.min(shape.width / width, shape.height / height);
  let w = Math.min(shape.width, Math.round(width * scale));
  let h = Math.min(shape.height, Math.round(height * scale));
  if (shape.width - w <= shape.width * FILL_WITHIN) w = shape.width;
  if (shape.height - h <= shape.height * FILL_WITHIN) h = shape.height;
  return { width: w, height: h, x: Math.round((shape.width - w) / 2), y: Math.round((shape.height - h) / 2) };
}

/** 이 쪽은 교재의 쪽 모양과 눈에 띄게 달라서 여백이 보이는가. */
export function needsPadNotice(width, height, shape) {
  return Math.abs(height / width - shape.aspect) > shape.aspect * PAD_NOTICE;
}

/** 두 쪽 모양이 같은가(다시 올릴 때 전과 달라졌는지 볼 때). 비어 있으면 B5 세로다. */
export function sameAspect(a, b) {
  const x = a ?? B5_ASPECT;
  const y = b ?? B5_ASPECT;
  return Math.abs(x - y) <= Math.max(x, y) * SAME_SHAPE;
}

/** 올리는 사람에게 보여 줄 쪽 모양 이름. B5 세로와 같으면 빈 글자(따로 알릴 것이 없다). */
export function shapeName(aspect) {
  const value = aspect ?? B5_ASPECT;
  if (sameAspect(value, B5_ASPECT)) return "";
  if (value < 0.95) return "가로로 긴 쪽";
  if (value <= 1.05) return "정사각형에 가까운 쪽";
  return value > B5_ASPECT ? "B5보다 길쭉한 쪽" : "B5보다 넓적한 쪽";
}
