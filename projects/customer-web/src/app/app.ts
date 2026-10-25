import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { NavigationStart, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { FloatingActionsComponent } from './layout/floating-actions/floating-actions.component';
import { FooterComponent } from './layout/footer/footer.component';
import { HeaderComponent } from './layout/header/header.component';
import { SearchUiService } from './core/search/search-ui.service';
import { ImageSearchComponent } from './features/image-search/image-search.component';
import { IconComponent } from './shared/ui/icons/icon.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, FooterComponent, FloatingActionsComponent, ImageSearchComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly search = inject(SearchUiService);
  private readonly imageDialog = viewChild<ElementRef<HTMLDialogElement>>('imageDialog');

  protected onImageDialogClick(event: MouseEvent): void {
    const dialog = this.imageDialog()?.nativeElement;
    if (!dialog || event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) {
      this.search.imageOpen.set(false);
    }
  }

  constructor() {
    inject(Router).events.pipe(
      filter((event) => event instanceof NavigationStart), takeUntilDestroyed(),
    ).subscribe(() => this.search.imageOpen.set(false));
    effect((onCleanup) => {
      if (!this.search.imageOpen()) return;
      const dialog = this.imageDialog()?.nativeElement;
      if (!dialog) return;
      const previousFocus = document.activeElement as HTMLElement | null;
      const body = document.body;
      const previousStyles = { overflow: body.style.overflow, position: body.style.position,
        top: body.style.top, left: body.style.left, width: body.style.width };
      const scrollPosition = { left: window.scrollX, top: window.scrollY, behavior: 'instant' as const };
      Object.assign(body.style, { overflow: 'hidden', position: 'fixed',
        top: `-${scrollPosition.top}px`, left: `-${scrollPosition.left}px`, width: '100%' });
      dialog.showModal();
      onCleanup(() => {
        dialog.close();
        Object.assign(body.style, previousStyles);
        previousFocus?.focus({ preventScroll: true });
        window.scrollTo(scrollPosition);
      });
    });
  }
}
