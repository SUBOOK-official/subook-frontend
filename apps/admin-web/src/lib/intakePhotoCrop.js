// 내지 내용은 다시 그리지 않고 종이 바깥만 자른다. 원본 Blob은 별도 보존한다.
// Canvas API: https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/clip
export function detectIntakePage({ data, width, height }) {
  if (width < 20 || height < 20) return null;
  const count = width * height;
  const light = new Uint8Array(count);
  const border = [];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const p = y * width + x, i = p * 4;
    light[p] = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) border.push(light[p]);
  }
  border.sort((a, b) => a - b);
  const background = border[Math.floor(border.length * 0.65)];
  if (background > 90) return null;
  const threshold = Math.max(105, Math.min(175, background + 65));
  const seen = new Uint8Array(count), queue = new Int32Array(count), regions = [];
  for (let start = 0; start < count; start += 1) {
    if (seen[start] || light[start] < threshold) continue;
    let head = 0, tail = 1;
    queue[0] = start; seen[start] = 1;
    const points = [];
    while (head < tail) {
      const p = queue[head++], x = p % width, y = Math.floor(p / width);
      let boundary = false;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) { boundary = true; continue; }
        const n = ny * width + nx;
        if (light[n] < threshold) { boundary = true; continue; }
        if (!seen[n]) { seen[n] = 1; queue[tail++] = n; }
      }
      if (boundary) points.push([x, y]);
    }
    if (tail > count * 0.06) regions.push({ size: tail, points });
  }
  regions.sort((a, b) => b.size - a.size);
  if (!regions.length || regions[0].size < count * 0.16) return null;
  // 펼친 두 쪽은 검은 책등 때문에 서로 다른 영역으로 검출될 수 있다.
  const pages = regions.filter((region) => region.size >= regions[0].size * 0.35).slice(0, 2);
  const points = pages.flatMap((region) => region.points).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const point of points) { while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop(); lower.push(point); }
  for (const point of [...points].reverse()) { while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop(); upper.push(point); }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  if (hull.length < 4) return null;
  const minX = Math.min(...hull.map(([x]) => x)), maxX = Math.max(...hull.map(([x]) => x));
  const minY = Math.min(...hull.map(([, y]) => y)), maxY = Math.max(...hull.map(([, y]) => y));
  const area = (maxX - minX) * (maxY - minY);
  if (area < count * 0.18 || area > count * 0.94 || pages.reduce((sum, page) => sum + page.size, 0) / area < 0.48) return null;
  // 화면 가장자리와 닿는 종이는 잘린 것인지 확신할 수 없으므로 원본 유지.
  if (minX < 2 || minY < 2 || maxX > width - 3 || maxY > height - 3) return null;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const polygon = hull.map(([x, y]) => [Math.max(0, Math.min(1, (x + Math.sign(x - cx)) / width)), Math.max(0, Math.min(1, (y + Math.sign(y - cy)) / height))]);
  return { polygon, rect: { x: (minX - 1) / width, y: (minY - 1) / height, width: (maxX - minX + 2) / width, height: (maxY - minY + 2) / height } };
}
export function validIntakeCrop(rect) {
  return rect && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(rect[key])) && rect.x >= 0 && rect.y >= 0 && rect.width >= 0.05 && rect.height >= 0.05 && rect.x + rect.width <= 1.001 && rect.y + rect.height <= 1.001;
}
export async function cropIntakeDetail(blob, mode = 'auto', manualRect) {
  if (mode === 'original') return { blob, status: 'original' };
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('원본 사진을 읽지 못했습니다.')); img.src = url; });
    let crop;
    if (mode === 'manual') {
      if (!validIntakeCrop(manualRect)) throw new Error('자를 영역을 조금 더 크게 지정하세요.');
      crop = { rect: manualRect };
    } else {
      const sample = document.createElement('canvas');
      const scale = Math.min(1, 400 / Math.max(image.naturalWidth, image.naturalHeight));
      sample.width = Math.round(image.naturalWidth * scale); sample.height = Math.round(image.naturalHeight * scale);
      const context = sample.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, sample.width, sample.height);
      crop = detectIntakePage(context.getImageData(0, 0, sample.width, sample.height));
      if (!crop) return { blob, status: 'unrecognized' };
    }
    const { rect } = crop, width = image.naturalWidth, height = image.naturalHeight;
    const output = document.createElement('canvas');
    output.width = Math.max(1, Math.round(rect.width * width)); output.height = Math.max(1, Math.round(rect.height * height));
    const context = output.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0, 0, output.width, output.height);
    context.translate(-rect.x * width, -rect.y * height);
    if (crop.polygon) {
      context.beginPath(); crop.polygon.forEach(([x, y], index) => { if (index === 0) context.moveTo(x * width, y * height); else context.lineTo(x * width, y * height); }); context.closePath(); context.clip();
    }
    context.drawImage(image, 0, 0);
    const result = await new Promise((resolve) => output.toBlob(resolve, 'image/jpeg', 0.95));
    if (!result) throw new Error('사진 정리 결과를 저장하지 못했습니다.');
    return { blob: result, status: mode === 'manual' ? 'manual' : 'applied' };
  } finally { URL.revokeObjectURL(url); }
}
