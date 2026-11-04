export interface Contact {
  name: string;
  phone: string;
  email?: string;
  address: string;
}
export interface TimelineEntry {
  status: string;
  at: string;
  note?: string;
}
export interface WarrantyCard {
  id: string;
  orderId: string;
  orderCode: string;
  productName: string;
  variantLabel?: string;
  thumbnail?: string;
  serialNumber: string;
  quantity: number;
  warrantyMonths: number;
  activatedAt: string;
  expiresAt: string;
  status: 'VALID' | 'EXPIRED' | 'VOID';
  remainingDays: number;
}
export interface WarrantySubmission {
  warrantyCardId: string;
  defectType?: string;
  defectDescription: string;
  evidence: string[];
  contact: Contact;
}
export interface AfterSalesRequest {
  id: string;
  /** Mã yêu cầu hiển thị cho khách (BH-... hoặc RT-...). */
  code?: string;
  status: string;
  productName: string;
  requestedAt: string;
  evidence: string[];
  timeline: TimelineEntry[];
  contact: Contact;
  rejectReason?: string;
  inspectionResult?: string;
  resolution?: string;
  defectDescription?: string;
  description?: string;
  canCancel?: boolean;
  quantity?: number;
  type?: 'RETURN' | 'EXCHANGE';
  refundAmount?: number;
  refundAccount?: RefundAccount;
}
export interface RefundAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}
export interface ReturnSubmission {
  orderId: string;
  orderItemId: string;
  quantity: number;
  type: 'RETURN' | 'EXCHANGE';
  reason: string;
  description: string;
  evidence: string[];
  contact: Contact;
  refundAccount?: RefundAccount;
  replacementVariantId?: string;
}
export interface OrderSummary {
  id: string;
  orderCode: string;
  status: string;
  createdAt: string;
  totalAmount: number;
}
export interface EligibleOrder {
  id: string;
  orderCode: string;
  status: string;
  actualDeliveryDate: string | null;
  returnDeadline: string | null;
  items: {
    id: string;
    name: string;
    variantLabel?: string;
    thumbnail?: string;
    quantity: number;
    unitPrice?: number;
    returnableQuantity: number;
    actions: { canReturn: boolean };
  }[];
}
