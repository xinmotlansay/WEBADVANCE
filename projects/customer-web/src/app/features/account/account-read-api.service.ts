import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { map, Observable, tap } from 'rxjs';
import { API_BASE_URL, apiAssetUrl } from '../../core/api/api-url';
import { CustomerProfile } from './account.service';

export interface MongoCustomerAddress {
  _id: string;
  recipientName?: string;
  recipientPhone?: string;
  addressLine?: string;
  ward?: string;
  province?: string;
  isDefault?: boolean;
}

export interface MongoCustomerOrder {
  _id: string;
  orderCode?: string;
  status?: string;
  totalAmount?: number;
  createdAt?: string;
  items?: {
    snapshot?: {
      name?: string;
      sku?: string;
      color?: string;
      dimensions?: string;
    };
    quantity?: number;
    unitPrice?: number;
    finalAmount?: number;
  }[];
  statusHistory?: { toStatus?: string; changedAt?: string }[];
}

export interface MongoCustomerVoucher {
  _id: string;
  status?: string;
  receivedAt?: string;
  expiresAt?: string;
  voucher?: {
    code?: string;
    name?: string;
    status?: string;
    discountType?: string;
    discountValue?: number;
    maxDiscountValue?: number;
    endDate?: string;
    scope?: string[];
  } | null;
}

interface MongoCustomerDocument {
  email?: string;
  phoneNumber?: string;
  phone?: string;
  avatar?: string;
  fullName?: string;
  name?: string;
  gender?: string;
  profile?: {
    fullName?: string;
    dateOfBirth?: string;
    gender?: string;
  };
}

@Injectable({ providedIn: 'root' })
export class AccountReadApiService {
  private readonly previewUserKey = 'caraveso.previewCustomerId';
  readonly profile = signal<CustomerProfile | null>(null);

  constructor(private readonly http: HttpClient) {}

  getPreviewUserId(): string {
    return sessionStorage.getItem(this.previewUserKey) ?? '';
  }

  setPreviewUserId(id: string): void {
    sessionStorage.setItem(this.previewUserKey, id);
    this.profile.set(null);
  }

  getProfile(userId: string): Observable<CustomerProfile> {
    return this.http.get<MongoCustomerDocument>(`${API_BASE_URL}/users/${encodeURIComponent(userId)}`).pipe(
      map((user) => {
        const birthdayValue = user.profile?.dateOfBirth;
        const parsedBirthday = birthdayValue ? new Date(birthdayValue) : null;
        const birthday = parsedBirthday && !Number.isNaN(parsedBirthday.getTime())
          ? parsedBirthday.toISOString().slice(0, 10)
          : '';

        return {
          name: user.profile?.fullName ?? user.fullName ?? user.name ?? '',
          birthday,
          gender: user.profile?.gender ?? user.gender ?? '',
          phone: user.phoneNumber ?? user.phone ?? '',
          email: user.email ?? '',
          avatar: user.avatar ? apiAssetUrl(user.avatar) : '',
        };
      }),
      tap((profile) => this.profile.set(profile)),
    );
  }

  getAddresses(userId: string): Observable<MongoCustomerAddress[]> {
    return this.http.get<MongoCustomerAddress[]>(
      `${API_BASE_URL}/users/${encodeURIComponent(userId)}/addresses`,
    );
  }

  getOrders(userId: string): Observable<MongoCustomerOrder[]> {
    return this.http.get<MongoCustomerOrder[]>(
      `${API_BASE_URL}/users/${encodeURIComponent(userId)}/orders`,
    );
  }

  getVouchers(userId: string): Observable<MongoCustomerVoucher[]> {
    return this.http.get<MongoCustomerVoucher[]>(
      `${API_BASE_URL}/users/${encodeURIComponent(userId)}/vouchers`,
    );
  }
}
