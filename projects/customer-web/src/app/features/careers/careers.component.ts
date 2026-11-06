import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { CatalogApiService, JOB_LEVEL_LABELS, JOB_TYPE_LABELS, type JobLevel, type JobListResult, type JobType } from 'shared';
import { catchError, debounceTime, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';

/** Trang Tuyển dụng: danh sách vị trí đang mở, lọc theo từ khóa, phòng ban, nơi làm việc, hình thức và cấp bậc. */
@Component({
  selector: 'app-careers',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './careers.component.html',
  styleUrl: './careers.component.css',
})
export class CareersComponent {
  private readonly api = inject(CatalogApiService);

  protected readonly typeLabels = JOB_TYPE_LABELS;
  protected readonly levelLabels = JOB_LEVEL_LABELS;
  protected readonly types = Object.entries(JOB_TYPE_LABELS) as [JobType, string][];
  protected readonly levels = Object.entries(JOB_LEVEL_LABELS) as [JobLevel, string][];

  protected readonly keyword = signal('');
  protected readonly department = signal('');
  protected readonly city = signal('');
  protected readonly type = signal<JobType | ''>('');
  protected readonly level = signal<JobLevel | ''>('');

  protected readonly hasFilters = computed(
    () => !!(this.keyword() || this.department() || this.city() || this.type() || this.level()),
  );

  private readonly query = computed(() => ({
    q: this.keyword().trim(),
    department: this.department(),
    city: this.city(),
    type: this.type(),
    level: this.level(),
  }));

  /** undefined: đang tải; null: lỗi. Từ khóa đợi người dùng gõ xong mới gọi. */
  protected readonly result = toSignal(
    toObservable(this.query).pipe(
      debounceTime(250),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      switchMap((q) =>
        this.api.getJobs({ ...q, type: q.type || undefined, level: q.level || undefined }).pipe(
          map((r): JobListResult | null => r),
          catchError(() => of(null)),
          startWith(undefined),
        ),
      ),
    ),
    { initialValue: undefined },
  );

  /** Giữ danh sách lọc từ lần tải đầu để các ô chọn không đổi khi bộ lọc đang áp dụng. */
  private readonly lastFilters = signal<JobListResult['filters']>({ departments: [], cities: [] });
  protected readonly filters = computed(() => {
    const r = this.result();
    return r ? r.filters : this.lastFilters();
  });

  constructor() {
    // Cập nhật danh sách lọc mỗi khi có kết quả mới.
    // Đổi bộ lọc thì quay về trang đầu.
    effect(() => {
      this.query();
      this.page.set(1);
    });
    effect(() => {
      const r = this.result();
      if (r) this.lastFilters.set(r.filters);
    });
  }

  protected readonly pageSize = 6;
  protected readonly page = signal(1);

  /** Chỉ lấy phần của trang hiện tại; về trang 1 mỗi khi bộ lọc đổi. */
  protected readonly pageJobs = computed(() => {
    const jobs = this.result()?.jobs ?? [];
    return jobs.slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize);
  });
  protected readonly pageCount = computed(() => Math.max(1, Math.ceil((this.result()?.jobs.length ?? 0) / this.pageSize)));
  protected readonly pages = computed(() => Array.from({ length: this.pageCount() }, (_, i) => i + 1));

  protected readonly highlights = [
    { title: 'Lộ trình thăng tiến rõ ràng', text: 'Mỗi vị trí có tiêu chí lên cấp cụ thể, được đánh giá và trao đổi cùng quản lý theo từng quý.' },
    { title: 'Học hỏi từ người làm nghề lâu năm', text: 'Làm việc cùng đội thiết kế, vận hành và bán hàng có nhiều năm kinh nghiệm trong ngành nội thất.' },
    { title: 'Văn hóa chia sẻ', text: 'Mọi ý tưởng đều được lắng nghe; kiến thức và kinh nghiệm được chia sẻ cởi mở giữa các phòng ban.' },
    { title: 'Ưu đãi cho người nhà CaraVeso', text: 'Giá nhân viên khi mua sản phẩm, thưởng theo hiệu quả và chế độ bảo hiểm đầy đủ.' },
    { title: 'Hoạt động kết nối', text: 'Tham quan showroom, workshop và hoạt động nội bộ giúp phát triển kỹ năng và gắn kết đội nhóm.' },
  ];

  protected readonly culture = [
    { value: 'Thiết kế', text: 'Mỗi sản phẩm được cân nhắc từ công năng đến thẩm mỹ.' },
    { value: 'Tận tâm', text: 'Chúng tôi giao và lắp đặt tận nơi, bảo hành dài lâu.' },
    { value: 'Chia sẻ', text: 'Làm việc nhóm và học hỏi lẫn nhau là nếp quen hằng ngày.' },
  ];

  protected goTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected setPage(n: number): void {
    this.page.set(n);
    this.goTo('co-hoi');
  }

  protected clear(): void {
    this.keyword.set('');
    this.department.set('');
    this.city.set('');
    this.type.set('');
    this.level.set('');
  }

  protected daysLeft(deadline: string | null): number | null {
    if (!deadline) return null;
    const end = new Date(`${deadline}T23:59:59`).getTime();
    return Math.ceil((end - Date.now()) / 86_400_000);
  }
}
