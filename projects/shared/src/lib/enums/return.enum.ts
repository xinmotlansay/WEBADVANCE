import type { OrderBadgeTone } from './order.enum';

export enum ReturnType {
  EXCHANGE = 'EXCHANGE',
  REFUND = 'REFUND',
}

export const RETURN_TYPE_LABEL: Record<ReturnType, string> = {
  [ReturnType.EXCHANGE]: 'Đổi hàng',
  [ReturnType.REFUND]: 'Trả hàng hoàn tiền',
};

export enum ReturnStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  AWAITING_GOODS = 'AWAITING_GOODS',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
}

export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  [ReturnStatus.PENDING]: 'Chờ xử lý',
  [ReturnStatus.CONFIRMED]: 'Đã xác nhận',
  [ReturnStatus.AWAITING_GOODS]: 'Chờ nhận hàng',
  [ReturnStatus.PROCESSING]: 'Đang xử lý',
  [ReturnStatus.COMPLETED]: 'Hoàn tất',
  [ReturnStatus.REJECTED]: 'Từ chối',
};

export const RETURN_STATUS_TONE: Record<ReturnStatus, OrderBadgeTone> = {
  [ReturnStatus.PENDING]: 'warning',
  [ReturnStatus.CONFIRMED]: 'info',
  [ReturnStatus.AWAITING_GOODS]: 'info',
  [ReturnStatus.PROCESSING]: 'info',
  [ReturnStatus.COMPLETED]: 'success',
  [ReturnStatus.REJECTED]: 'danger',
};

export enum ReturnCostBearer {
  CUSTOMER = 'CUSTOMER',
  SHOP = 'SHOP',
}

export const RETURN_COST_BEARER_LABEL: Record<ReturnCostBearer, string> = {
  [ReturnCostBearer.CUSTOMER]: 'Khách chịu phí',
  [ReturnCostBearer.SHOP]: 'CaraVeso chịu phí',
};

export enum InspectionResult {
  PASS = 'PASS',
  DAMAGED = 'DAMAGED',
  INCOMPLETE = 'INCOMPLETE',
}

export const INSPECTION_RESULT_LABEL: Record<InspectionResult, string> = {
  [InspectionResult.PASS]: 'Hàng nguyên vẹn',
  [InspectionResult.DAMAGED]: 'Hàng hư hỏng',
  [InspectionResult.INCOMPLETE]: 'Thiếu phụ kiện',
};
