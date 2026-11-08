import { Routes } from '@angular/router';
import { FitYourHomeComponent } from './fit-your-home.component';

export const FIT_YOUR_HOME_ROUTES: Routes = [
  {
    path: '',
    component: FitYourHomeComponent,
    title: 'Fit your home | CaraVeso',
    data: { layout: 'compact' },
  },
];
