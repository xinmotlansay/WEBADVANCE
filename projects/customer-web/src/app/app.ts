import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { ChatWidgetComponent } from './features/chat/components/chat-widget/chat-widget.component';

@Component({
  imports: [RouterOutlet, ChatWidgetComponent],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('CaraVeso');
  protected readonly auth = inject(AuthService);
}
