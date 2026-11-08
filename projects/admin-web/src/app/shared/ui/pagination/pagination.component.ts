import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cv-pagination">
      <span>
        Trang {{ meta().page }}/{{ meta().totalPages }} · {{ meta().total }} kết quả
      </span>
      <div class="cv-pagination__pages">
        <button
          type="button"
          class="cv-page-btn"
          [disabled]="meta().page <= 1"
          (click)="go(meta().page - 1)"
          aria-label="Trang trước"
        >
          ‹
        </button>
        @for (item of pages(); track item) {
          <button
            type="button"
            class="cv-page-btn"
            [class.cv-page-btn--active]="item === meta().page"
            (click)="go(item)"
            [attr.aria-current]="item === meta().page ? 'page' : null"
          >
            {{ item }}
          </button>
        }
        <button
          type="button"
          class="cv-page-btn"
          [disabled]="meta().page >= meta().totalPages"
          (click)="go(meta().page + 1)"
          aria-label="Trang sau"
        >
          ›
        </button>
      </div>
    </div>
  `,
})
export class PaginationComponent {
  readonly meta = input.required<{ page: number; limit: number; total: number; totalPages: number }>();
  readonly pageChange = output<number>();

  readonly pages = computed(() => {
    const total = this.meta().totalPages;
    const current = this.meta().page;
    const start = Math.max(1, Math.min(current - 2, total - 4));
    const end = Math.min(total, start + 4);
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
  });

  go(page: number): void {
    if (page < 1 || page > this.meta().totalPages || page === this.meta().page) return;
    this.pageChange.emit(page);
  }
}
