import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-aftersales',
  imports: [FormsModule],
  templateUrl: './aftersales.component.html',
  styleUrl: './aftersales.component.css',
})
export class AftersalesComponent {
  protected requestType: 'warranty' | 'return' = 'warranty';
  protected expandedRequest = true;
  protected orderQuery = '';
  protected productQuery = '';
  protected searched = false;
  protected notice = '';
  protected requestFormType: 'warranty' | 'return' | '' = '';
  protected requestReason = '';
  protected requestDescription = '';
  protected readonly requests = [
    { id: '#A11204864', title: 'Ghế sofa Kifi', color: 'Màu trắng kem, 2 chỗ ngồi', status: 'Chờ phản hồi', date: '12/10/2026' },
  ];

  protected search(): void {
    this.searched = true;
    this.notice = '';
  }

  protected openRequest(type: 'warranty' | 'return'): void {
    this.requestFormType = type;
  }

  protected submitRequest(): void {
    if (!this.requestReason || !this.requestDescription.trim()) {
      this.notice = 'Vui lòng chọn lý do và mô tả tình trạng sản phẩm.';
      return;
    }
    this.requestFormType = '';
    this.requestReason = '';
    this.requestDescription = '';
    this.notice = 'Yêu cầu đã được ghi nhận trong bản xem trước.';
  }
}
