import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

export interface FilterOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-filter-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="cv-dropdown">
      <button
        type="button"
        class="cv-chip"
        [class.cv-chip--active]="value() !== 'ALL'"
        [attr.aria-expanded]="open()"
        aria-haspopup="listbox"
        (click)="toggle()"
      >
        <span>{{ display() }}</span>
        @if (value() !== 'ALL') {
          <span class="cv-chip__count">1</span>
        }
        <app-icon name="chevron-down" size="sm" />
      </button>
      @if (open()) {
        <div class="cv-menu" role="listbox">
          @for (option of options(); track option.value) {
            <button
              type="button"
              class="cv-menu__item"
              [class.cv-menu__item--active]="option.value === value()"
              role="option"
              [attr.aria-selected]="option.value === value()"
              (click)="pick(option.value)"
            >
              {{ option.label }}
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class FilterChipComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly label = input.required<string>();
  readonly options = input.required<FilterOption[]>();
  readonly value = input('ALL');

  readonly valueChange = output<string>();
  readonly open = signal(false);

  readonly display = computed(() => {
    const current = this.options().find((option) => option.value === this.value());
    return current ? `${this.label()}: ${current.label}` : this.label();
  });

  toggle(): void {
    this.open.update((value) => !value);
  }

  pick(value: string): void {
    this.valueChange.emit(value);
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }
}
