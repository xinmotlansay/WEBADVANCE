import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse } from 'shared';
import { map, type Observable } from 'rxjs';
import type {
  LayoutSnapshot,
  ProductDetail,
  RoomConfig,
  RoomSuggestions,
} from './view-your-room.models';

const API_BASE = '/api/v1';

export interface SavedLayout {
  id: string;
  name: string;
  room: RoomConfig;
  items: { productId: string; x: number; z: number; rotationY: number }[];
  updatedAt: string;
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

  saveLayout(name: string, snapshot: LayoutSnapshot): Observable<SavedLayout> {
    const body = {
      name,
      room: snapshot.room,
      items: snapshot.items.map((item) => ({
        productId: item.productId,
        x: item.x,
        z: item.z,
        rotationY: item.rotationY,
      })),
    };
    return this.http
      .post<ApiResponse<SavedLayout>>(`${API_BASE}/view-room/layouts`, body)
      .pipe(map((r) => r.data));
  }
}
