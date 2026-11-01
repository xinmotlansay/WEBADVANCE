import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  AdminApiService,
  apiMessage,
  type CategoryInput,
  type CategoryRow,
  type CategoryType,
} from '../../core/api/admin-api.service';
import { ToastService } from '../../shared/ui/toast';

export const CATEGORY_TYPE_LABEL: Record<CategoryType, string> = {
  PRODUCT_CATEGORY: 'Loại sản phẩm',
  ROOM: 'Phòng',
  STYLE: 'Phong cách',
};

/** PA-07: thêm hoặc sửa danh mục; với loại phòng chọn nhóm đồ thường có (dùng cho FR-23). */
@Component({
  selector: 'app-category-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="modal" aria-labelledby="cat-title" (cancel)="onCancel($event)">
      <form (submit)="submit($event)" novalidate>
        <header class="modal-head">
          <h2 id="cat-title">{{ category() ? 'Sửa danh mục' : 'Thêm danh mục' }}</h2>
          <p>
            @if (category(); as c) {
              {{ typeLabel[c.type] }} · đường dẫn <span class="tabular">/{{ c.slug }}</span> giữ nguyên khi đổi tên
            } @else {
              Danh mục mới hiện ngay trên cửa hàng nếu chọn trạng thái Hiển thị.
            }
          </p>
        </header>

        <div class="modal-body">
          @if (!category()) {
            <div class="field">
              <span class="label">Loại danh mục <span class="req">*</span></span>
              <div class="toggles" role="radiogroup" aria-label="Loại danh mục">
                @for (t of types; track t) {
                  <button type="button" class="toggle" role="radio" [class.on]="type() === t" [attr.aria-checked]="type() === t" (click)="type.set(t)">
                    {{ typeLabel[t] }}
                  </button>
                }
              </div>
            </div>
          }

          <div class="field">
            <label for="cat-name">Tên danh mục <span class="req">*</span></label>
            <input id="cat-name" class="input" maxlength="80" [value]="name()" (input)="name.set($any($event.target).value)" placeholder="Ví dụ: Sofa, Phòng khách, Scandinavian" />
            @if (submitted() && name().trim().length < 2) {
              <span class="msg">Nhập tên từ 2 đến 80 ký tự.</span>
            }
          </div>

          <div class="field">
            <label for="cat-desc">Mô tả</label>
            <textarea id="cat-desc" class="input" rows="3" maxlength="1000" [value]="description()" (input)="description.set($any($event.target).value)"></textarea>
          </div>

          <div class="field">
            <span class="label">Ảnh đại diện</span>
            <div class="image-row">
              @if (image()) {
                <img [src]="image()" alt="" class="preview" />
              } @else {
                <span class="preview" aria-hidden="true"></span>
              }
              <label class="btn">
                <input type="file" class="sr-only" accept="image/jpeg,image/png,image/webp" (change)="upload($any($event.target).files); $any($event.target).value = ''" />
                {{ uploading() ? 'Đang tải…' : image() ? 'Đổi ảnh' : 'Tải ảnh lên' }}
              </label>
              @if (image()) {
                <button type="button" class="btn-link" (click)="image.set('')">Bỏ ảnh</button>
              }
            </div>
            <span class="hint">JPG, PNG, WebP ≤ 5 MB. Không bắt buộc.</span>
          </div>

          <div class="field">
            <span class="label">Trạng thái</span>
            <div class="toggles" role="radiogroup" aria-label="Trạng thái">
              <button type="button" class="toggle" role="radio" [class.on]="status() === 'VISIBLE'" [attr.aria-checked]="status() === 'VISIBLE'" (click)="status.set('VISIBLE')">Hiển thị</button>
              <button type="button" class="toggle" role="radio" [class.on]="status() === 'HIDDEN'" [attr.aria-checked]="status() === 'HIDDEN'" (click)="status.set('HIDDEN')">Ẩn</button>
            </div>
            @if (status() === 'HIDDEN' && (category()?.activeProductCount ?? 0) > 0) {
              <span class="hint">Danh mục ẩn không hiện trên menu và bộ lọc; {{ category()!.activeProductCount }} sản phẩm đang bán vẫn mua được qua trang sản phẩm.</span>
            }
          </div>

          @if (type() === 'ROOM') {
            <div class="field">
              <span class="label">Nhóm đồ thường có trong phòng</span>
              <span class="hint">Dùng ở View your Room để gợi ý sản phẩm còn thiếu (FR-23). Chọn các loại sản phẩm.</span>
              <div class="toggles" role="group" aria-label="Nhóm đồ thường có">
                @for (c of productTypes(); track c.id) {
                  <button type="button" class="toggle" [class.on]="typical().includes(c.id)" [attr.aria-pressed]="typical().includes(c.id)" (click)="toggleTypical(c.id)">
                    {{ c.name }}
                  </button>
                } @empty {
                  <span class="hint">Chưa có loại sản phẩm nào. Tạo loại sản phẩm trước.</span>
                }
              </div>
            </div>
          }

          @if (error()) {
            <div class="alert-box" role="alert">{{ error() }}</div>
          }
        </div>

        <footer class="modal-foot">
          <button type="button" class="btn" [disabled]="busy()" (click)="cancelled.emit()">Quay lại</button>
          <button type="submit" class="btn btn-primary" [disabled]="busy() || uploading()">
            {{ busy() ? 'Đang lưu…' : category() ? 'Lưu thay đổi' : 'Thêm danh mục' }}
          </button>
        </footer>
      </form>
    </dialog>
  `,
  styles: `
    .label {
      font-weight: 500;
    }
    .req,
    .msg {
      color: var(--cv-danger-text);
    }
    .msg {
      font-size: 12px;
    }
    .image-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .preview {
      display: block;
      width: 56px;
      height: 56px;
      border-radius: var(--cv-radius);
      background: var(--cv-initials-bg);
      object-fit: cover;
    }
  `,
})
export class CategoryDialogComponent implements AfterViewInit {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);

  /** Có giá trị là sửa; không có là thêm mới với loại `defaultType`. */
  readonly category = input<CategoryRow | null>(null);
  readonly defaultType = input<CategoryType>('PRODUCT_CATEGORY');
  readonly all = input<CategoryRow[]>([]);
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly types: CategoryType[] = ['PRODUCT_CATEGORY', 'ROOM', 'STYLE'];
  protected readonly typeLabel = CATEGORY_TYPE_LABEL;

  protected readonly type = signal<CategoryType>('PRODUCT_CATEGORY');
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly image = signal('');
  protected readonly status = signal<'VISIBLE' | 'HIDDEN'>('VISIBLE');
  protected readonly typical = signal<string[]>([]);
  protected readonly busy = signal(false);
  protected readonly uploading = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal('');

  protected readonly productTypes = computed(() => this.all().filter((c) => c.type === 'PRODUCT_CATEGORY'));

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  ngAfterViewInit(): void {
    const c = this.category();
    this.type.set(c?.type ?? this.defaultType());
    if (c) {
      this.name.set(c.name);
      this.description.set(c.description);
      this.image.set(c.image);
      this.status.set(c.status);
      this.typical.set(c.typicalCategories.map((t) => t.id));
    }
    this.dialog().nativeElement.showModal();
  }

  protected toggleTypical(id: string): void {
    this.typical.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  protected upload(files: FileList | null): void {
    const file = files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      this.toast.show('Chỉ nhận ảnh JPG, PNG, WebP tối đa 5 MB.', 'error');
      return;
    }
    this.uploading.set(true);
    this.api.uploadProductImage(file).subscribe({
      next: (url) => {
        this.uploading.set(false);
        this.image.set(url);
      },
      error: (error: unknown) => {
        this.uploading.set(false);
        this.toast.show(apiMessage(error), 'error');
      },
    });
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.submitted.set(true);
    this.error.set('');
    if (this.name().trim().length < 2 || this.busy()) return;
    const body: CategoryInput = {
      name: this.name().trim(),
      description: this.description().trim(),
      image: this.image(),
      status: this.status(),
      typicalCategoryIds: this.type() === 'ROOM' ? this.typical() : [],
    };
    const current = this.category();
    this.busy.set(true);
    (current ? this.api.updateCategory(current.id, body) : this.api.createCategory({ ...body, type: this.type() })).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.toast.show(current ? `Đã lưu ${result.name}.` : `Đã thêm danh mục ${result.name}.`);
        this.saved.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(apiMessage(error));
      },
    });
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    if (!this.busy()) this.cancelled.emit();
  }
}
