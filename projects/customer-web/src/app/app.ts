import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './core/auth/auth.service';
import { ChatWidgetComponent } from './features/chat/components/chat-widget/chat-widget.component';
import { FloatingActionsComponent } from './layout/floating-actions/floating-actions.component';
import { FooterComponent } from './layout/footer/footer.component';
import { HeaderComponent } from './layout/header/header.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, FooterComponent, FloatingActionsComponent, ChatWidgetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly auth = inject(AuthService);
  protected readonly isAuthRoute = signal(this.router.url.startsWith('/auth'));

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        this.isAuthRoute.set(event.urlAfterRedirects.startsWith('/auth'));
      });
  }
}
