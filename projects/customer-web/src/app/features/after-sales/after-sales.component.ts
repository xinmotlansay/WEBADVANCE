import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, startWith, switchMap } from 'rxjs';
import { CatalogApiService, WarrantyService } from 'shared';
import { AuthService } from '../../services/auth/auth.service';
import { IconComponent } from '../../shared/ui/icons/icon.component';
import { SupportIntroComponent } from './support-intro.component';
import { SupportRequestPanelComponent } from './support-request-panel.component';

type RequestKind = 'warranty' | 'return';

/**
 * Trang gửi yêu cầu bảo hành / đổi trả: chọn loại yêu cầu → tìm hoặc chọn sản phẩm đã mua →
 * nhập form. Theo dõi yêu cầu nằm ở Tài khoản › Dịch vụ hậu mãi.
 */
@Component({
  selector: 'app-after-sales',
  imports: [RouterLink, IconComponent, SupportIntroComponent, SupportRequestPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './after-sales.component.html',
  styleUrl: './after-sales.component.css',
})
export class AfterSalesComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly warranty = inject(WarrantyService);

  protected readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  /** Khung yêu cầu xổ xuống, lưu trên URL để mở thẳng được (cả link cũ `?view=`). */
  protected readonly panel = computed<RequestKind | null>(() => {
    const panel = this.params().get('panel') ?? this.params().get('view');
    return panel === 'warranty' || panel === 'return' ? panel : null;
  });
  protected readonly config = toSignal(
    inject(CatalogApiService)
      .getPublicConfig()
      .pipe(catchError(() => of(null))),
  );
  /** Phiếu bảo hành của khách; `undefined` đang tải, `null` tải lỗi hoặc chưa đăng nhập. */
  protected readonly cards = toSignal(
    toObservable(this.auth.user).pipe(
      switchMap((user) =>
        user
          ? this.warranty.cards().pipe(catchError(() => of(null)), startWith(undefined))
          : of(null),
      ),
    ),
  );

  protected togglePanel(kind: RequestKind): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: null, panel: this.panel() === kind ? null : kind, card: null },
      queryParamsHandling: 'merge',
    });
  }

  protected onCreated(kind: RequestKind, id: string): void {
    void this.router.navigate(['/support/success'], { queryParams: { kind, request: id } });
  }
}
