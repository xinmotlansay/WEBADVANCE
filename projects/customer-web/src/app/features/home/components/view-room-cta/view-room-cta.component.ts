import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-view-room-cta',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './view-room-cta.component.html',
  styleUrl: './view-room-cta.component.css',
})
export class ViewRoomCtaComponent {}
