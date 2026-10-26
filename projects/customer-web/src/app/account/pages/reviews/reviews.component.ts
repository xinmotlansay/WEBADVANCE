import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import {
  AccountReadApiService,
  MongoCustomerReview,
  MongoReviewableItem,
} from '../../../features/account/account-read-api.service';

interface SubmittedReview {
  item: MongoReviewableItem;
  rating: number;
  comment: string;
}

@Component({
  selector: 'app-reviews',
  imports: [FormsModule],
  templateUrl: './reviews.component.html',
  styleUrl: './reviews.component.css',
})
export class ReviewsComponent {
  protected activeTab: 'pending' | 'submitted' = 'pending';
  protected rating = 0;
  protected reviewText = '';
  protected notice = '';
  protected selectedImages: string[] = [];
  protected readonly reviewItems = signal<MongoReviewableItem[]>([]);
  protected readonly submittedItems = signal<SubmittedReview[]>([]);
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
    this.loadReviewableItems();
  }

  protected chooseReview(item: MongoReviewableItem): void {
    this.selectedItem.set(item);
    this.rating = 0;
    this.reviewText = '';
    this.notice = '';
    this.releasePreviews();
  }

  protected selectFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length > 4 || files.some((file) => !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024)) {
      this.notice = 'Tối đa 4 ảnh, mỗi ảnh không quá 5 MB.';
      input.value = '';
      return;
    }
    this.releasePreviews();
    this.selectedFiles = files;
    this.selectedImages = files.map((file) => URL.createObjectURL(file));
  }

  protected submitReview(): void {
    const item = this.selectedItem();
    if (!item || !this.userId) {
      this.notice = 'Hãy chọn một đơn hàng đủ điều kiện để đánh giá.';
      return;
    }
    if (this.rating < 1) {
      this.notice = 'Vui lòng chọn số sao đánh giá.';
      return;
    }
    if (!this.reviewText.trim()) {
      this.notice = 'Vui lòng chia sẻ cảm nhận của bạn.';
      return;
    }

    this.saving.set(true);
    this.notice = '';
    const submitted = { item, rating: this.rating, comment: this.reviewText.trim() };
    this.accountApi.createReview(this.userId, {
      orderId: item.orderId,
      orderItemId: item.orderItemId,
      rating: this.rating,
      comment: this.reviewText.trim(),
    }, this.selectedFiles).subscribe({
      next: () => {
        this.reviewItems.update((items) => items.filter((reviewItem) => reviewItem.orderItemId !== item.orderItemId));
        this.submittedItems.update((items) => [submitted, ...items]);
        this.selectedItem.set(null);
        this.reviewText = '';
        this.rating = 0;
        this.releasePreviews();
        this.saving.set(false);
        this.activeTab = 'submitted';
        this.notice = 'Đánh giá và ảnh minh chứng đã được lưu vào MongoDB.';
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notice = this.apiErrorMessage(error);
      },
    });
  }

  protected formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('vi-VN').format(date);
  }

  private loadReviewableItems(): void {
    this.loading.set(true);
    forkJoin({
      pending: this.accountApi.getReviewableItems(this.userId),
      submitted: this.accountApi.getReviews(this.userId),
    }).subscribe({
      next: ({ pending, submitted }) => {
        this.reviewItems.set(pending);
        this.submittedItems.set(submitted.map((review) => this.toSubmittedReview(review)));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(this.apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  private toSubmittedReview(review: MongoCustomerReview): SubmittedReview {
    return {
      item: review,
      rating: review.rating,
      comment: review.comment,
    };
  }

  private releasePreviews(): void {
    this.selectedImages.forEach((image) => URL.revokeObjectURL(image));
    this.selectedImages = [];
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
