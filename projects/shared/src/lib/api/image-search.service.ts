import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import { ProductListItem } from '../models/product.model';
export interface ImageSearchItem extends ProductListItem {
  similarity?: number;
}
@Injectable({ providedIn: 'root' })
export class ImageSearchService {
  private readonly http = inject(HttpClient);
  search(image: File) {
    const body = new FormData();
    body.append('image', image);
    return this.http
      .post<ApiResponse<ImageSearchItem[]>>('/api/v1/search/image', body)
      .pipe(map((r) => r.data));
  }
}
