import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../services/auth/auth.service';

@Component({
  selector: 'app-logout',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './logout.component.html',
  styleUrl: './logout.component.css',
})
export class LogoutComponent {
  protected readonly auth = inject(AuthService);
}
