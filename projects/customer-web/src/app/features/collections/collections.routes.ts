import { Routes } from '@angular/router';
import { CollectionDetailComponent } from './collection-detail/collection-detail.component';

export const COLLECTION_ROUTES: Routes = [{ path: ':slug', component: CollectionDetailComponent }];
