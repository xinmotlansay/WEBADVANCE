import type {
  WarrantyInspectionResult,
  WarrantyResolution,
  WarrantyStatus,
} from '../enums/warranty.enum';

export interface WarrantyHistoryEntry {
  at: string;
  status: WarrantyStatus;
  note?: string | null;
}

export interface WarrantyRequest {
  id: string;
  code: string;
  orderId: string;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  sku: string;
  purchasedAt: string;
  warrantyMonths: number;
  expiresAt: string;
  status: WarrantyStatus;
  condition: string;
  reason: string;
  evidence: string[];
  requestedAt: string;
  homeServiceSchedule?: string | null;
  trackingCode?: string | null;
  inspectionResult?: WarrantyInspectionResult | null;
  resolution?: WarrantyResolution | null;
  rejectReason?: string | null;
  dataIntegrityWarning?: string | null;
  history: WarrantyHistoryEntry[];
}

export interface WarrantyListQuery {
  status?: WarrantyStatus | 'ALL';
  q?: string;
  page?: number;
  limit?: number;
}

export interface UpdateWarrantyStatusRequest {
  status: WarrantyStatus;
  inspectionResult?: WarrantyInspectionResult;
  resolution?: WarrantyResolution;
  homeServiceSchedule?: string | null;
  trackingCode?: string | null;
  note?: string;
}

export interface RejectWarrantyRequest {
  rejectReason: string;
}
