export interface StoreInfo {
  name: string;
  logo: string;
  hotline: string;
  email: string;
  address: string;
  /** Link Google Maps của trụ sở; để trống thì giao diện tự tạo link tìm kiếm từ địa chỉ. */
  mapUrl?: string;
  establishedDate: string;
  copyright: string;
  social: { facebook: string; youtube: string; tiktok: string; instagram: string };
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
  policy?: { returnDays: number; refundDaysMin: number; refundDaysMax: number };
  limits?: { maxImageSizeMb: number };
  store: StoreInfo;
  payment: PaymentConfig;
  shipping: ShippingConfig;
  invoice: { vatRate: number };
  labels: { newDays: number };
  /** Tích hợp bản đồ phía client (địa chỉ nhận hàng). */
  maps?: { googleMapsApiKey: string | null };
}
