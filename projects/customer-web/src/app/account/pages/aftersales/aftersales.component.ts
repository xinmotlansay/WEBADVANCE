import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import {
  AccountReadApiService,
  MongoAftersalesRequest,
  MongoCustomerOrder,
  MongoWarrantyCard,
} from '../../../features/account/account-read-api.service';

interface ReturnableItem {
  orderId: string;
  orderItemId: string;
  orderCode: string;
  name: string;
  color: string;
  quantity: number;
}

@Component({
  selector: 'app-aftersales',
  imports: [FormsModule],
  templateUrl: './aftersales.component.html',
  styleUrl: './aftersales.component.css',
})
export class AftersalesComponent {
  protected notice = '';
  protected expandedRequestId = '';
  protected requestFormType: 'warranty' | 'return' | '' = '';
  protected requestReason = '';
  protected requestDescription = '';
  protected refundBankName = '';
  protected refundAccountNumber = '';
  protected refundAccountHolder = '';
  protected selectedWarrantyCardId = '';
  protected selectedOrderItemId = '';
  protected selectedEvidence: string[] = [];
  protected readonly warrantyCards = signal<MongoWarrantyCard[]>([]);
  protected readonly returnableItems = signal<ReturnableItem[]>([]);
  protected readonly requests = signal<MongoAftersalesRequest[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly needsAccountId = signal(false);
  protected readonly loadError = signal('');
  private selectedFiles: File[] = [];
  private readonly userId: string;

  constructor(private readonly accountApi: AccountReadApiService) {
    this.userId = accountApi.getPreviewUserId();
    if (!this.userId) this.needsAccountId.set(true);
    else this.loadEligibleItems();
  }

  protected openRequest(type: 'warranty' | 'return'): void {
    if (!this.userId) {
      this.notice = 'Hãy chọn tài khoản demo trong mục Tài khoản của tôi trước.';
      return;
    }
    this.requestFormType = type;
    this.notice = '';
    this.requestReason = '';
    this.requestDescription = '';
    this.refundBankName = '';
    this.refundAccountNumber = '';
    this.refundAccountHolder = '';
    this.selectedWarrantyCardId = '';
    this.selectedOrderItemId = '';
    this.releasePreviews();
    this.loadEligibleItems();
  }

  protected selectFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length > 4 || files.some((file) =>
      (!file.type.startsWith('image/') && file.type !== 'video/mp4')
      || (file.type === 'video/mp4' ? file.size > 25 * 1024 * 1024 : file.size > 5 * 1024 * 1024))) {
      this.notice = 'Tối đa 4 tệp; ảnh tối đa 5 MB và video MP4 tối đa 25 MB.';
      input.value = '';
      return;
    }
    this.releasePreviews();
    this.selectedFiles = files;
    this.selectedEvidence = files
      .filter((file) => file.type.startsWith('image/'))
      .map((file) => URL.createObjectURL(file));
  }

  protected formatDate(value?: string): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('vi-VN').format(date);
  }

  protected reasonLabel(): string {
    const labels: Record<string, string> = {
      DEFECTIVE: 'Sản phẩm bị lỗi',
      WRONG_ITEM: 'Sản phẩm không đúng mô tả',
      DAMAGED_IN_TRANSIT: 'Sản phẩm hư hỏng khi vận chuyển',
      CHANGED_MIND: 'Thay đổi ý định',
      OTHER: 'Khác',
    };
    return labels[this.requestReason] ?? this.requestReason;
  }

  protected requestReasonLabel(reason: string): string {
    const labels: Record<string, string> = {
      DEFECTIVE: 'Sản phẩm bị lỗi',
      WRONG_ITEM: 'Sản phẩm không đúng mô tả',
      DAMAGED_IN_TRANSIT: 'Sản phẩm hư hỏng khi vận chuyển',
      CHANGED_MIND: 'Thay đổi ý định',
      OTHER: 'Khác',
    };
    return labels[reason] ?? reason;
  }

  protected requestStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      PENDING_CONFIRMATION: 'Chờ xác nhận',
      RECEIVED: 'Đã tiếp nhận',
      INSPECTING: 'Đang kiểm tra',
      IN_WARRANTY: 'Đang bảo hành',
      PENDING: 'Chờ xử lý',
      CONFIRMED: 'Đã xác nhận',
      AWAITING_GOODS: 'Chờ nhận hàng',
      PROCESSING: 'Đang xử lý',
      COMPLETED: 'Hoàn tất',
      REJECTED: 'Từ chối',
    };
    return labels[status] ?? status;
  }

  protected submitRequest(): void {
    if (!this.requestReason || !this.requestDescription.trim()) {
      this.notice = 'Vui lòng chọn lý do và mô tả tình trạng sản phẩm.';
      return;
    }
    if (this.requestFormType === 'warranty') {
      if (!this.selectedWarrantyCardId) {
        this.notice = 'Không có phiếu bảo hành hợp lệ cho tài khoản demo.';
        return;
      }
      this.sendRequest(this.accountApi.createWarrantyRequest(
        this.userId,
        this.selectedWarrantyCardId,
        `${this.reasonLabel()}: ${this.requestDescription.trim()}`,
        this.selectedFiles,
      ), 'Yêu cầu bảo hành và ảnh minh chứng đã được lưu vào MongoDB.');
      return;
    }

    const item = this.returnableItems().find((candidate) => candidate.orderItemId === this.selectedOrderItemId);
    if (!item) {
      this.notice = 'Vui lòng chọn sản phẩm thuộc đơn hàng đã giao.';
      return;
    }
    if (!this.refundBankName.trim() || !this.refundAccountHolder.trim()
      || !/^[\d ]{6,34}$/.test(this.refundAccountNumber.trim())) {
      this.notice = 'Vui lòng nhập tên ngân hàng, chủ tài khoản và số tài khoản hợp lệ để hoàn tiền.';
      return;
    }
    if (['DEFECTIVE', 'WRONG_ITEM', 'DAMAGED_IN_TRANSIT'].includes(this.requestReason)
      && !this.selectedFiles.some((file) => file.type === 'video/mp4')) {
      this.notice = 'Với lý do thuộc lỗi CaraVeso, vui lòng tải lên video mở hàng định dạng MP4.';
      return;
    }
    this.sendRequest(this.accountApi.createReturnRequest(this.userId, {
      orderId: item.orderId,
      orderItemId: item.orderItemId,
      type: 'RETURN',
      quantity: 1,
      reason: this.requestReason,
      description: this.requestDescription.trim(),
      refundAccount: {
        bankName: this.refundBankName.trim(),
        accountHolder: this.refundAccountHolder.trim(),
        accountNumber: this.refundAccountNumber.trim(),
      },
    }, this.selectedFiles), 'Yêu cầu đổi trả và ảnh minh chứng đã được lưu vào MongoDB.');
  }

  protected cancelRequest(): void {
    this.requestFormType = '';
    this.releasePreviews();
  }

  private loadEligibleItems(): void {
    if (!this.userId) return;
    this.loading.set(true);
    this.loadError.set('');
    forkJoin({
      cards: this.accountApi.getWarrantyCards(this.userId),
      orders: this.accountApi.getOrders(this.userId),
      requests: this.accountApi.getAftersalesRequests(this.userId),
    }).subscribe({
      next: ({ cards, orders, requests }) => {
        this.warrantyCards.set(cards);
        this.returnableItems.set(this.toReturnableItems(orders));
        this.requests.set(requests);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(this.apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  private toReturnableItems(orders: MongoCustomerOrder[]): ReturnableItem[] {
    return orders
      .filter((order) => order.status === 'DELIVERED')
      .flatMap((order) => (order.items ?? [])
        .filter((item) => !!item._id)
        .map((item) => ({
          orderId: order._id,
          orderItemId: item._id!,
          orderCode: order.orderCode ?? '',
          name: item.snapshot?.name ?? 'Sản phẩm',
          color: item.snapshot?.color ?? item.snapshot?.sku ?? '',
          quantity: item.quantity ?? 1,
        })));
  }

  private sendRequest(request: ReturnType<AccountReadApiService['createWarrantyRequest']>, successMessage: string): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.notice = '';
    request.subscribe({
      next: (response: unknown) => {
        this.saving.set(false);
        this.requestFormType = '';
        const requestId = response && typeof response === 'object' && '_id' in response
          ? String(response._id)
          : '';
        this.notice = requestId ? `${successMessage} Mã yêu cầu: ${requestId}.` : successMessage;
        this.requestDescription = '';
        this.requestReason = '';
        this.refundBankName = '';
        this.refundAccountNumber = '';
        this.refundAccountHolder = '';
        this.releasePreviews();
        this.loadEligibleItems();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notice = this.apiErrorMessage(error);
      },
    });
  }

  private releasePreviews(): void {
    this.selectedEvidence.forEach((image) => URL.revokeObjectURL(image));
    this.selectedEvidence = [];
    this.selectedFiles = [];
  }

  private apiErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && typeof error.error?.message === 'string') {
      return error.error.message;
    }
    if (error instanceof HttpErrorResponse && error.status === 0) {
      return 'Không kết nối được MongoDB API. Hãy kiểm tra server ở cổng 3002.';
    }
    return error instanceof Error ? error.message : 'Không thể thực hiện thao tác với MongoDB.';
  }
}
