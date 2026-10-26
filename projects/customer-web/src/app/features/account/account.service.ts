import { Injectable, signal } from '@angular/core';

export interface CustomerProfile {
  name: string;
  birthday: string;
  gender: string;
  phone: string;
  email: string;
  avatar: string;
  birthDateEditCount?: number;
  hasPassword?: boolean;
}

export interface CustomerAddress {
  id: number;
  recipient: string;
  detail: string;
  phone: string;
  label: string;
  isDefault: boolean;
}

export interface AccountOrder {
  id: string;
  date: string;
  status: string;
  total: number;
  delivered: boolean;
  items?: { name: string; details: string; quantity: number; total: number }[];
  history?: { status: string; date: string }[];
}

export interface AccountProduct {
  id: number;
  name: string;
  details: string;
  price: number;
  image: string;
}

export interface CustomerVoucher {
  id?: string;
  code: string;
  title: string;
  value: string;
  condition: string;
  expiry: string;
  status: 'Có thể sử dụng' | 'Sắp hết hạn' | 'Đã sử dụng' | 'Hết hạn';
}

export interface HomeProfile {
  id: number;
  name: string;
  address: string;
  doorWidth: number;
  doorHeight: number;
  hallwayWidth: number;
  elevatorWidth: number;
  elevatorDepth: number;
  elevatorLoad: number;
  isDefault: boolean;
}

const sofaImage = 'https://images.pexels.com/photos/276534/pexels-photo-276534.jpeg?auto=compress&cs=tinysrgb&w=700';

@Injectable({ providedIn: 'root' })
export class AccountService {
  readonly profile = signal<CustomerProfile>({
    name: 'Hoàng Huy Tiên',
    birthday: '2006-09-08',
    gender: 'Nam',
    phone: '0919 012 176',
    email: 'tienhk24411@st.uel.edu.vn',
    avatar: '',
  });

  readonly addresses = signal<CustomerAddress[]>([
    {
      id: 1,
      recipient: 'Anh Tinh Lagi',
      detail: 'Số 18, đường Hoàng Diệu, Phường Tân An, thị xã LaGi, tỉnh Bình Thuận',
      phone: '0919 120 176',
      label: 'Nhà riêng',
      isDefault: true,
    },
  ]);

  readonly orders = signal<AccountOrder[]>([
    { id: '#11032006', date: '08/09/2026', status: 'Chờ xác nhận', total: 4_800_000, delivered: false },
    { id: '#11032026', date: '08/09/2026', status: 'Giao hàng thành công', total: 4_800_000, delivered: true },
  ]);

  readonly products = signal<AccountProduct[]>(
    Array.from({ length: 8 }, (_, index) => ({
      id: index + 1,
      name: 'Nệm Kymdan - CV07',
      details: 'Êm ái, thoải mái, thoáng khí, cao su non, 1.6×2m',
      price: 18_500_000,
      image: sofaImage,
    })),
  );

  readonly vouchers = signal<CustomerVoucher[]>([
    { code: 'WELCOME100', title: 'Ưu đãi khách hàng mới', value: '100.000 VNĐ', condition: 'Đơn hàng từ 1.000.000 VNĐ', expiry: '31/12/2026', status: 'Có thể sử dụng' },
    { code: 'HOME10', title: 'Ưu đãi không gian sống', value: 'Giảm 10%', condition: 'Đơn hàng từ 5.000.000 VNĐ · Tối đa 500.000 VNĐ', expiry: '15/11/2026', status: 'Có thể sử dụng' },
    { code: 'SHIPFREE', title: 'Miễn phí vận chuyển', value: 'Tối đa 200.000 VNĐ', condition: 'Áp dụng cho đơn hàng đủ điều kiện', expiry: '25/10/2026', status: 'Sắp hết hạn' },
    { code: 'SUMMER20', title: 'Ưu đãi mùa hè', value: 'Giảm 20%', condition: 'Đơn hàng từ 2.000.000 VNĐ', expiry: '15/08/2026', status: 'Đã sử dụng' },
  ]);

  readonly homeProfiles = signal<HomeProfile[]>([
    {
      id: 1,
      name: 'Nhà riêng',
      address: 'Phường Tân An, thị xã LaGi, tỉnh Bình Thuận',
      doorWidth: 90,
      doorHeight: 210,
      hallwayWidth: 120,
      elevatorWidth: 140,
      elevatorDepth: 140,
      elevatorLoad: 450,
      isDefault: true,
    },
  ]);

  saveProfile(profile: CustomerProfile): void {
    this.profile.set({ ...profile });
  }

  saveAddress(address: Omit<CustomerAddress, 'id'>, id?: number): void {
    this.addresses.update((addresses) => {
      const nextAddresses = address.isDefault
        ? addresses.map((item) => ({ ...item, isDefault: false }))
        : addresses;
      if (id !== undefined) {
        return nextAddresses.map((item) => (item.id === id ? { ...address, id } : item));
      }
      const nextId = Math.max(0, ...nextAddresses.map((item) => item.id)) + 1;
      return [...nextAddresses, { ...address, id: nextId }];
    });
  }

  setDefaultAddress(id: number): void {
    this.addresses.update((addresses) => addresses.map((item) => ({ ...item, isDefault: item.id === id })));
  }

  deleteAddress(id: number): void {
    this.addresses.update((addresses) => addresses.filter((item) => item.id !== id));
  }

  removeFavorite(id: number): void {
    this.products.update((products) => products.filter((product) => product.id !== id));
  }

  saveHomeProfile(profile: Omit<HomeProfile, 'id'>, id?: number): void {
    this.homeProfiles.update((profiles) => {
      const nextProfiles = profile.isDefault
        ? profiles.map((item) => ({ ...item, isDefault: false }))
        : profiles;
      if (id !== undefined) {
        return nextProfiles.map((item) => (item.id === id ? { ...profile, id } : item));
      }
      const nextId = Math.max(0, ...nextProfiles.map((item) => item.id)) + 1;
      return [...nextProfiles, { ...profile, id: nextId }];
    });
  }

  setDefaultHomeProfile(id: number): void {
    this.homeProfiles.update((profiles) => profiles.map((item) => ({ ...item, isDefault: item.id === id })));
  }

  removeHomeProfile(id: number): void {
    this.homeProfiles.update((profiles) => profiles.filter((item) => item.id !== id));
  }
}
