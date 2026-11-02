import { AppError } from '../../lib/app-error.js';
import { WarrantyStatus } from '../../lib/shared-enums.js';

const ALLOWED_NEXT: Record<WarrantyStatus, WarrantyStatus[]> = {
  [WarrantyStatus.PENDING_CONFIRMATION]: [WarrantyStatus.RECEIVED, WarrantyStatus.REJECTED],
  [WarrantyStatus.RECEIVED]: [WarrantyStatus.INSPECTING, WarrantyStatus.REJECTED],
  [WarrantyStatus.INSPECTING]: [WarrantyStatus.IN_WARRANTY, WarrantyStatus.REJECTED],
  [WarrantyStatus.IN_WARRANTY]: [WarrantyStatus.COMPLETED],
  [WarrantyStatus.COMPLETED]: [],
  [WarrantyStatus.REJECTED]: [],
};

export function assertWarrantyUpdateAllowed(from: WarrantyStatus, to: WarrantyStatus): void {
  if (from === to) return;

  const allowedNext = ALLOWED_NEXT[from];
  if (!allowedNext.includes(to)) {
    throw new AppError(
      'WARRANTY_INVALID_STATE',
      409,
      'Không thể chuyển trạng thái bảo hành theo bước này',
      { allowedNext },
    );
  }
}
