export interface StoreInfo {
  name: string;
  logo: string;
  hotline: string;
  email: string;
  address: string;
  establishedDate: string;
  workingHours: { start: string; end: string; days: number[] };
}

export interface PublicConfig {
  store: StoreInfo;
  labels: { newDays: number };
}
