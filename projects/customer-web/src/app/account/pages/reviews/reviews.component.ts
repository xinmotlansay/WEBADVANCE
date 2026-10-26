import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import {
  AccountReadApiService,
  MongoCustomerReview,
  MongoReviewableItem,
} from '../../../features/account/account-read-api.service';
import { IconComponent } from '../../../shared/icon/icon.component';

const MAX_IMAGES = 4;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

@Component({
  selector: 'app-reviews',
  imports: [FormsModule, RouterLink, IconComponent],
  templateUrl: './reviews.component.html',
  styleUrl: './reviews.component.css',
})
export class ReviewsComponent {
  protected readonly stars = [1, 2, 3, 4, 5];
  protected activeTab: 'pending' | 'submitted' = 'pending';
  protected rating = 0;
  protected reviewText = '';
  protected notice = '';
  protected noticeIsError = false;
  protected selectedImages: string[] = [];
  protected readonly reviewItems = signal<MongoReviewableItem[]>([]);
  protected readonly submittedItems = signal<MongoCustomerReview[]>([]);
  protected readonly selectedItem = signal<MongoReviewableItem | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly needsAccountId = signal(false);
  protected readonly loadError = signal('');
  private selectedFiles: File[] = [];
  private readonly userId: string;

  constructor(private readonly accountApi: AccountReadApiService) {
    this.userId = accountApi.getPreviewUserId();
    if (!this.userId) {
      this.needsAccountId.set(true);
      return;
    }
    this.loadReviews();
  }

  protected chooseReview(item: MongoReviewableItem): void {
    this.selectedItem.set(item);
    this.rating = 0;
    this.reviewText = '';
    this.notice = '';
    this.releasePreviews();
  }

  protected cancelReview(): void {
    this.selectedItem.set(null);
    this.releasePreviews();
  }

  protected selectFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (this.selectedFiles.length + files.length > MAX_IMAGES) {
      return this.showNotice(`Chỉ được đính kèm tối đa ${MAX_IMAGES} ảnh.`, true);
    }
    if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > MAX_IMAGE_SIZE)) {
      return this.showNotice('Ảnh cần định dạng JPG, PNG hoặc WebP và không quá 5 MB.', true);
    }
    this.selectedFiles = [...this.selectedFiles, ...files];
    this.selectedImages = [...this.selectedImages, ...files.map((file) => URL.createObjectURL(file))];
  }

  protected removeImage(index: number): void {
    URL.revokeObjectURL(this.selectedImages[index]);
    this.selectedImages = this.selectedImages.filter((_, current) => current !== index);
    this.selectedFiles = this.selectedFiles.filter((_, current) => current !== index);
  }

  protected submitReview(): void {
    const item = this.selectedItem();
    if (!item) return;
    if (this.rating < 1) return this.showNotice('Vui lòng chọn số sao đánh giá.', true);
    if (!this.reviewText.trim()) return this.showNotice('Vui lòng chia sẻ cảm nhận của bạn.', true);
    if (/https?:\/\/|www\./i.test(this.reviewText) || /(?:\+?\d[\d\s-]{8,}\d)/.test(this.reviewText)) {
      return this.showNotice('Nội dung đánh giá không được chứa liên kết hoặc số điện thoại.', true);
    }

    this.saving.set(true);
    this.notice = '';
    this.accountApi.createReview(this.userId, {
      orderId: item.orderId,
      orderItemId: item.orderItemId,
      rating: this.rating,
      comment: this.reviewText.trim(),
    }, this.selectedFiles).subscribe({
      next: () => {
        this.saving.set(false);
        this.selectedItem.set(null);
        this.releasePreviews();
        this.activeTab = 'submitted';
        this.showNotice('Cảm ơn bạn! Đánh giá đã được gửi.');
        this.loadReviews();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.showNotice(this.apiErrorMessage(error), true);
      },
    });
  }

  protected formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  }

  private loadReviews(): void {
    this.loading.set(true);
    forkJoin({
      pending: this.accountApi.getReviewableItems(this.userId),
      submitted: this.accountApi.getReviews(this.userId),
    }).subscribe({
      next: ({ pending, submitted }) => {
        this.reviewItems.set(pending);
        this.submittedItems.set(submitted);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(this.apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  private showNotice(message: string, isError = false): void {
    this.notice = message;
    this.noticeIsError = isError;
  }

  private releasePreviews(): void {
    this.selectedImages.forEach((image) => URL.revokeObjectURL(image));
    this.selectedImages = [];
    this.selectedFiles = [];
  }

  private apiErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'Không kết nối được MongoDB API. Hãy kiểm tra server ở cổng 3002.';
      if (typeof error.error?.message === 'string') return error.error.message;
    }
    return error instanceof Error ? error.message : 'Không thể thực hiện thao tác với MongoDB.';
  }
}
