import type { OrderBadgeTone } from './order.enum';

export enum WarrantyStatus {
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
  RECEIVED = 'RECEIVED',
  INSPECTING = 'INSPECTING',
  IN_WARRANTY = 'IN_WARRANTY',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
}

export const WARRANTY_STATUS_LABEL: Record<WarrantyStatus, string> = {
  [WarrantyStatus.PENDING_CONFIRMATION]: 'Chờ xác nhận',
  [WarrantyStatus.RECEIVED]: 'Đã tiếp nhận',
  [WarrantyStatus.INSPECTING]: 'Đang kiểm tra',
  [WarrantyStatus.IN_WARRANTY]: 'Đang bảo hành',
  [WarrantyStatus.COMPLETED]: 'Hoàn tất',
  [WarrantyStatus.REJECTED]: 'Từ chối',
};

export const WARRANTY_STATUS_TONE: Record<WarrantyStatus, OrderBadgeTone> = {
  [WarrantyStatus.PENDING_CONFIRMATION]: 'warning',
  [WarrantyStatus.RECEIVED]: 'info',
  [WarrantyStatus.INSPECTING]: 'info',
  [WarrantyStatus.IN_WARRANTY]: 'info',
  [WarrantyStatus.COMPLETED]: 'success',
  [WarrantyStatus.REJECTED]: 'danger',
};

export enum WarrantyResolution {
  REPAIRED = 'REPAIRED',
  PART_REPLACED = 'PART_REPLACED',
  PRODUCT_REPLACED = 'PRODUCT_REPLACED',
  NOT_ELIGIBLE = 'NOT_ELIGIBLE',
}

export const WARRANTY_RESOLUTION_LABEL: Record<WarrantyResolution, string> = {
  [WarrantyResolution.REPAIRED]: 'Sửa chữa',
  [WarrantyResolution.PART_REPLACED]: 'Thay linh kiện',
  [WarrantyResolution.PRODUCT_REPLACED]: 'Đổi sản phẩm',
  [WarrantyResolution.NOT_ELIGIBLE]: 'Không đủ điều kiện',
};

export enum WarrantyInspectionResult {
  UNDER_REPAIR = 'UNDER_REPAIR',
  NEEDS_PARTS = 'NEEDS_PARTS',
  NO_ISSUE = 'NO_ISSUE',
  OUT_OF_SCOPE = 'OUT_OF_SCOPE',
}

export const WARRANTY_INSPECTION_LABEL: Record<WarrantyInspectionResult, string> = {
  [WarrantyInspectionResult.UNDER_REPAIR]: 'Cần sửa chữa',
  [WarrantyInspectionResult.NEEDS_PARTS]: 'Chờ linh kiện',
  [WarrantyInspectionResult.NO_ISSUE]: 'Không phát hiện lỗi',
  [WarrantyInspectionResult.OUT_OF_SCOPE]: 'Ngoài phạm vi bảo hành',
};

export enum LateCompensationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export const LATE_COMPENSATION_LABEL: Record<LateCompensationStatus, string> = {
  [LateCompensationStatus.PENDING]: 'Chờ duyệt',
  [LateCompensationStatus.APPROVED]: 'Đã duyệt',
  [LateCompensationStatus.REJECTED]: 'Đã từ chối',
};
