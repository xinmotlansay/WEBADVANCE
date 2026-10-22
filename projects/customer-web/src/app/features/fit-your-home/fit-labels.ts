import type { FitPosture, FitStatus, PassageType, WalkwayPassage } from 'shared';

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

/** Dòng mô tả ngắn của một điểm lối đi, ví dụ "Cửa ra vào ~ 90 × 210cm". */
export function describePassage(p: WalkwayPassage): string {
  const opening = `${p.width} × ${p.height}cm`;
  if (p.type !== 'ELEVATOR') return `${PASSAGE_TYPE_NAMES[p.type]} ~ ${opening}`;
  const cabin = `cabin ${p.cabinWidth} × ${p.cabinLength} × ${p.cabinHeight}cm`;
  const load = p.loadCapacityKg ? `, ${p.loadCapacityKg}kg` : '';
  return `Thang máy ~ cửa ${opening}, ${cabin}${load}`;
}
