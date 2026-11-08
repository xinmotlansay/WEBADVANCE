import type { FitPassageResult, FitPosture, FitStatus, PassageType, WalkwayPassage } from 'shared';
import type { IconName } from '../../shared/ui/icons/icon.component';

export const PASSAGE_TYPE_NAMES: Record<PassageType, string> = {
  DOOR: 'Cửa ra vào',
  ELEVATOR: 'Thang máy',
  STAIRS: 'Cầu thang',
  HALLWAY: 'Hành lang',
};

export const STATUS_NAMES: Record<FitStatus, string> = {
  PASS: 'Qua được',
  CAUTION: 'Cần lưu ý',
  FAIL: 'Không vừa',
};

export const STATUS_MESSAGES: Record<FitStatus, string> = {
  PASS: 'Sản phẩm có thể vận chuyển qua tất cả các điểm lối đi bạn đã nhập.',
  CAUTION:
    'Kết quả mang tính tham khảo dựa trên số đo bạn cung cấp. Với sản phẩm "Cần lưu ý" vui lòng cân nhắc kiểm tra kích thước thực tế.',
  FAIL: 'Sản phẩm không thể vận chuyển qua ít nhất một điểm lối đi. Bạn có thể tham khảo các sản phẩm tương tự bên dưới.',
};

export const POSTURE_NAMES: Record<FitPosture, string> = {
  FLAT: 'Nằm ngang',
  UPRIGHT: 'Dựng đứng',
  TILT: 'Đặt nghiêng',
};

/** Cách đưa kiện lớn nhất qua lối đi theo tư thế server tính được. */
export const POSTURE_ADVICE: Record<FitPosture, string> = {
  FLAT: 'đặt nằm ngang, đưa đầu dài vào trước',
  UPRIGHT: 'dựng đứng, để cạnh dài hướng lên trên',
  TILT: 'đặt nghiêng chéo để lách qua',
};

/** Dòng mô tả ngắn của một điểm lối đi, ví dụ "Cửa ra vào ~ 90 × 210cm". */
export function describePassage(p: WalkwayPassage): string {
  const opening = `${p.width} × ${p.height}cm`;
  if (p.type !== 'ELEVATOR') return `${PASSAGE_TYPE_NAMES[p.type]} ~ ${opening}`;
  const cabin = `cabin ${p.cabinWidth} × ${p.cabinLength} × ${p.cabinHeight}cm`;
  const load = p.loadCapacityKg ? `, ${p.loadCapacityKg}kg` : '';
  return `Thang máy ~ cửa ${opening}, ${cabin}${load}`;
}

export const TYPE_ICONS: Record<PassageType, IconName> = {
  DOOR: 'lucide:door-open',
  ELEVATOR: 'local:elevator',
  STAIRS: 'local:stairs',
  HALLWAY: 'lucide:move-horizontal',
};

export const STATUS_ICONS: Record<FitStatus, IconName> = {
  PASS: 'lucide:check',
  CAUTION: 'lucide:triangle-alert',
  FAIL: 'lucide:x',
};

const formatCm = (cm: number): string => String(Math.round(cm * 10) / 10);

/** Câu ngắn dưới mỗi điểm trên hành trình, ví dụ "Dư 50 cm". */
export function clearanceLabel(stop: Pick<FitPassageResult, 'status' | 'minClearanceCm'>): string {
  if (stop.status === 'FAIL') return 'Không lọt';
  if (stop.minClearanceCm === null) return '—';
  const cm = formatCm(stop.minClearanceCm);
  return stop.status === 'CAUTION' ? `Sát ${cm} cm` : `Dư ${cm} cm`;
}
