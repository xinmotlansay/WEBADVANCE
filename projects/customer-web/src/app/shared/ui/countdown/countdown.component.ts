import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';

const SECOND_MS = 1000;
const MINUTE_S = 60;
const HOUR_S = 60 * MINUTE_S;
const DAY_S = 24 * HOUR_S;

/** Đồng hồ đếm ngược đến `endDate` (chuỗi ISO 8601). */
@Component({
  selector: 'app-countdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './countdown.component.html',
  styleUrl: './countdown.component.css',
  host: { '[class.countdown--large]': "size() === 'large'" },
})
export class CountdownComponent {
  readonly endDate = input.required<string>();
  readonly size = input<'small' | 'large'>('small');

  private readonly now = signal(Date.now());

  protected readonly units = computed(() => {
    const end = new Date(this.endDate()).getTime();
    const seconds = Math.max(0, Math.floor((end - this.now()) / SECOND_MS));
    const pad = (n: number): string => String(n).padStart(2, '0');
    return [
      { label: 'NGÀY', value: pad(Math.floor(seconds / DAY_S)) },
      { label: 'GIỜ', value: pad(Math.floor((seconds % DAY_S) / HOUR_S)) },
      { label: 'PHÚT', value: pad(Math.floor((seconds % HOUR_S) / MINUTE_S)) },
      { label: 'GIÂY', value: pad(seconds % MINUTE_S) },
    ];
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), SECOND_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
