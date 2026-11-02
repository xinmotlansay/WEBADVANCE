import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import {
  ReconciliationStatus,
  RefundStatus,
  TransactionType,
} from '../../lib/shared-enums.js';

export interface RefundAccountDoc {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export interface PaymentTransactionDoc {
  _id: Types.ObjectId;
  orderId?: Types.ObjectId | null;
  returnRequestId?: Types.ObjectId | null;
  type: TransactionType;
  amount: number;
  recordSource: 'AUTO' | 'MANUAL';
  bankTransactionCode?: string | null;
  receivedContent?: string | null;
  reconciliationStatus: ReconciliationStatus;
  status: RefundStatus;
  note?: string | null;
  handledById?: Types.ObjectId | null;
  handledByName?: string | null;
  transactionAt: Date;
  refundAccount?: RefundAccountDoc | null;
  createdAt: Date;
  updatedAt: Date;
}

const refundAccountSchema = new Schema<RefundAccountDoc>(
  {
    bankName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    accountHolder: { type: String, required: true },
  },
  { _id: false },
);

const paymentTransactionSchema = new Schema<PaymentTransactionDoc>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
    returnRequestId: { type: Schema.Types.ObjectId, ref: 'ReturnRequest', default: null },
    type: { type: String, enum: Object.values(TransactionType), required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    recordSource: { type: String, enum: ['AUTO', 'MANUAL'], default: 'AUTO' },
    bankTransactionCode: { type: String, default: null },
    receivedContent: { type: String, default: null },
    reconciliationStatus: {
      type: String,
      enum: Object.values(ReconciliationStatus),
      default: ReconciliationStatus.MATCHED,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(RefundStatus),
      default: RefundStatus.COMPLETED,
      index: true,
    },
    note: { type: String, default: null },
    handledById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    handledByName: { type: String, default: null },
    transactionAt: { type: Date, required: true, index: true },
    refundAccount: { type: refundAccountSchema, default: null },
  },
  { timestamps: true, collection: 'payment_transactions' },
);

// Mã giao dịch ngân hàng không được xử lý hai lần.
paymentTransactionSchema.index(
  { bankTransactionCode: 1 },
  { unique: true, partialFilterExpression: { bankTransactionCode: { $type: 'string' } } },
);
paymentTransactionSchema.index({ reconciliationStatus: 1, transactionAt: -1 });
paymentTransactionSchema.index(
  { returnRequestId: 1 },
  { unique: true, partialFilterExpression: { returnRequestId: { $type: 'objectId' } } },
);

export type PaymentTransactionDocument = HydratedDocument<PaymentTransactionDoc>;
export const PaymentTransactionModel = model<PaymentTransactionDoc>(
  'PaymentTransaction',
  paymentTransactionSchema,
);
