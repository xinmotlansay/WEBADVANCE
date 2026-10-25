import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

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
  protected submittedReview = false;

  protected selectFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedImages = Array.from(input.files ?? []).slice(0, 4).map((file) => URL.createObjectURL(file));
  }

  protected submitReview(): void {
    if (this.rating < 1) {
      this.notice = 'Vui lòng chọn số sao đánh giá.';
      return;
    }
    if (!this.reviewText.trim()) {
      this.notice = 'Vui lòng chia sẻ cảm nhận của bạn.';
      return;
    }
    this.submittedReview = true;
    this.activeTab = 'submitted';
    this.notice = 'Đánh giá đã được ghi nhận trong bản xem trước.';
    this.reviewText = '';
    this.rating = 0;
    this.selectedImages = [];
  }
}
