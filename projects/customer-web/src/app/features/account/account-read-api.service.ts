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
  district?: string;
  province?: string;
  isDefault?: boolean;
}

export interface MongoReviewableItem {
  orderId: string;
  orderItemId: string;
  orderCode: string;
  deliveredAt: string;
  productId: string | null;
  name: string;
  color: string;
  sku: string;
}

export interface MongoCustomerReview extends MongoReviewableItem {
  _id: string;
  rating: number;
  comment: string;
  images: string[];
  createdAt: string;
}

export interface MongoWarrantyCard {
  _id: string;
  orderId?: string;
  orderItemId?: string;
  serialNumber?: string;
  expiresAt?: string;
}

export interface MongoAftersalesRequest {
  _id: string;
  type: 'WARRANTY' | 'RETURN' | 'EXCHANGE';
  orderCode: string;
  name: string;
  color: string;
  reason: string;
  description: string;
  evidence: string[];
  status: string;
  requestedAt: string;
}

export interface MongoCustomerOrder {
  _id: string;
  orderCode?: string;
  status?: string;
  totalAmount?: number;
  createdAt?: string;
  items?: {
    _id?: string;
    variantId?: string;
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
  readonly previewUserId = signal('');

  constructor(private readonly http: HttpClient) {}

  getPreviewUserId(): string {
    const id = sessionStorage.getItem(this.previewUserKey) ?? '';
    if (id !== this.previewUserId()) this.previewUserId.set(id);
    return id;
  }

  setPreviewUserId(id: string): void {
    sessionStorage.setItem(this.previewUserKey, id);
    this.previewUserId.set(id);
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
          gender: this.toGenderLabel(user.profile?.gender ?? user.gender ?? ''),
          phone: user.phoneNumber ?? user.phone ?? '',
          email: user.email ?? '',
          avatar: user.avatar ? apiAssetUrl(user.avatar) : '',
        };
      }),
      tap((profile) => this.profile.set(profile)),
    );
  }

  private toGenderLabel(value: string): string {
    switch (value.toUpperCase()) {
      case 'MALE':
      case 'NAM':
        return 'Nam';
      case 'FEMALE':
      case 'NỮ':
        return 'Nữ';
      case 'OTHER':
      case 'KHÁC':
        return 'Khác';
      default:
        return '';
    }
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

  saveGender(userId: string, gender: string): Observable<{ gender: string }> {
    return this.http.post<{ gender: string }>(
      `${API_BASE_URL}/users/${encodeURIComponent(userId)}/profile`,
      { gender },
    );
  }

  createAddress(
    userId: string,
    address: Omit<MongoCustomerAddress, '_id'> & { district: string },
  ): Observable<MongoCustomerAddress> {
    return this.http.post<MongoCustomerAddress>(
      `${API_BASE_URL}/users/${encodeURIComponent(userId)}/addresses`,
      address,
    );
  }

  updateAddress(
    userId: string,
    addressId: string,
    address: Omit<MongoCustomerAddress, '_id'> & { district: string },
  ): Observable<MongoCustomerAddress> {
    return this.http.patch<MongoCustomerAddress>(
      `${API_BASE_URL}/users/${encodeURIComponent(userId)}/addresses/${encodeURIComponent(addressId)}`,
      address,
    );
  }

  addCartItem(userId: string, variantId: string, quantity: number): Observable<{ itemCount: number }> {
    return this.http.post<{ itemCount: number }>(
      `${API_BASE_URL}/users/${encodeURIComponent(userId)}/cart/items`,
      { variantId, quantity },
    );
  }

  getCart(userId: string): Observable<{ itemCount: number }> {
    return this.http.get<{ itemCount: number }>(
      `${API_BASE_URL}/users/${encodeURIComponent(userId)}/cart`,
    );
  }

  getReviewableItems(userId: string): Observable<MongoReviewableItem[]> {
    return this.http.get<MongoReviewableItem[]>(
      `${API_BASE_URL}/users/${encodeURIComponent(userId)}/reviewable-items`,
    );
  }

  getReviews(userId: string): Observable<MongoCustomerReview[]> {
    return this.http.get<MongoCustomerReview[]>(
      `${API_BASE_URL}/users/${encodeURIComponent(userId)}/reviews`,
    );
  }

  createReview(
    userId: string,
    review: Pick<MongoReviewableItem, 'orderId' | 'orderItemId'> & { rating: number; comment: string },
    images: File[] = [],
  ): Observable<unknown> {
    const formData = new FormData();
    formData.set('orderId', review.orderId);
    formData.set('orderItemId', review.orderItemId);
    formData.set('rating', String(review.rating));
    formData.set('comment', review.comment);
    for (const image of images) formData.append('evidence', image);
    return this.http.post(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/reviews`, formData);
  }

  getWarrantyCards(userId: string): Observable<MongoWarrantyCard[]> {
    return this.http.get<MongoWarrantyCard[]>(
      `${API_BASE_URL}/users/${encodeURIComponent(userId)}/warranty-cards`,
    );
  }

  createWarrantyRequest(
    userId: string,
    warrantyCardId: string,
    defectDescription: string,
    images: File[] = [],
  ): Observable<unknown> {
    const formData = new FormData();
    formData.set('warrantyCardId', warrantyCardId);
    formData.set('defectDescription', defectDescription);
    for (const image of images) formData.append('evidence', image);
    return this.http.post(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/warranty-requests`, formData);
  }

  createReturnRequest(
    userId: string,
    request: {
      orderId: string;
      orderItemId: string;
      type: 'RETURN' | 'EXCHANGE';
      quantity: number;
      reason: string;
      description: string;
      refundAccount: {
        bankName: string;
        accountNumber: string;
        accountHolder: string;
      };
    },
    images: File[] = [],
  ): Observable<unknown> {
    const formData = new FormData();
    Object.entries(request).forEach(([key, value]) => {
      formData.set(key, key === 'refundAccount' ? JSON.stringify(value) : String(value));
    });
    for (const image of images) formData.append('evidence', image);
    return this.http.post(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/return-requests`, formData);
  }

  getAftersalesRequests(userId: string): Observable<MongoAftersalesRequest[]> {
    return this.http.get<MongoAftersalesRequest[]>(
      `${API_BASE_URL}/users/${encodeURIComponent(userId)}/aftersales-requests`,
    ).pipe(
      map((requests) => requests.map((request) => ({
        ...request,
        evidence: request.evidence.map((image) => apiAssetUrl(image)),
      }))),
    );
  }
}
