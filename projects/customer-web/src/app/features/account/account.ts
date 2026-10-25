import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-account',
  templateUrl: './account.html',
})
export class Account {
  protected readonly section = signal('profile');
  protected readonly notice = signal('');
  protected readonly addressFormOpen = signal(false);
  protected readonly profileName = signal('Hoàng Hải Yến');
  protected readonly addressName = signal('');
  protected readonly addressPhone = signal('');
  protected readonly addressDetail = signal('');
  protected readonly reviewRating = signal(5);
  protected readonly reviewText = signal('');

  protected readonly navigation = [
    { id: 'profile', label: 'Tài khoản của tôi', icon: '♙' },
    { id: 'orders', label: 'Đơn hàng', icon: '▤' },
    { id: 'aftersales', label: 'Dịch vụ hậu mãi', icon: '◷' },
    { id: 'addresses', label: 'Danh sách địa chỉ', icon: '⌖' },
    { id: 'wishlist', label: 'Danh sách yêu thích', icon: '♡' },
    { id: 'reviews', label: 'Đánh giá', icon: '☆' },
    { id: 'vouchers', label: 'Ví voucher', icon: '▣' },
    { id: 'home-profiles', label: 'Hồ sơ nhà', icon: '⌂' },
    { id: 'logout', label: 'Đăng xuất', icon: '⇥' },
  ];

  protected readonly orders = [
    { id: 'CV-03102026', status: 'Chờ xác nhận', date: '03/10/2026', total: '4.800.000 ₫', delivered: false },
    { id: 'CV-01102026', status: 'Giao hàng thành công', date: '01/10/2026', total: '4.800.000 ₫', delivered: true },
  ];

  protected readonly vouchers = [
    { code: 'WELCOME100', title: 'Ưu đãi khách hàng mới', value: '100.000 ₫', condition: 'Đơn hàng từ 1.000.000 ₫', expiry: '31/12/2026', status: 'Có thể sử dụng' },
    { code: 'HOME10', title: 'Ưu đãi không gian sống', value: 'Giảm 10%', condition: 'Đơn hàng từ 5.000.000 ₫ · Tối đa 500.000 ₫', expiry: '15/11/2026', status: 'Có thể sử dụng' },
    { code: 'SHIPFREE', title: 'Miễn phí vận chuyển', value: 'Tối đa 200.000 ₫', condition: 'Áp dụng cho đơn hàng đủ điều kiện', expiry: '20/10/2026', status: 'Sắp hết hạn' },
  ];

  constructor(route: ActivatedRoute) {
    route.paramMap.subscribe((params) => {
      const requested = params.get('section') ?? 'profile';
      this.section.set(this.navigation.some((item) => item.id === requested) ? requested : 'profile');
      this.notice.set('');
    });
  }

  protected heading(): string {
    return this.navigation.find((item) => item.id === this.section())?.label ?? 'Tài khoản của tôi';
  }

  protected showNotice(message: string): void {
    this.notice.set(message);
  }

  protected saveAddress(): void {
    if (!this.addressName().trim() || !this.addressPhone().trim() || !this.addressDetail().trim()) {
      this.showNotice('Vui lòng nhập đầy đủ họ tên, số điện thoại và địa chỉ.');
      return;
    }
    this.addressFormOpen.set(false);
    this.showNotice('Địa chỉ đã được lưu (bản xem trước).');
    this.addressName.set('');
    this.addressPhone.set('');
    this.addressDetail.set('');
  }

  protected submitReview(): void {
    if (!this.reviewText().trim()) {
      this.showNotice('Vui lòng chia sẻ cảm nhận trước khi gửi đánh giá.');
      return;
    }
    this.showNotice('Đánh giá đã được ghi nhận trong bản xem trước.');
    this.reviewText.set('');
  }

  protected logout(): void {
    this.showNotice('Đăng xuất sẽ được kết nối khi hoàn thiện chức năng xác thực.');
  }

  protected toggleAddressForm(): void {
    this.addressFormOpen.update((open) => !open);
  }
}
