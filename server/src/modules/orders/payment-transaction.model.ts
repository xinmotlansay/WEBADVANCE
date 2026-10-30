import { Schema, model, type Types } from 'mongoose';

export type TransactionType =
  'DEPOSIT' | 'FULL_PAYMENT' | 'COD_COLLECTION' | 'DIFFERENCE_COLLECTION' | 'REFUND';

export type ReconciliationStatus =
  'MATCHED' | 'WRONG_CONTENT' | 'UNDERPAID' | 'OVERPAID' | 'LATE' | 'MANUALLY_RESOLVED';

export interface RefundAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export interface PaymentTransactionDoc {
  _id: Types.ObjectId;
  orderId: Types.ObjectId | null;
  returnRequestId?: Types.ObjectId | null;
  type: TransactionType;
  amount: number;
  recordSource: 'AUTO' | 'MANUAL';
  bankTransactionCode?: string;
  receivedContent?: string;
  reconciliationStatus?: ReconciliationStatus;
  status?: 'PENDING' | 'COMPLETED' | 'FAILED';
  refundAccount?: RefundAccount;
  proofImage?: string;
  note?: string;
  handledBy?: Types.ObjectId | null;
  transactionAt?: Date;
}

const paymentTransactionSchema = new Schema<PaymentTransactionDoc>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'orders', default: null, index: true },
    returnRequestId: { type: Schema.Types.ObjectId, ref: 'return_requests', default: null },
    type: {
      type: String,
      required: true,
      enum: ['DEPOSIT', 'FULL_PAYMENT', 'COD_COLLECTION', 'DIFFERENCE_COLLECTION', 'REFUND'],
    },
    amount: { type: Number, required: true },
    recordSource: { type: String, required: true, enum: ['AUTO', 'MANUAL'] },
    bankTransactionCode: String,
    receivedContent: String,
    reconciliationStatus: {
      type: String,
      enum: ['MATCHED', 'WRONG_CONTENT', 'UNDERPAID', 'OVERPAID', 'LATE', 'MANUALLY_RESOLVED'],
    },
    status: { type: String, enum: ['PENDING', 'COMPLETED', 'FAILED'] },
    refundAccount: { bankName: String, accountNumber: String, accountHolder: String },
    proofImage: String,
    note: String,
    handledBy: { type: Schema.Types.ObjectId, ref: 'users', default: null },
    transactionAt: Date,
  },
  { timestamps: true },
);

// Webhook ngân hàng chỉ xử lý một lần mỗi giao dịch.
paymentTransactionSchema.index(
  { bankTransactionCode: 1 },
  { unique: true, partialFilterExpression: { bankTransactionCode: { $type: 'string' } } },
);

export const PaymentTransactionModel = model<PaymentTransactionDoc>(
  'payment_transactions',
  paymentTransactionSchema,
);
