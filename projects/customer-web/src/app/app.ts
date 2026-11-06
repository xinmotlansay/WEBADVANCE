import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AiChatBarComponent } from './features/chat/components/ai-chat-bar/ai-chat-bar.component';
import { ChatWidgetComponent } from './features/chat/components/chat-widget/chat-widget.component';
import { FloatingActionsComponent } from './layout/floating-actions/floating-actions.component';
import { FooterComponent } from './layout/footer/footer.component';
import { HeaderComponent } from './layout/header/header.component';
import { ToastComponent } from './layout/toast/toast.component';
import { ConfirmComponent } from './layout/confirm/confirm.component';
import { VariantPickerService } from './services/cart/variant-picker.service';
import { VariantPickerComponent } from './shared/ui/variant-picker/variant-picker.component';
import { SearchUiService } from './services/search/search-ui.service';
import { ImageSearchComponent } from './features/image-search/image-search.component';
import { IconComponent } from './shared/ui/icons/icon.component';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    HeaderComponent,
    FooterComponent,
    FloatingActionsComponent,
    AiChatBarComponent,
    ChatWidgetComponent,
    VariantPickerComponent,
    ToastComponent,
    ConfirmComponent,
    ImageSearchComponent,
    IconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly router = inject(Router);
  protected readonly picker = inject(VariantPickerService);
  protected readonly search = inject(SearchUiService);
  private readonly imageDialog = viewChild<ElementRef<HTMLDialogElement>>('imageDialog');

  constructor() {
    // Đổi trang thì đóng popup tìm bằng hình ảnh.
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) this.search.imageOpen.set(false);
    });
    effect((onCleanup) => {
      if (!this.search.imageOpen()) return;
      const dialog = this.imageDialog()?.nativeElement;
      if (!dialog) return;
      const previousFocus = document.activeElement as HTMLElement | null;
      const body = document.body;
      const previousStyles = {
        overflow: body.style.overflow,
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        width: body.style.width,
      };
      const scroll = { left: window.scrollX, top: window.scrollY, behavior: 'instant' as const };
      Object.assign(body.style, {
        overflow: 'hidden',
        position: 'fixed',
        top: `-${scroll.top}px`,
        left: `-${scroll.left}px`,
        width: '100%',
      });
      dialog.showModal();
      onCleanup(() => {
        dialog.close();
        Object.assign(body.style, previousStyles);
        previousFocus?.focus({ preventScroll: true });
        window.scrollTo(scroll);
      });
    });
  }

  /** Bấm ra ngoài khung popup thì đóng. */
  protected onImageDialogClick(event: MouseEvent): void {
    const dialog = this.imageDialog()?.nativeElement;
    if (!dialog || event.target !== dialog) return;
    const b = dialog.getBoundingClientRect();
    if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) {
      this.search.imageOpen.set(false);
    }
  }

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

  /** Trang View your Room có header và thanh tổng quan riêng nên ẩn header chung và hai nút Search/AI. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.split(/[?#]/)[0]),
    ),
    { initialValue: this.router.url.split(/[?#]/)[0] },
  );
  protected readonly isViewYourRoom = computed(() => this.url() === '/view-your-room');
  protected readonly showHeader = computed(() => !this.compact() && !this.isViewYourRoom());
}
