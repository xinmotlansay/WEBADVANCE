import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  CatalogApiService,
  type InspirationDetail,
  type InspirationSummary,
  type ProductListItem,
  focusPosition,
} from 'shared';
import { catchError, of, switchMap } from 'rxjs';
import { VndPipe } from '../../pipes/vnd.pipe';
import { IconComponent } from '../icons/icon.component';
import { VariantPickerService } from '../../../services/cart/variant-picker.service';

/**
 * Popup "Mua sắm theo nguồn cảm hứng": ảnh bên trái (chuyển qua lại), sản phẩm trong ảnh bên phải.
 * Đóng bằng nút X, bấm nền tối hoặc phím Esc; phím mũi tên chuyển ảnh.
 */
@Component({
  selector: 'app-inspiration-modal',
  imports: [RouterLink, IconComponent, VndPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inspiration-modal.component.html',
  styleUrl: './inspiration-modal.component.css',
  host: {
    '(document:keydown.escape)': 'closed.emit()',
    '(document:keydown.arrowLeft)': 'step(-1)',
    '(document:keydown.arrowRight)': 'step(1)',
  },
})
export class InspirationModalComponent {
  protected readonly focusPosition = focusPosition;
  private readonly api = inject(CatalogApiService);
  private readonly picker = inject(VariantPickerService);

  readonly items = input.required<InspirationSummary[]>();
  readonly index = model.required<number>();
  readonly closed = output<void>();

  private readonly closeButton = viewChild.required<ElementRef<HTMLButtonElement>>('closeButton');

  protected readonly current = computed(() => this.items()[this.index()]);

  protected readonly detail = toSignal(
    toObservable(this.current).pipe(
      switchMap((item) =>
        this.api.getInspiration(item.id).pipe(catchError(() => of<InspirationDetail | null>(null))),
      ),
    ),
    { initialValue: undefined },
  );

  constructor() {
    // Khóa cuộn trang phía sau khi popup đang mở.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inject(DestroyRef).onDestroy(() => (document.body.style.overflow = previousOverflow));

    afterNextRender(() => this.closeButton().nativeElement.focus());
  }

  /** Mở popup chọn mẫu (nằm trên popup này) giống nút thêm giỏ ở thẻ sản phẩm. */
  protected addToCart(product: ProductListItem): void {
    this.picker.open({ mode: 'add', slug: product.slug });
  }

  protected step(direction: -1 | 1): void {
    const total = this.items().length;
    if (total > 1) this.index.update((i) => (i + direction + total) % total);
  }
}
