import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import {
  ScheduleApi,
  TYPE_LABEL,
  type ScheduleEvent,
  type ScheduleType,
} from '../../../services/marketing/schedule.service';
import { PublishDialogComponent, type PublishChoice } from '../shared/publish-dialog.component';

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const TYPES = Object.keys(TYPE_LABEL) as ScheduleType[];
const MAX_CHIPS = 3;

interface Cell {
  date: Date;
  key: string;
  inMonth: boolean;
  today: boolean;
  events: ScheduleEvent[];
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Lịch đăng kiểu Meta Business Suite: xem nội dung đã lên lịch theo tháng hoặc danh sách, đổi giờ, hủy lịch. */
@Component({
  selector: 'app-publish-calendar',
  imports: [DatePipe, RouterLink, PublishDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './publish-calendar.component.html',
  styleUrl: './publish-calendar.component.css',
})
export class PublishCalendarComponent {
  private readonly api = inject(ScheduleApi);

  protected readonly WEEKDAYS = WEEKDAYS;
  protected readonly TYPES = TYPES;
  protected readonly TYPE_LABEL = TYPE_LABEL;
  protected readonly MAX_CHIPS = MAX_CHIPS;

  protected readonly month = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  protected readonly view = signal<'month' | 'list'>('month');
  protected readonly hidden = signal<ReadonlySet<ScheduleType>>(new Set());
  protected readonly events = signal<ScheduleEvent[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly selected = signal<ScheduleEvent | null>(null);
  protected readonly rescheduling = signal<ScheduleEvent | null>(null);
  protected readonly busy = signal(false);
  protected readonly dialogError = signal('');

  protected readonly stateFilter = signal<'ALL' | 'SCHEDULED' | 'PUBLISHED'>('ALL');

  /** Chỉ tính các mục nằm trong tháng đang xem (dữ liệu tải thêm một tuần hai đầu). */
  private readonly inMonth = computed(() => {
    const m = this.month();
    return this.events().filter((e) => {
      const d = new Date(e.at);
      return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth() && !this.hidden().has(e.type);
    });
  });
  protected readonly counts = computed(() => ({
    published: this.inMonth().filter((e) => e.state === 'PUBLISHED').length,
    scheduled: this.inMonth().filter((e) => e.state === 'SCHEDULED').length,
  }));

  protected readonly visible = computed(() =>
    this.events().filter((e) => !this.hidden().has(e.type) && (this.stateFilter() === 'ALL' || e.state === this.stateFilter())),
  );

  protected readonly title = computed(() => {
    const m = this.month();
    return `Tháng ${m.getMonth() + 1}, ${m.getFullYear()}`;
  });

  protected readonly cells = computed<Cell[]>(() => {
    const m = this.month();
    const first = new Date(m.getFullYear(), m.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // tuần bắt đầu từ thứ Hai
    const start = new Date(first);
    start.setDate(1 - offset);
    const byDay = new Map<string, ScheduleEvent[]>();
    for (const e of this.visible()) {
      const k = dayKey(new Date(e.at));
      byDay.set(k, [...(byDay.get(k) ?? []), e]);
    }
    const todayKey = dayKey(new Date());
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const key = dayKey(date);
      return { date, key, inMonth: date.getMonth() === m.getMonth(), today: key === todayKey, events: byDay.get(key) ?? [] };
    });
  });

  /** Chỉ hiện 5 hoặc 6 hàng tuần có trong tháng. */
  protected readonly rows = computed(() => {
    const cells = this.cells();
    return cells[35]!.inMonth ? cells : cells.slice(0, 35);
  });

  protected readonly grouped = computed(() => {
    const groups: { label: Date; events: ScheduleEvent[] }[] = [];
    for (const e of this.visible()) {
      const d = new Date(e.at);
      const last = groups.at(-1);
      if (last && dayKey(last.label) === dayKey(d)) last.events.push(e);
      else groups.push({ label: d, events: [e] });
    }
    return groups;
  });

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    const m = this.month();
    // Lấy dư một tuần hai đầu để các ô thuộc tháng liền kề cũng có dữ liệu.
    const from = new Date(m.getFullYear(), m.getMonth(), -6);
    const to = new Date(m.getFullYear(), m.getMonth() + 1, 8);
    try {
      this.events.set(await firstValueFrom(this.api.list(from, to)));
    } catch (e) {
      this.error.set(parseApiError(e).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected shift(delta: number): void {
    const m = this.month();
    this.month.set(new Date(m.getFullYear(), m.getMonth() + delta, 1));
    this.selected.set(null);
    void this.reload();
  }

  protected today(): void {
    const n = new Date();
    this.month.set(new Date(n.getFullYear(), n.getMonth(), 1));
    this.selected.set(null);
    void this.reload();
  }

  protected toggleType(t: ScheduleType): void {
    const next = new Set(this.hidden());
    if (!next.delete(t)) next.add(t);
    this.hidden.set(next);
  }

  protected select(e: ScheduleEvent): void {
    this.selected.set(this.selected()?.key === e.key ? null : e);
  }

  protected openReschedule(e: ScheduleEvent): void {
    this.dialogError.set('');
    this.rescheduling.set(e);
  }

  protected async confirmReschedule(choice: PublishChoice): Promise<void> {
    const e = this.rescheduling();
    if (!e || !choice.publishAt) return;
    this.busy.set(true);
    this.dialogError.set('');
    try {
      await firstValueFrom(this.api.reschedule(e.type, e.id, choice.publishAt));
      this.rescheduling.set(null);
      this.selected.set(null);
      await this.reload();
    } catch (err) {
      this.dialogError.set(parseApiError(err).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async cancel(e: ScheduleEvent): Promise<void> {
    if (!confirm(`Hủy lịch đăng "${e.title}"? Nội dung sẽ quay về trạng thái chưa đăng, không bị xóa.`)) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.api.cancel(e.type, e.id));
      this.selected.set(null);
      await this.reload();
    } catch (err) {
      this.error.set(parseApiError(err).message);
    } finally {
      this.busy.set(false);
    }
  }
}
