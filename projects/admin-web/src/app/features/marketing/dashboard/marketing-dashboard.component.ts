import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import { LineChartComponent } from '../shared/line-chart.component';
import { money } from '../vouchers/voucher-format';
import {
  DashboardApi,
  type DashboardData,
  type EffectivenessData,
  type Metric,
  type RangeKey,
} from './dashboard.api';

const RANGES: { key: RangeKey; label: string; hint: string }[] = [
  { key: 'today', label: 'Hôm nay', hint: 'hôm nay' },
  { key: '7d', label: '7 ngày', hint: '7 ngày gần nhất' },
  { key: '30d', label: '30 ngày', hint: '30 ngày gần nhất' },
  { key: 'month', label: 'Tháng này', hint: 'tháng này' },
  { key: 'custom', label: 'Tùy chọn', hint: 'khoảng đã chọn' },
];

const POSITION_LABEL: Record<string, string> = {
  HOME_SLIDER: 'Trang chủ (slider)',
  HOME_MIDDLE: 'Trang chủ (giữa)',
  CATEGORY: 'Danh mục',
  POPUP: 'Popup',
};

type Load<T> =
  { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: T };

/** FR-MKT_AD-002 (phần khuyến mãi & mã giảm giá): thẻ trạng thái, chỉ số theo kỳ, Top 5, cần chú ý, hiệu quả chi tiết. */
@Component({
  selector: 'app-marketing-dashboard',
  imports: [FormsModule, RouterLink, LineChartComponent],
  templateUrl: './marketing-dashboard.component.html',
  styleUrl: './marketing-dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketingDashboardComponent {
  private readonly api = inject(DashboardApi);

  protected readonly RANGES = RANGES;
  protected readonly money = money;
  protected readonly positionLabel = POSITION_LABEL;

  protected readonly range = signal<RangeKey>('7d');
  protected from = '';
  protected to = '';
  protected readonly rangeError = signal('');
  protected readonly main = signal<Load<DashboardData>>({ state: 'loading' });
  protected readonly detail = signal<Load<EffectivenessData>>({ state: 'loading' });

  protected readonly hint = computed(() => RANGES.find((r) => r.key === this.range())!.hint);
  protected readonly bannerTotal = computed(() => {
    const m = this.main();
    return m.state === 'ready' ? Object.values(m.data.cards.banners).reduce((a, b) => a + b, 0) : 0;
  });
  protected readonly topVoucherMax = computed(() => {
    const m = this.main();
    return m.state === 'ready' ? Math.max(1, ...m.data.top.vouchers.map((v) => v.uses)) : 1;
  });
  protected readonly topPromoMax = computed(() => {
    const m = this.main();
    return m.state === 'ready' ? Math.max(1, ...m.data.top.promotions.map((p) => p.revenue)) : 1;
  });

  constructor() {
    void this.reload();
    // Thẻ trạng thái tự làm mới mỗi 60 giây (FR-002).
    const timer = setInterval(() => void this.loadMain(), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  private query() {
    return { range: this.range(), from: this.from, to: this.to };
  }

  protected setRange(key: RangeKey): void {
    this.range.set(key);
    if (key !== 'custom') void this.reload();
  }

  protected applyCustom(): void {
    const today = new Date().toISOString().slice(0, 10);
    const days = (Date.parse(this.to) - Date.parse(this.from)) / 86_400_000;
    if (!this.from || !this.to || this.from > this.to || this.to > today || days >= 366) {
      this.rangeError.set(
        'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc, không ở tương lai và tối đa 366 ngày.',
      );
      return;
    }
    this.rangeError.set('');
    void this.reload();
  }

  protected reload(): Promise<unknown> {
    return Promise.all([this.loadMain(true), this.loadDetail()]);
  }

  protected async loadMain(showLoading = false): Promise<void> {
    if (showLoading) this.main.set({ state: 'loading' });
    try {
      this.main.set({
        state: 'ready',
        data: await firstValueFrom(this.api.dashboard(this.query())),
      });
    } catch (e) {
      if (showLoading || this.main().state !== 'ready') {
        this.main.set({ state: 'error', message: parseApiError(e).message });
      }
    }
  }

  protected async loadDetail(): Promise<void> {
    this.detail.set({ state: 'loading' });
    try {
      this.detail.set({
        state: 'ready',
        data: await firstValueFrom(this.api.effectiveness(this.query())),
      });
    } catch (e) {
      this.detail.set({ state: 'error', message: parseApiError(e).message });
    }
  }

  protected pct(n: number | null): string {
    return n == null ? '—' : `${(n * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
  }

  protected delta(m: Metric): { text: string; cls: string } {
    if (m.change == null) return { text: 'Chưa có số liệu kỳ trước', cls: '' };
    const arrow = m.change > 0 ? '▲' : m.change < 0 ? '▼' : '';
    return {
      text: `${arrow} ${Math.abs(m.change).toLocaleString('vi-VN')}% so với kỳ trước`.trim(),
      cls: m.change > 0 ? 'cv-delta--up' : m.change < 0 ? 'cv-delta--down' : '',
    };
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }

  protected shortDay(d: string): string {
    return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  }

  protected usePoints(d: EffectivenessData) {
    return d.daily.map((x) => ({ label: this.shortDay(x.date), value: x.voucherUses }));
  }
  protected revenuePoints(d: EffectivenessData) {
    return d.daily.map((x) => ({ label: this.shortDay(x.date), value: x.revenue }));
  }

  /** Xuất CSV khối hiệu quả chi tiết; số liệu lấy đúng từ dữ liệu đang hiển thị. */
  protected exportCsv(d: EffectivenessData): void {
    const cell = (v: string | number): string => {
      const t = String(v);
      return `"${(/^[=+\-@]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
    };
    const row = (cells: (string | number)[]) => cells.map(cell).join(',');
    const lines = [
      row(['Theo chương trình']),
      row([
        'Mã KM',
        'Tên',
        'Số đơn',
        'Số sản phẩm bán',
        'Tổng tiền giảm',
        'Doanh thu',
        'Tỷ lệ hủy',
      ]),
      ...d.byPromotion.map((r) =>
        row([r.code, r.name, r.orders, r.units, r.discount, r.revenue, this.pct(r.cancelRate)]),
      ),
      '',
      row(['Theo mã giảm giá']),
      row([
        'Mã',
        'Lượt dùng trong kỳ',
        'Lượt hoàn do hủy đơn',
        'Khách mới',
        'Tổng tiền giảm',
        'Doanh thu',
      ]),
      ...d.byVoucher.map((r) =>
        row([r.code, r.uses, r.refunded, r.newCustomers, r.discount, r.revenue]),
      ),
      '',
      row(['Theo ngày']),
      row(['Ngày', 'Số đơn có ưu đãi', 'Lượt dùng mã', 'Tổng tiền giảm', 'Doanh thu']),
      ...d.daily.map((r) => row([r.date, r.orders, r.voucherUses, r.discount, r.revenue])),
    ];
    try {
      const url = URL.createObjectURL(
        new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }),
      );
      Object.assign(document.createElement('a'), {
        href: url,
        download: 'HieuQuaMarketing.csv',
      }).click();
      URL.revokeObjectURL(url);
    } catch {
      this.rangeError.set('Xuất file không thành công. Vui lòng thử lại.');
    }
  }
}
