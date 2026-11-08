/** Tọa độ hotspot lưu dạng tương đối 0–1 theo ảnh gốc (khớp `hotspot-image` bên customer-web). */
export interface Point {
  x: number;
  y: number;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const round = (v: number) => Math.round(v * 10_000) / 10_000;

/** Vị trí con trỏ → tọa độ tương đối trong khung ảnh (ảnh hiện đúng tỉ lệ gốc, không cắt). */
export function toRelative(
  clientX: number,
  clientY: number,
  box: { left: number; top: number; width: number; height: number },
): Point {
  if (!box.width || !box.height) return { x: 0, y: 0 };
  return { x: round(clamp((clientX - box.left) / box.width)), y: round(clamp((clientY - box.top) / box.height)) };
}

const STEP: Record<string, [number, number]> = {
  ArrowLeft: [-0.01, 0],
  ArrowRight: [0.01, 0],
  ArrowUp: [0, -0.01],
  ArrowDown: [0, 0.01],
};

/** Phím mũi tên dời điểm 1%; phím khác trả `null`. */
export function nudge(p: Point, key: string): Point | null {
  const d = STEP[key];
  return d ? { x: round(clamp(p.x + d[0])), y: round(clamp(p.y + d[1])) } : null;
}
