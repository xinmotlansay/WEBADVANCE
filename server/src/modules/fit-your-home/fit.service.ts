/**
 * Fit your home (FR-24): kiểm tra kiện hàng có đưa được qua các lối đi trong nhà hay không.
 * Hàm thuần, không đụng database. Mọi kích thước tính bằng cm, cân nặng bằng kg.
 */

export type PassageType = 'DOOR' | 'ELEVATOR' | 'STAIRS' | 'HALLWAY';

export interface Passage {
  type: PassageType;
  label?: string;
  /** Lỗ mở (cửa, lòng cầu thang, hành lang; với thang máy là cửa thang). */
  width: number;
  height: number;
  length?: number;
  cabinLength?: number;
  cabinWidth?: number;
  cabinHeight?: number;
  loadCapacityKg?: number;
}

export interface Box {
  name?: string;
  length: number;
  width: number;
  height: number;
  weight?: number;
}

export type FitStatus = 'PASS' | 'CAUTION' | 'FAIL';
/** FLAT: nằm ngang, cạnh dài theo hướng di chuyển. UPRIGHT: dựng đứng. TILT: đặt nghiêng. */
export type Posture = 'FLAT' | 'UPRIGHT' | 'TILT';
export type FitVerdict = 'FITS_AS_PACKAGE' | 'FITS_BY_PARTS' | 'DOES_NOT_FIT';

export interface PassageResult {
  index: number;
  passageLabel: string;
  type: PassageType;
  status: FitStatus;
  posture: Posture | null;
  minClearanceCm: number | null;
  note: string | null;
}

export interface CheckDetail {
  fits: boolean;
  details: PassageResult[];
}

export interface FitCheckResult {
  verdict: FitVerdict;
  status: FitStatus;
  disclaimer: string;
  packageCheck: CheckDetail;
  partCheck: CheckDetail | null;
  elevatorLoadCheck: { fits: boolean; totalWeightKg: number; capacityKg: number } | null;
  usedDimensions: {
    packageCount: number;
    largest: { length: number; width: number; height: number };
  };
}

/** Khe hở dưới ngưỡng này thì cảnh báo "Cần lưu ý". */
export const CLEARANCE_WARN_CM = 5;
const DISCLAIMER = 'Kết quả chỉ mang tính tham khảo';
const PASSAGE_NAMES: Record<PassageType, string> = {
  DOOR: 'Cửa',
  ELEVATOR: 'Thang máy',
  STAIRS: 'Cầu thang',
  HALLWAY: 'Hành lang',
};
const STATUS_RANK: Record<FitStatus, number> = { PASS: 0, CAUTION: 1, FAIL: 2 };

interface Fit {
  posture: Posture;
  clearance: number;
}

const sortDims = (box: Box): [number, number, number] =>
  [box.length, box.width, box.height].sort((x, y) => x - y) as [number, number, number];

/**
 * Qua lỗ mở: cạnh dài nhất đi theo hướng di chuyển, hai cạnh còn lại phải lọt tiết diện.
 * ponytail: chưa tính khúc quẹo hành lang/cầu thang (giới hạn chiều dài khi xoay góc), thêm khi
 * có số liệu chiều rộng hai nhánh lối đi.
 */
function fitOpening(box: Box, width: number, height: number): Fit | null {
  const [a, b] = sortDims(box);
  const [w, h] = [Math.min(width, height), Math.max(width, height)];
  if (a > w || b > h) return null;
  return { posture: 'FLAT', clearance: Math.min(w - a, h - b) };
}

/** Đặt thẳng trong cabin: thử mọi hoán vị, lấy cách có khe hở lớn nhất. */
function fitCabinStraight(box: Box, cabin: [number, number, number]): Fit | null {
  const [a, b, c] = sortDims(box);
  const orders: [number, number, number][] = [
    [a, b, c],
    [a, c, b],
    [b, a, c],
    [b, c, a],
    [c, a, b],
    [c, b, a],
  ];
  let best: Fit | null = null;
  for (const [x, y, z] of orders) {
    // cabin = [rộng, sâu, cao], z là cạnh dựng theo chiều cao.
    if (x > cabin[0] || y > cabin[1] || z > cabin[2]) continue;
    const clearance = Math.min(cabin[0] - x, cabin[1] - y, cabin[2] - z);
    if (!best || clearance > best.clearance) {
      best = { posture: z === c && c > Math.max(x, y) ? 'UPRIGHT' : 'FLAT', clearance };
    }
  }
  return best;
}

/**
 * Đặt nghiêng: cạnh dài c xoay góc θ trong một mặt phẳng của cabin (dày t), cạnh còn lại r nằm
 * theo chiều thứ ba. Quét θ mỗi 0.5° vì nghiệm giải tích rườm rà mà sai số này đủ cho tham khảo.
 */
function fitCabinTilted(box: Box, cabin: [number, number, number]): Fit | null {
  const [a, b, c] = sortDims(box);
  const [cw, cd, ch] = cabin;
  const planes: [number, number, number][] = [
    [cd, ch, cw],
    [cw, ch, cd],
    [cw, cd, ch],
  ];
  let best: Fit | null = null;
  for (const [p, q, third] of planes) {
    for (const [t, r] of [
      [a, b],
      [b, a],
    ] as const) {
      if (r > third) continue;
      for (let deg = 0; deg <= 90; deg += 0.5) {
        const rad = (deg * Math.PI) / 180;
        const x = c * Math.cos(rad) + t * Math.sin(rad);
        const y = c * Math.sin(rad) + t * Math.cos(rad);
        if (x > p || y > q) continue;
        const clearance = Math.min(p - x, q - y, third - r);
        if (!best || clearance > best.clearance) best = { posture: 'TILT', clearance };
      }
    }
  }
  return best;
}

function fitBox(box: Box, passage: Passage): Fit | null {
  const door = fitOpening(box, passage.width, passage.height);
  if (passage.type !== 'ELEVATOR' || !door) return door;

  const { cabinWidth, cabinLength, cabinHeight } = passage;
  if (!cabinWidth || !cabinLength || !cabinHeight) return door;
  const cabin: [number, number, number] = [cabinWidth, cabinLength, cabinHeight];
  const inCabin = fitCabinStraight(box, cabin) ?? fitCabinTilted(box, cabin);
  if (!inCabin) return null;
  return { posture: inCabin.posture, clearance: Math.min(door.clearance, inCabin.clearance) };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function checkPassage(
  boxes: Box[],
  passage: Passage,
  index: number,
  withLoad: boolean,
): PassageResult {
  const fits = boxes.map((box) => fitBox(box, passage));
  const passageLabel = passage.label?.trim() || PASSAGE_NAMES[passage.type];
  const base = { index, passageLabel, type: passage.type };

  const failed = boxes.filter((_, i) => !fits[i]);
  if (failed.length > 0) {
    const names = failed.map((b) => b.name ?? 'kiện hàng').join(', ');
    return {
      ...base,
      status: 'FAIL',
      posture: null,
      minClearanceCm: null,
      note: `Không lọt: ${names}`,
    };
  }

  const ok = fits as Fit[];
  const clearance = Math.min(...ok.map((f) => f.clearance));
  const tilted = ok.some((f) => f.posture === 'TILT');
  const posture: Posture = tilted
    ? 'TILT'
    : ok.some((f) => f.posture === 'UPRIGHT')
      ? 'UPRIGHT'
      : 'FLAT';
  const notes: string[] = [];
  let status: FitStatus = 'PASS';

  if (tilted) {
    status = 'CAUTION';
    notes.push('Thang máy chỉ vừa khi đặt kiện hàng nghiêng theo đường chéo cabin.');
  } else if (clearance < CLEARANCE_WARN_CM) {
    status = 'CAUTION';
    notes.push(`Khe hở dưới ${CLEARANCE_WARN_CM} cm, cần di chuyển cẩn thận.`);
  }

  if (withLoad && passage.type === 'ELEVATOR' && passage.loadCapacityKg) {
    const weights = boxes.map((b) => b.weight ?? 0);
    const total = weights.reduce((sum, w) => sum + w, 0);
    if (Math.max(...weights) > passage.loadCapacityKg) {
      return {
        ...base,
        status: 'FAIL',
        posture: null,
        minClearanceCm: null,
        note: 'Kiện hàng nặng hơn tải trọng thang máy.',
      };
    }
    if (total > passage.loadCapacityKg) {
      status = 'CAUTION';
      notes.push('Tổng cân nặng vượt tải trọng, cần chia nhiều chuyến.');
    }
  }

  return {
    ...base,
    status,
    posture,
    minClearanceCm: round1(clearance),
    note: notes.join(' ') || null,
  };
}

function worst(results: PassageResult[]): FitStatus {
  return results.reduce<FitStatus>(
    (acc, r) => (STATUS_RANK[r.status] > STATUS_RANK[acc] ? r.status : acc),
    'PASS',
  );
}

function runCheck(boxes: Box[], passages: Passage[], withLoad: boolean): CheckDetail {
  const details = passages.map((p, i) => checkPassage(boxes, p, i + 1, withLoad));
  return { fits: details.every((d) => d.status !== 'FAIL'), details };
}

/**
 * Thứ tự kiểm theo FR-24: (1) kiện nguyên qua mọi lối đi; (2) không qua thì kiểm từng bộ phận.
 * Bộ phận không có cân nặng riêng nên bước (2) bỏ qua tải trọng thang máy.
 */
export function checkFit(packages: Box[], parts: Box[], passages: Passage[]): FitCheckResult {
  const packageCheck = runCheck(packages, passages, true);
  const partCheck =
    !packageCheck.fits && parts.length > 0 ? runCheck(parts, passages, false) : null;

  let verdict: FitVerdict;
  let status: FitStatus;
  if (packageCheck.fits) {
    verdict = 'FITS_AS_PACKAGE';
    status = worst(packageCheck.details);
  } else if (partCheck?.fits) {
    verdict = 'FITS_BY_PARTS';
    status = 'CAUTION';
  } else {
    verdict = 'DOES_NOT_FIT';
    status = 'FAIL';
  }

  const totalWeightKg = packages.reduce((sum, p) => sum + (p.weight ?? 0), 0);
  const capacities = passages
    .filter((p) => p.type === 'ELEVATOR' && p.loadCapacityKg)
    .map((p) => p.loadCapacityKg as number);
  const capacityKg = capacities.length > 0 ? Math.min(...capacities) : null;

  const largest = packages.reduce((max, p) =>
    p.length * p.width * p.height > max.length * max.width * max.height ? p : max,
  );

  return {
    verdict,
    status,
    disclaimer: DISCLAIMER,
    packageCheck,
    partCheck,
    elevatorLoadCheck:
      capacityKg === null ? null : { fits: totalWeightKg <= capacityKg, totalWeightKg, capacityKg },
    usedDimensions: {
      packageCount: packages.length,
      largest: { length: largest.length, width: largest.width, height: largest.height },
    },
  };
}
