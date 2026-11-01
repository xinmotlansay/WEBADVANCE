import type {
  InspectionResult,
  ReturnCostBearer,
  ReturnStatus,
  ReturnType,
} from '../enums/return.enum';

export interface ReturnRequestItem {
  orderItemId: string;
  name: string;
  sku: string;
  quantity: number;
  finalAmount: number;
  reason: string;
  evidence: string[];
}

export interface ReturnRequest {
  id: string;
  code: string;
  orderId: string;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  type: ReturnType;
  status: ReturnStatus;
  items: ReturnRequestItem[];
  requestedAt: string;
  costBearer: ReturnCostBearer;
  returnFee: number;
  pickupSchedule?: string | null;
  trackingCode?: string | null;
  inspectionResult?: InspectionResult | null;
  replacement?: {
    productName: string;
    sku: string;
    quantity: number;
    differenceAmount: number;
    trackingCode?: string | null;
    deliveredAt?: string | null;
  } | null;
  refund?: {
    amount: number;
    proofImage?: string | null;
    transactionAt?: string | null;
    completed: boolean;
  } | null;
  rejectReason?: string | null;
  note?: string | null;
}

export interface ReturnListQuery {
  status?: ReturnStatus | 'ALL';
  type?: ReturnType | 'ALL';
  q?: string;
  page?: number;
  limit?: number;
}

export interface RejectReturnRequest {
  rejectReason: string;
}

export interface UpdateReturnRequest {
  costBearer?: ReturnCostBearer;
  returnFee?: number;
  pickupSchedule?: string | null;
  trackingCode?: string | null;
  replacement?: {
    sku: string;
    quantity: number;
    trackingCode: string;
  };
}

export interface ReceiveReturnRequest {
  inspectionResult: InspectionResult;
  note?: string;
}

export interface RefundReturnRequest {
  proofImage: string;
  transactionAt: string;
  amount?: number;
}
