import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { FloatingActionsComponent } from './layout/floating-actions/floating-actions.component';
import { FooterComponent } from './layout/footer/footer.component';
import { HeaderComponent } from './layout/header/header.component';
import { ToastComponent } from './layout/toast/toast.component';
import { ConfirmComponent } from './layout/confirm/confirm.component';
import { VariantPickerService } from './core/cart/variant-picker.service';
import { VariantPickerComponent } from './shared/ui/variant-picker/variant-picker.component';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    HeaderComponent,
    FooterComponent,
    FloatingActionsComponent,
    VariantPickerComponent,
    ToastComponent,
    ConfirmComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly router = inject(Router);
  protected readonly picker = inject(VariantPickerService);

  /**
   * `data: { layout }` trên route: `'compact'` tự hiển thị header riêng, ẩn header và nút nổi chung;
   * `'solid'` dùng header chung nhưng nền trắng ngay từ đầu cho trang không có ảnh lớn đầu trang.
   */
  private readonly layout = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => {
        let route = this.router.routerState.snapshot.root;
        while (route.firstChild) route = route.firstChild;
        return route.data['layout'] as 'compact' | 'solid' | undefined;
      }),
    ),
  );
  protected readonly compact = computed(() => this.layout() === 'compact');
  protected readonly solid = computed(() => this.layout() === 'solid');
}
