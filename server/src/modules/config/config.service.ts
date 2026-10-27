import { config } from '../../config/index.js';
import { SystemConfigModel } from './system-config.model.js';

export interface PaymentConfig {
  codEnabled: boolean;
  qrEnabled: boolean;
  qrExpireMinutes: number;
  depositThreshold: number;
  depositRate: number;
}

export interface ShippingConfig {
  tiers: { tier: number; fee: number }[];
  slots: { code: 'MORNING' | 'AFTERNOON'; from: string; to: string }[];
  maxReschedule: number;
  scheduleMaxDaysAfterEstimate: number;
  /** Số ngày làm việc chuẩn bị giao theo cấp (khóa là cấp 1–4). */
  leadDays: Record<string, number>;
  schedulableTiers: number[];
}

export interface InvoiceConfig {
  vatRate: number;
}

/** Tài khoản nhận tiền QR. Không trả ra `GET /config/public`. */
export interface BankAccountConfig {
  bankId: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export interface CheckoutConfig {
  payment: PaymentConfig;
  shipping: ShippingConfig;
  invoice: InvoiceConfig;
  bankAccount: BankAccountConfig;
}

/** Giá trị theo requirements mục 1.1, 1.2; `system_configs` ghi đè từng khóa nếu có. */
export const DEFAULT_CHECKOUT_CONFIG: CheckoutConfig = {
  payment: {
    codEnabled: true,
    qrEnabled: true,
    qrExpireMinutes: 15,
    depositThreshold: 20_000_000,
    depositRate: 0.3,
  },
  shipping: {
    tiers: [
      { tier: 1, fee: 30_000 },
      { tier: 2, fee: 80_000 },
      { tier: 3, fee: 250_000 },
      { tier: 4, fee: 450_000 },
    ],
    slots: [
      { code: 'MORNING', from: '08:00', to: '12:00' },
      { code: 'AFTERNOON', from: '13:00', to: '17:00' },
    ],
    maxReschedule: 2,
    scheduleMaxDaysAfterEstimate: 7,
    leadDays: { '1': 3, '2': 3, '3': 5, '4': 5 },
    schedulableTiers: [3, 4],
  },
  invoice: { vatRate: 0.1 },
  bankAccount: {
    bankId: 'VCB',
    bankName: 'Vietcombank',
    accountNumber: '',
    accountHolder: 'CARAVESO',
  },
};

const KEYS = {
  payment: 'payment',
  shipping: 'shipping',
  invoice: 'invoice',
  bankAccount: 'payment.bankAccount',
} as const;

export async function getCheckoutConfig(): Promise<CheckoutConfig> {
  const docs = await SystemConfigModel.find({ _id: { $in: Object.values(KEYS) } }).lean();
  const byKey = new Map(docs.map((d) => [d._id, d.value as object]));
  const d = DEFAULT_CHECKOUT_CONFIG;
  return {
    payment: { ...d.payment, ...byKey.get(KEYS.payment) },
    shipping: { ...d.shipping, ...byKey.get(KEYS.shipping) },
    invoice: { ...d.invoice, ...byKey.get(KEYS.invoice) },
    bankAccount: {
      ...d.bankAccount,
      ...byKey.get(KEYS.bankAccount),
      ...config.bankAccountOverride,
    },
  };
}
