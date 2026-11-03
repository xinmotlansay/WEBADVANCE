import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, of, switchMap } from 'rxjs';
import { apiErrorMessage } from '../../../../core/api-error';
import { ConfirmService } from '../../../../core/confirm/confirm.service';
import { AccountApiService, type MyReview, type ReviewableItem } from '../../account-api.service';
import { ReviewQueueService } from '../../review-queue.service';
import { AccountIconComponent } from '../../account-icon.component';
import { ToastService } from '../../../../core/toast/toast.service';

const MAX_IMAGES = 4;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

@Component({
  selector: 'app-reviews',
  imports: [FormsModule, AccountIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reviews.component.html',
  styleUrl: './reviews.component.css',
})
export class ReviewsComponent {
  private readonly api = inject(AccountApiService);
  private readonly queue = inject(ReviewQueueService);
  private readonly confirm = inject(ConfirmService);

  protected readonly stars = [1, 2, 3, 4, 5];
  protected readonly ratingLabels = ['', 'Rất tệ', 'Tệ', 'Bình thường', 'Hài lòng', 'Tuyệt vời'];
  protected readonly activeTab = signal<'pending' | 'submitted'>('pending');
  protected readonly rating = signal(0);
  protected reviewText = '';
  protected readonly notice = signal<{ text: string; error: boolean } | null>(null);
  protected readonly selectedImages = signal<string[]>([]);
  protected readonly reviewItems = this.queue.pending;
  protected readonly submittedItems = signal<MyReview[]>([]);
  protected readonly selectedItem = signal<ReviewableItem | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  /** Đánh giá đang sửa (FR-13). */
  protected readonly editingId = signal('');
  protected readonly editRating = signal(0);
  protected editText = '';
  protected readonly loadError = signal('');
  private selectedFiles: File[] = [];

  constructor() {
    this.loadReviews();
  }

  protected chooseReview(item: ReviewableItem): void {
    this.selectedItem.set(item);
    this.rating.set(0);
    this.reviewText = '';
    this.notice.set(null);
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
    this.selectedImages.update((images) => [...images, ...files.map((file) => URL.createObjectURL(file))]);
  }

  protected removeImage(index: number): void {
    URL.revokeObjectURL(this.selectedImages()[index]);
    this.selectedImages.update((images) => images.filter((_, current) => current !== index));
    this.selectedFiles = this.selectedFiles.filter((_, current) => current !== index);
  }

  protected submitReview(): void {
    const item = this.selectedItem();
    if (!item) return;
    if (this.rating() < 1) return this.showNotice('Vui lòng chọn số sao đánh giá.', true);
    if (!this.reviewText.trim()) return this.showNotice('Vui lòng chia sẻ cảm nhận của bạn.', true);
    if (/https?:\/\/|www\./i.test(this.reviewText) || /(?:\+?\d[\d\s-]{8,}\d)/.test(this.reviewText)) {
      return this.showNotice('Nội dung đánh giá không được chứa liên kết hoặc số điện thoại.', true);
    }

    this.saving.set(true);
    this.notice.set(null);
    const uploads = this.selectedFiles.length
      ? forkJoin(this.selectedFiles.map((file) => this.api.uploadReviewImage(file)))
      : of<string[]>([]);
    uploads
      .pipe(
        switchMap((images) =>
          this.api.createReview(item.orderId, item.orderItemId, {
            rating: this.rating(),
            comment: this.reviewText.trim(),
            images,
          }),
        ),
      )
      .subscribe({
        next: (result) => {
          this.saving.set(false);
          this.selectedItem.set(null);
          this.releasePreviews();
          this.activeTab.set('submitted');
          this.showNotice(
            result.status === 'PENDING_REVIEW'
              ? 'Đánh giá của bạn đang chờ kiểm duyệt và sẽ hiển thị sau khi được duyệt.'
              : 'Cảm ơn bạn! Đánh giá đã được gửi.',
            false,
          );
          this.loadReviews();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.showNotice(apiErrorMessage(error), true);
        },
      });
  }

  protected startEdit(review: MyReview): void {
    this.editingId.set(review.id);
    this.editRating.set(review.rating);
    this.editText = review.comment;
    this.notice.set(null);
  }

  protected saveEdit(review: MyReview): void {
    if (this.editRating() < 1) return this.showNotice('Vui lòng chọn số sao đánh giá.', true);
    this.saving.set(true);
    this.api.updateReview(review.id, { rating: this.editRating(), comment: this.editText.trim() }).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.editingId.set('');
        this.showNotice(
          result.status === 'PENDING_REVIEW'
            ? 'Đánh giá đã cập nhật và đang chờ kiểm duyệt trước khi hiển thị.'
            : 'Đã cập nhật đánh giá.',
          false,
        );
        this.loadReviews();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.showNotice(apiErrorMessage(error), true);
      },
    });
  }

  protected async removeReview(review: MyReview): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Xóa đánh giá',
      message: 'Sau khi xóa, bạn không thể đánh giá lại sản phẩm này. Bạn chắc chắn muốn xóa?',
      confirmText: 'Xóa',
    });
    if (!ok) return;
    this.api.deleteReview(review.id).subscribe({
      next: () => {
        this.showNotice('Đã xóa đánh giá.');
        this.loadReviews();
      },
      error: (error: unknown) => this.showNotice(apiErrorMessage(error), true),
    });
  }

  protected statusLabel(review: MyReview): string {
    if (review.status === 'PENDING_REVIEW') return 'Đang chờ duyệt';
    if (review.status === 'REJECTED') return 'Bị từ chối';
    if (review.status === 'HIDDEN') return 'Đã bị ẩn';
    return '';
  }

  protected formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '—'
      : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  }

  private loadReviews(): void {
    this.loading.set(true);
    forkJoin({ pending: this.queue.refresh(), submitted: this.api.myReviews() }).subscribe({
      next: ({ submitted }) => {
        this.submittedItems.set(submitted);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  private readonly toast = inject(ToastService);

  /** Thành công hiện toast ở đầu trang rồi tự mất; lỗi vẫn giữ lại trên trang. */
  private showNotice(text: string, error = false): void {
    if (error) {
      this.notice.set({ text, error });
      return;
    }
    this.notice.set(null);
    this.toast.success(text);
  }

  private releasePreviews(): void {
    this.selectedImages().forEach((image) => URL.revokeObjectURL(image));
    this.selectedImages.set([]);
    this.selectedFiles = [];
  }
}
