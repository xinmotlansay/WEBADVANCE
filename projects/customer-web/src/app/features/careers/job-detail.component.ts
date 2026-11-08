import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogApiService, JOB_LEVEL_LABELS, JOB_TYPE_LABELS } from 'shared';
import { catchError, map, of, switchMap } from 'rxjs';

@Component({
  selector: 'app-job-detail',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './job-detail.component.html',
  styleUrl: './job-detail.component.css',
})
export class JobDetailComponent {
  private readonly api = inject(CatalogApiService);

  protected readonly typeLabels = JOB_TYPE_LABELS;
  protected readonly levelLabels = JOB_LEVEL_LABELS;

  /** undefined: đang tải; null: không còn nhận hồ sơ. */
  protected readonly job = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      map((p) => p.get('slug') ?? ''),
      switchMap((slug) => this.api.getJob(slug).pipe(catchError(() => of(null)))),
    ),
  );

  private readonly store = toSignal(this.api.getPublicConfig().pipe(map((c) => c.store), catchError(() => of(null))), { initialValue: null });

  /** Ứng viên gửi hồ sơ qua email cửa hàng; chưa cấu hình email thì chỉ hiện hotline. */
  protected readonly applyHref = computed(() => {
    const email = this.store()?.email;
    const job = this.job();
    if (!email || !job) return null;
    return `mailto:${email}?subject=${encodeURIComponent(`Ứng tuyển: ${job.title}`)}`;
  });
  protected readonly hotline = computed(() => this.store()?.hotline ?? '');

  protected formatDate(value: string): string {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
  }
}
