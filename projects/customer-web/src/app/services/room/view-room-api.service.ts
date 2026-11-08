import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse } from 'shared';
import { map, type Observable } from 'rxjs';
import type {
  LayoutSnapshot,
  PlacedItem,
  ProductDetail,
  RoomConfig,
  RoomSuggestions,
} from '../../features/view-your-room/view-your-room.models';

const API_BASE = '/api/v1';

export interface SavedLayout {
  id: string;
  name: string;
  roomCategoryId: string | null;
  room: RoomConfig;
  items: { productId: string; x: number; z: number; y?: number; rotationY: number }[];
  updatedAt: string;
}

/** Bố cục kèm thông tin sản phẩm đủ để dựng lại trong phòng. */
export interface SavedLayoutDetail extends Omit<SavedLayout, 'items'> {
  items: Omit<PlacedItem, 'uid'>[];
  skippedCount: number;
}

@Injectable({ providedIn: 'root' })
export class ViewRoomApiService {
  private readonly http = inject(HttpClient);

  getProductDetail(slug: string): Observable<ProductDetail> {
    return this.http
      .get<ApiResponse<ProductDetail>>(`${API_BASE}/products/${slug}`)
      .pipe(map((r) => r.data));
  }

  getSuggestions(roomCategoryId: string, placedProductIds: string[]): Observable<RoomSuggestions> {
    return this.http
      .post<ApiResponse<RoomSuggestions>>(`${API_BASE}/view-room/suggestions`, {
        roomCategoryId,
        placedProductIds,
      })
      .pipe(map((r) => r.data));
  }

  listLayouts(): Observable<SavedLayout[]> {
    return this.http
      .get<ApiResponse<SavedLayout[]>>(`${API_BASE}/view-room/layouts`)
      .pipe(map((r) => r.data));
  }

  getLayout(id: string): Observable<SavedLayoutDetail> {
    return this.http
      .get<ApiResponse<SavedLayoutDetail>>(`${API_BASE}/view-room/layouts/${id}`)
      .pipe(map((r) => r.data));
  }

  /** Có `id` thì ghi đè bố cục đó, không thì tạo bố cục mới. */
  saveLayout(
    name: string,
    snapshot: LayoutSnapshot,
    roomCategoryId: string | null,
    id?: string,
  ): Observable<SavedLayout> {
    const body = {
      name,
      ...(roomCategoryId ? { roomCategoryId } : {}),
      room: snapshot.room,
      items: snapshot.items.map((item) => ({
        productId: item.productId,
        x: item.x,
        z: item.z,
        y: item.y ?? 0,
        rotationY: item.rotationY,
      })),
    };
    const request = id
      ? this.http.put<ApiResponse<SavedLayout>>(`${API_BASE}/view-room/layouts/${id}`, body)
      : this.http.post<ApiResponse<SavedLayout>>(`${API_BASE}/view-room/layouts`, body);
    return request.pipe(map((r) => r.data));
  }

  deleteLayout(id: string): Observable<void> {
    return this.http
      .delete<ApiResponse<unknown>>(`${API_BASE}/view-room/layouts/${id}`)
      .pipe(map(() => undefined));
  }
}
