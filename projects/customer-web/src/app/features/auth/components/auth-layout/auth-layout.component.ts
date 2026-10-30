import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Mục cuối là trang hiện tại nên không cần `link`. */
export interface AuthBreadcrumb {
  label: string;
  link?: string;
}

@Component({
  selector: 'app-auth-layout',
  imports: [RouterLink],
  templateUrl: './auth-layout.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthLayoutComponent {
  @Input({ required: true }) breadcrumbs: AuthBreadcrumb[] = [];
}
