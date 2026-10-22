export interface StoreInfo {
  name: string;
  logo: string;
  hotline: string;
  email: string;
  address: string;
  establishedDate: string;
  workingHours: { start: string; end: string; days: number[] };
}

export type DeliverySlot = 'MORNING' | 'AFTERNOON';

export interface PaymentConfig {
  codEnabled: boolean;
  qrEnabled: boolean;
  qrExpireMinutes: number;
  depositThreshold: number;
  depositRate: number;
}

export interface ShippingConfig {
  tiers: { tier: number; fee: number }[];
  slots: { code: DeliverySlot; from: string; to: string }[];
  maxReschedule: number;
  scheduleMaxDaysAfterEstimate: number;
  leadDays: Record<string, number>;
  schedulableTiers: number[];
}

export interface PublicConfig {
  store: StoreInfo;
  payment: PaymentConfig;
  shipping: ShippingConfig;
  invoice: { vatRate: number };
  labels: { newDays: number };
}
