import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { CatalogApiService, type PublicConfig } from 'shared';
import { catchError, map, of } from 'rxjs';
import { IconComponent } from '../../shared/ui/icons/icon.component';

interface FooterLink {
  label: string;
  path: string;
}

@Component({
  selector: 'app-footer',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css',
})
export class FooterComponent {
  private readonly api = inject(CatalogApiService);

  protected readonly store = toSignal(
    this.api.getPublicConfig().pipe(
      map((config: PublicConfig) => config.store),
      catchError(() => of(null)),
    ),
    { initialValue: null },
  );

  protected readonly year = new Date().getFullYear();

  protected readonly infoLinks: FooterLink[] = [
    { label: 'Câu hỏi thường gặp', path: '/faq' },
    { label: 'Hướng dẫn mua hàng', path: '/guides/purchase' },
    { label: 'Chính sách giao hàng', path: '/policies/shipping' },
    { label: 'Chính sách đổi trả', path: '/policies/returns' },
    { label: 'Chính sách bảo hành', path: '/policies/warranty' },
    { label: 'Phương thức thanh toán', path: '/policies/payment' },
    { label: 'Điều khoản sử dụng', path: '/policies/terms' },
    { label: 'Chính sách bảo mật', path: '/policies/privacy' },
    { label: 'Chính sách thành viên', path: '/policies/membership' },
  ];

  protected readonly brandLinks: FooterLink[] = [
    { label: 'Về chúng tôi', path: '/about' },
    { label: 'Liên hệ', path: '/contact' },
    { label: 'Hệ thống showroom', path: '/showrooms' },
    { label: 'Blog & Cảm hứng sống', path: '/blog' },
    { label: 'Tuyển dụng', path: '/careers' },
  ];

  protected formatDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${pad(date.getUTCDate())} - ${pad(date.getUTCMonth() + 1)} - ${date.getUTCFullYear()}`;
  }
}
