import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogApiService } from 'shared';
import { catchError, map, of, switchMap } from 'rxjs';

/** Bảo hành và đổi trả có thêm nút dẫn tới trang xử lý yêu cầu. */
const ACTIONS: Record<string, { label: string; view: string }> = {
  warranty: { label: 'Tra cứu và yêu cầu bảo hành', view: 'warranty' },
  returns: { label: 'Quản lý đổi trả', view: 'return' },
};

/** Danh mục trang chính sách ở cột bên trái, cùng thứ tự với chân trang. */
const POLICY_NAV = [
  { slug: 'shipping', label: 'Chính sách giao hàng' },
  { slug: 'returns', label: 'Chính sách đổi trả' },
  { slug: 'warranty', label: 'Chính sách bảo hành' },
  { slug: 'payment', label: 'Phương thức thanh toán' },
  { slug: 'terms', label: 'Điều khoản sử dụng' },
  { slug: 'privacy', label: 'Chính sách bảo mật' },
  { slug: 'membership', label: 'Chính sách thành viên' },
];

@Component({
  selector: 'app-policy',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './policy.component.html',
  styleUrl: './policy.component.css',
})
export class PolicyComponent {
  protected readonly nav = POLICY_NAV;
  protected readonly slug = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('slug') ?? '')), { initialValue: '' });
  private readonly slug$ = inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('slug') ?? ''));
  private readonly api = inject(CatalogApiService);

  /** undefined: đang tải; null: lỗi hoặc không có trang. */
  protected readonly page = toSignal(
    this.slug$.pipe(switchMap((slug) => this.api.getPolicyPage(slug).pipe(catchError(() => of(null))))),
  );
  protected readonly action = toSignal(this.slug$.pipe(map((slug) => ACTIONS[slug] ?? null)), { initialValue: null });
}
