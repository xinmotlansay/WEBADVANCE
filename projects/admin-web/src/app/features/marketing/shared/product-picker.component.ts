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
        placeholder="Tìm theo tên hoặc mã sản phẩm…"
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
            <button type="button" class="result" role="option" [attr.aria-selected]="ids().includes(p.id)" [disabled]="ids().includes(p.id)" (click)="add(p)">
              <span class="result__name">{{ p.name }}</span>
              <span class="result__tag" [class.result__tag--on]="ids().includes(p.id)">
                {{ ids().includes(p.id) ? '✓ Đã chọn' : '+ Thêm' }}
              </span>
            </button>
          </li>
        }
      </ul>
    } @else if (term().trim().length >= 2 && searched()) {
      <p class="empty">Không tìm thấy sản phẩm đang kinh doanh phù hợp.</p>
    }
    @if (ids().length > 0) {
      <p class="count">Đã chọn {{ ids().length }} sản phẩm</p>
      <ol class="chips" [attr.aria-label]="'Đã chọn: ' + label()">
        @for (id of ids(); track id; let i = $index) {
          <li class="chip">
            <span class="chip__no" aria-hidden="true">{{ i + 1 }}</span>
            <span class="chip__name">{{ names().get(id) ?? id }}</span>
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
      </ol>
    }
  `,
  styles: `
    .results {
      display: grid;
      margin: -4px 0 12px;
      padding: 0;
      list-style: none;
      border: 1px solid var(--cv-border-strong);
      border-radius: var(--cv-radius-lg);
      background: var(--cv-surface, #fff);
      box-shadow: 0 6px 18px rgb(0 0 0 / 8%);
      overflow: hidden;
    }
    .result {
      display: flex;
      width: 100%;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 14px;
      border: 0;
      border-bottom: 1px solid var(--cv-border);
      background: none;
      color: inherit;
      font: inherit;
      font-size: 14px;
      text-align: left;
      cursor: pointer;
    }
    .results li:last-child .result {
      border-bottom: 0;
    }
    .result:hover:not(:disabled),
    .result:focus-visible {
      background: var(--cv-surface-alt);
    }
    .result:disabled {
      cursor: default;
      opacity: 0.65;
    }
    .result__tag {
      flex: none;
      padding: 2px 10px;
      border-radius: 999px;
      background: var(--cv-surface-alt);
      font-size: 12px;
      font-weight: 600;
      color: var(--cv-navy);
    }
    .result__tag--on {
      color: var(--cv-muted);
    }
    .empty {
      margin: -4px 0 12px;
      padding: 12px 14px;
      border: 1px dashed var(--cv-border-strong);
      border-radius: var(--cv-radius-lg);
      font-size: 13px;
      color: var(--cv-muted);
    }
    .count {
      margin: 4px 0 6px;
      font-size: 13px;
      font-weight: 600;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0 0 12px;
      padding: 0;
      list-style: none;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      max-width: 100%;
      padding: 4px 4px 4px 6px;
      border: 1px solid var(--cv-border-strong);
      border-radius: 999px;
      background: var(--cv-surface-alt);
      font-size: 13px;
    }
    .chip__no {
      display: grid;
      place-items: center;
      min-width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--cv-navy);
      color: #fff;
      font-size: 11px;
      font-weight: 600;
    }
    .chip__name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chip button {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--cv-muted);
      cursor: pointer;
    }
    .chip button:hover:not(:disabled) {
      background: var(--cv-border);
      color: inherit;
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
