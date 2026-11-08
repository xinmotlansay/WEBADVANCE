import type { OrderStatus } from '../enums/order.enum';
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
    /** Phí giao hàng sản phẩm thay thế khi khách chịu phí (đổi ý), theo cấp vận chuyển. */
    deliveryFee?: number;
    /** Số tiền khách trả COD khi nhận hàng đổi. */
    collectAmount?: number;
    trackingCode?: string | null;
    deliveredAt?: string | null;
  } | null;
  /** Đơn hàng mới tạo khi hoàn tất đổi hàng. */
  exchangeOrder?: { id: string; orderCode: string; status: OrderStatus } | null;
  refund?: {
    amount: number;
    proofImage?: string | null;
    transactionAt?: string | null;
    completed: boolean;
  } | null;
  rejectReason?: string | null;
  note?: string | null;
  /** Tài khoản nhận hoàn tiền khách nhập (đủ số tài khoản, chỉ dành cho admin). */
  refundAccount?: { bankName: string; accountNumber: string; accountHolder: string } | null;
  contact?: { name: string; phone: string; address: string } | null;
  history: { at: string; status: string; note?: string | null }[];
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
  /** Giao đúng sản phẩm khách đã chọn; bỏ trống `trackingCode` thì hệ thống tự tạo. `sku`/`quantity` chỉ khi đổi sang sản phẩm khác. */
  replacement?: {
    trackingCode?: string;
    sku?: string;
    quantity?: number;
  };
}

export interface ReceiveReturnRequest {
  inspectionResult: InspectionResult;
  note?: string;
}

/** Duyệt hoàn tiền sau khi hàng trả về đạt kiểm tra; khoản hoàn chuyển sang Thanh toán & đối soát. */
export interface ApproveRefundRequest {
  /** Bỏ trống thì hoàn tối đa theo giá trị sản phẩm trừ phí khách chịu. */
  amount?: number;
  note?: string;
}

export interface RefundReturnRequest {
  proofImage: string;
  transactionAt: string;
  amount?: number;
}
