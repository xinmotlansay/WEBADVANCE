import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AccountProduct, AccountService } from '../../../features/account/account.service';

@Component({
  selector: 'app-wishlist',
  imports: [CommonModule],
  templateUrl: './wishlist.component.html',
  styleUrl: './wishlist.component.css',
})
export class WishlistComponent {
  protected readonly products;
  protected notice = '';
  protected readonly recommendationSections = ['GỢI Ý CHO BẠN', 'XEM GẦN ĐÂY'];

  constructor(account: AccountService) {
    this.products = account.products;
  }

  protected remove(product: AccountProduct): void {
    this.products.update((items) => items.filter((item) => item.id !== product.id));
    this.notice = `${product.name} đã được xóa khỏi danh sách yêu thích.`;
  }

  protected addToCart(product: AccountProduct): void {
    this.notice = `Không thể lưu ${product.name}: sản phẩm gợi ý chưa có mã biến thể MongoDB.`;
  }

  protected formatPrice(price: number): string {
    return `${new Intl.NumberFormat('vi-VN').format(price)} VNĐ`;
  }
}
