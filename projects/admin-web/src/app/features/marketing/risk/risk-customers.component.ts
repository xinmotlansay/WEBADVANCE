import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import { SparklineComponent } from '../shared/mini-charts.component';
import { dateTime, money } from '../vouchers/voucher-format';
import {
  InsightsApi,
  type CampaignReport,
  type CampaignRow,
  type Insights,
  type Segment,
  type SegmentInsight,
  type VoucherPreview,
} from '../../../services/marketing/insights.service';

/** Thứ tự hiển thị: hàng trên = nguy cơ rời bỏ cao, hàng dưới = thấp; cột trái = CLV thấp, cột phải = CLV cao. */
const GRID: Segment[] = ['NO_SPEND', 'RETAIN', 'LET_BE', 'NURTURE'];

const META: Record<Segment, { title: string; axis: string; action: string }> = {
  RETAIN: {
    title: 'Giữ ngay',
    axis: 'Nguy cơ rời bỏ cao · CLV cao',
    action:
      'Chỉ phát voucher cho khách có lãi kỳ vọng dương; số còn lại để tự nhiên. Nhóm đối chứng được giữ lại để đo hiệu quả.',
  },
  NURTURE: {
    title: 'Chăm sóc, không giảm giá',
    axis: 'Nguy cơ rời bỏ thấp · CLV cao',
    action: 'Gửi nội dung, sản phẩm mới, nhắc lịch mua. Không giảm giá vì khách vẫn sẽ mua.',
  },
  NO_SPEND: {
    title: 'Không chi tiền',
    axis: 'Nguy cơ rời bỏ cao · CLV thấp',
    action: 'Không đầu tư thêm. Chỉ dùng kênh không tốn chi phí như email định kỳ.',
  },
  LET_BE: {
    title: 'Để tự nhiên',
    axis: 'Nguy cơ rời bỏ thấp · CLV thấp',
    action: 'Không can thiệp.',
  },
};

type Load<T> =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; data: T };

/** FR-MKT_AD: "Khách hàng rủi ro". Chỉ số tổng hợp theo ô, không có danh tính khách (RST-05, MA-09). */
@Component({
  selector: 'app-risk-customers',
  imports: [FormsModule, SparklineComponent],
  templateUrl: './risk-customers.component.html',
  styleUrl: './risk-customers.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RiskCustomersComponent {
  private readonly api = inject(InsightsApi);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly money = money;
  protected readonly dateTime = dateTime;
  protected readonly META = META;

  protected readonly data = signal<Load<Insights>>({ state: 'loading' });
  protected readonly campaigns = signal<Load<CampaignReport>>({ state: 'loading' });
  protected readonly rescoring = signal(false);
  protected readonly notice = signal('');
  protected readonly actionError = signal('');

  /** Ô theo vị trí trên lưới 2×2. */
  protected readonly cells = computed<SegmentInsight[]>(() => {
    const d = this.data();
    return d.state === 'ready' ? GRID.map((s) => d.data.segments.find((x) => x.segment === s)!) : [];
  });
  protected readonly highRisk = computed(() =>
    this.cells()
      .filter((c) => c.segment === 'RETAIN' || c.segment === 'NO_SPEND')
      .reduce((s, c) => s + c.customers, 0),
  );
  protected readonly retain = computed(() => this.cells().find((c) => c.segment === 'RETAIN'));

  // Form voucher (ô Giữ ngay)
  protected discountPercent = 10;
  protected maxDiscountValue = 200_000;
  protected minOrderValue = 0;
  protected validDays = 14;
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  /** Xem trước người nhận ở mức giảm đang nhập; null khi đang tải hoặc mức giảm không hợp lệ. */
  protected readonly preview = signal<VoucherPreview | null>(null);
  protected readonly previewError = signal('');
  protected readonly curveNet = computed(() => this.preview()?.curve.map((c) => c.expectedNet) ?? []);
  /** Mức 5–30% có Σnet lớn nhất; null khi không mức nào có lãi. */
  protected readonly bestIndex = computed(() => {
    const v = this.curveNet();
    const i = v.indexOf(Math.max(...v));
    return i >= 0 && v[i] > 0 ? i : null;
  });
  protected readonly bestPct = computed(() => {
    const i = this.bestIndex();
    return i === null ? null : this.preview()!.curve[i].pct;
  });
  protected readonly currentIndex = computed(() => {
    const p = this.preview();
    const i = p ? p.curve.findIndex((c) => c.pct === p.discountPercent) : -1;
    return i >= 0 ? i : null;
  });
  protected readonly saveRate = computed(() => {
    const c = this.campaigns();
    return c.state === 'ready' ? c.data.saveRate : null;
  });
  /** Lý do chưa cho dùng ŝ; null = dùng được. */
  protected readonly measuredBlocked = computed(() => {
    const sr = this.saveRate();
    if (!sr?.measured || !sr.enoughSample) return 'Cần ≥ 30 khách mỗi nhóm.';
    if (!sr.measured.significant) return 'Chênh lệch chưa có ý nghĩa thống kê.';
    return null;
  });
  protected readonly useMeasured = signal(false);
  private previewSeq = 0;
  private opener: HTMLElement | null = null;

  constructor() {
    void this.load();
  }

  protected maxCustomers(): number {
    return Math.max(1, ...this.cells().map((c) => c.customers));
  }

  protected pct(n: number): string {
    return `${(n * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
  }

  protected async load(): Promise<void> {
    this.data.set({ state: 'loading' });
    this.campaigns.set({ state: 'loading' });
    try {
      this.data.set({ state: 'ready', data: await firstValueFrom(this.api.insights()) });
    } catch (e) {
      this.data.set({ state: 'error', message: parseApiError(e).message });
    }
    try {
      this.campaigns.set({ state: 'ready', data: await firstValueFrom(this.api.campaigns()) });
    } catch (e) {
      this.campaigns.set({ state: 'error', message: parseApiError(e).message });
    }
  }

  protected async rescore(): Promise<void> {
    this.rescoring.set(true);
    this.actionError.set('');
    this.notice.set('');
    try {
      const r = await firstValueFrom(this.api.rescore());
      this.notice.set(`Đã chấm lại ${r.scored.toLocaleString('vi-VN')} khách.`);
      await this.load();
    } catch (e) {
      this.actionError.set(parseApiError(e).message);
    } finally {
      this.rescoring.set(false);
    }
  }

  protected openVoucher(event: Event): void {
    this.opener = event.currentTarget as HTMLElement;
    this.discountPercent = this.retain()?.suggestedDiscountPct ?? 12;
    this.formError.set('');
    this.dialog()?.nativeElement.showModal();
    void this.loadPreview();
  }

  /** Gọi lại khi mức giảm đổi; chỉ giữ kết quả của lần gọi mới nhất. */
  protected async loadPreview(): Promise<void> {
    const pct = Number(this.discountPercent);
    const saveRate = this.chosenSaveRate();
    const seq = ++this.previewSeq;
    this.preview.set(null);
    this.previewError.set('');
    if (!Number.isInteger(pct) || pct < 1 || pct > 90) return;
    try {
      const p = await firstValueFrom(this.api.voucherPreview(pct, saveRate));
      if (seq === this.previewSeq) this.preview.set(p);
    } catch (e) {
      if (seq === this.previewSeq) this.previewError.set(parseApiError(e).message);
    }
  }

  /** ŝ khi đã chọn "Dùng s đo được" và đủ điều kiện; còn lại để server dùng giả định 30%. */
  private chosenSaveRate(): number | undefined {
    return this.useMeasured() && !this.measuredBlocked() ? this.saveRate()!.measured!.s : undefined;
  }

  protected toggleMeasured(on: boolean): void {
    this.useMeasured.set(on);
    void this.loadPreview();
  }

  protected closeVoucher(): void {
    this.dialog()?.nativeElement.close();
    this.opener?.focus();
  }

  protected async submitVoucher(): Promise<void> {
    this.formError.set('');
    if (this.maxDiscountValue % 1000 !== 0) {
      this.formError.set('Mức giảm tối đa phải là bội số của 1.000 ₫.');
      return;
    }
    this.saving.set(true);
    try {
      const r = await firstValueFrom(
        this.api.createRetainVoucher({
          discountPercent: this.discountPercent,
          maxDiscountValue: this.maxDiscountValue,
          minOrderValue: this.minOrderValue,
          validDays: this.validDays,
          saveRate: this.chosenSaveRate(),
        }),
      );
      this.closeVoucher();
      this.notice.set(
        `Đã tạo mã ${r.code} và gửi cho ${r.recipients.toLocaleString('vi-VN')} khách, hạn ${dateTime(r.endDate)}.`,
      );
      await this.load();
    } catch (e) {
      this.formError.set(parseApiError(e).message);
    } finally {
      this.saving.set(false);
    }
  }

  /** "+12.300.000 ₫" / "−4.000 ₫". */
  protected signedMoney(x: number): string {
    return `${x > 0 ? '+' : x < 0 ? '−' : ''}${money(Math.abs(x))}`;
  }

  protected leadText(c: CampaignRow): string {
    if (c.liftPoints === null) return 'Chưa đủ dữ liệu';
    const text = `${signed(c.liftPoints)} điểm`;
    return c.liftCI ? `${text} (${signed(c.liftCI[0])} đến ${signed(c.liftCI[1])})` : text;
  }
}

/** "+4,2" / "−1,0" (dấu trừ thật), một chữ số thập phân. */
function signed(x: number): string {
  const s = Math.abs(x).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return s === '0,0' ? s : `${x > 0 ? '+' : '−'}${s}`;
}
