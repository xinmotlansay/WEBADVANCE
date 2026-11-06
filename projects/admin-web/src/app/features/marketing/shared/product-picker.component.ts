import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { PromotionApi, type ProductOption } from '../../../services/marketing/promotion.service';

/** Chọn sản phẩm đang bán: tìm theo tên, bấm để thêm, chip để bỏ. Chỉ đọc API sản phẩm công khai. */
@Component({
  selector: 'app-product-picker',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cv-field">
      <label [for]="inputId()">{{ label() }}</label>
      <input
        [id]="inputId()"
        type="search"
        autocomplete="off"
        placeholder="Nhập tên sản phẩm để tìm"
        [disabled]="disabled()"
        [ngModel]="term()"
        (ngModelChange)="search($event)"
      />
      @if (hint()) {
        <span class="cv-hint">{{ hint() }}</span>
      }
    </div>
    @if (results().length > 0) {
      <ul class="results" role="listbox" [attr.aria-label]="'Kết quả tìm ' + label()">
        @for (p of results(); track p.id) {
          <li>
            <button type="button" class="cv-btn" [disabled]="ids().includes(p.id)" (click)="add(p)">
              {{ ids().includes(p.id) ? 'Đã chọn' : 'Thêm' }}
            </button>
            <span>{{ p.name }}</span>
          </li>
        }
      </ul>
    } @else if (term().trim().length >= 2 && searched()) {
      <p class="cv-muted">Không tìm thấy sản phẩm đang kinh doanh phù hợp.</p>
    }
    @if (ids().length > 0) {
      <ul class="chips" [attr.aria-label]="'Đã chọn: ' + label()">
        @for (id of ids(); track id) {
          <li class="chip">
            {{ names().get(id) ?? id }}
            <button
              type="button"
              [attr.aria-label]="'Bỏ ' + (names().get(id) ?? id)"
              [disabled]="disabled()"
              (click)="remove(id)"
            >
              ✕
            </button>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    .results,
    .chips {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0 0 12px;
      padding: 0;
      list-style: none;
      font-size: 13px;
    }
    .results li {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .chips {
      flex-direction: row;
      flex-wrap: wrap;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 4px 4px 10px;
      border: 1px solid var(--cv-border-strong);
      border-radius: var(--cv-radius);
      background: var(--cv-surface-alt);
    }
    .chip button {
      min-width: 28px;
      min-height: 28px;
      border: 0;
      background: none;
      color: inherit;
      cursor: pointer;
    }
  `,
})
export class ProductPickerComponent {
  private readonly api = inject(PromotionApi);

  readonly label = input.required<string>();
  readonly inputId = input.required<string>();
  readonly hint = input('');
  readonly disabled = input(false);
  readonly ids = model<string[]>([]);

  protected readonly term = signal('');
  protected readonly results = signal<ProductOption[]>([]);
  protected readonly searched = signal(false);
  protected readonly names = signal(new Map<string, string>());
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Lấy tên cho các id có sẵn (khi mở màn sửa).
    effect(() => {
      const missing = this.ids().filter((id) => !this.names().has(id));
      if (missing.length === 0) return;
      void firstValueFrom(this.api.products({ ids: missing }))
        .then((found) => this.remember(found))
        .catch(() => undefined);
    });
  }

  private remember(items: ProductOption[]): void {
    this.names.update((m) => new Map([...m, ...items.map((p) => [p.id, p.name] as const)]));
  }

  protected search(value: string): void {
    this.term.set(value);
    clearTimeout(this.timer);
    if (value.trim().length < 2) {
      this.results.set([]);
      this.searched.set(false);
      return;
    }
    this.timer = setTimeout(async () => {
      try {
        const found = await firstValueFrom(this.api.products({ q: value.trim() }));
        this.results.set(found.slice(0, 10));
      } catch {
        this.results.set([]);
      }
      this.searched.set(true);
    }, 300);
  }

  protected add(p: ProductOption): void {
    this.remember([p]);
    this.ids.update((list) => (list.includes(p.id) ? list : [...list, p.id]));
  }

  protected remove(id: string): void {
    this.ids.update((list) => list.filter((x) => x !== id));
  }
}
