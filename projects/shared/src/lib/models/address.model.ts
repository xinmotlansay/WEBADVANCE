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
}

export type CreateAddressRequest = Omit<Address, 'id' | 'district' | 'isDefault'> & {
  district?: string;
  isDefault?: boolean;
};

export type UpdateAddressRequest = Partial<CreateAddressRequest>;
