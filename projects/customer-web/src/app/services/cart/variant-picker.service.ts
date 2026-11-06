import { Injectable, signal } from '@angular/core';

/**
 * Mở popup chọn biến thể, điểm vào chính của Thêm giỏ / Mua ngay (spec giỏ hàng mục 4.2).
 * - `add`, `buy`: từ thẻ sản phẩm, nhấn mạnh nút tương ứng.
 * - `update`: đổi biến thể, số lượng, lắp đặt của một dòng trong giỏ.
 */
export type VariantPickerRequest =
  | { mode: 'add' | 'buy'; slug: string }
  | {
      mode: 'update';
      slug: string;
      itemId: string;
      variantId: string;
      quantity: number;
      hasInstallation: boolean;
    };

@Injectable({ providedIn: 'root' })
export class VariantPickerService {
  readonly request = signal<VariantPickerRequest | null>(null);

  open(request: VariantPickerRequest): void {
    this.request.set(request);
  }

  close(): void {
    this.request.set(null);
  }
}
