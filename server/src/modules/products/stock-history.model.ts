import { Schema, model, type Types } from 'mongoose';

export type StockChangeType =
  'IMPORT' | 'SALE' | 'ORDER_CANCEL_RESTORE' | 'RETURN_RESTOCK' | 'STOCKTAKE' | 'ADJUSTMENT';

export interface StockHistoryDoc {
  _id: Types.ObjectId;
  variantId: Types.ObjectId;
  orderId?: Types.ObjectId;
  changeType: StockChangeType;
  quantityChange: number;
  quantityAfter: number;
  performedBy?: Types.ObjectId | null;
  note?: string;
  performedAt: Date;
}

const stockHistorySchema = new Schema<StockHistoryDoc>({
  variantId: { type: Schema.Types.ObjectId, ref: 'product_variants', required: true, index: true },
  orderId: { type: Schema.Types.ObjectId, ref: 'orders' },
  changeType: {
    type: String,
    required: true,
    enum: ['IMPORT', 'SALE', 'ORDER_CANCEL_RESTORE', 'RETURN_RESTOCK', 'STOCKTAKE', 'ADJUSTMENT'],
  },
  quantityChange: { type: Number, required: true },
  quantityAfter: { type: Number, required: true },
  performedBy: { type: Schema.Types.ObjectId, ref: 'users', default: null },
  note: String,
  performedAt: { type: Date, required: true, default: Date.now },
});

export const StockHistoryModel = model<StockHistoryDoc>('stock_histories', stockHistorySchema);
