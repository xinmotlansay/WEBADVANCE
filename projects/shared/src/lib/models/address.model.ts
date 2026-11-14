/** Địa chỉ giao hàng trong sổ địa chỉ (FR-08). */
export interface Address {
  id: string;
  recipientName: string;
  recipientPhone: string;
  addressLine: string;
  ward: string;
  district: string | null;
  province: string;
  isDefault: boolean;
  latitude: number | null;
  longitude: number | null;
}

export type CreateAddressRequest = Omit<Address, 'id' | 'district' | 'isDefault' | 'latitude' | 'longitude'> & {
  district?: string;
  isDefault?: boolean;
  latitude?: number | null;
  longitude?: number | null;
};

export type UpdateAddressRequest = Partial<Omit<Address, 'id'>>;
