import { Route, Routes, UrlSegment } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, map, of, shareReplay, type Observable } from 'rxjs';
import { CatalogApiService, type Category } from 'shared';
import { AuthService } from './services/auth/auth.service';
import { CartStore } from './services/cart/cart.store';
import { authGuard } from './core/guards/auth.guard';

// Danh sách danh mục tải một lần cho cả phiên; tải lại trang sẽ lấy dữ liệu mới.
let categoriesCache$: Observable<Category[]> | null = null;
const loadCategories = (api: CatalogApiService): Observable<Category[]> => {
  categoriesCache$ ??= api.getCategories().pipe(
    map((items) => items.flatMap((c) => [c, ...(c.children ?? [])])),
    shareReplay(1),
  );
  return categoriesCache$;
};

// Slug danh mục (kể cả danh mục con) phải tồn tại và đang hiển thị thì mới khớp.
const categorySlugGuard = (_route: Route, segments: UrlSegment[]) => {
  const slug = segments[1]?.path ?? '';
  return loadCategories(inject(CatalogApiService)).pipe(
    map((items) => items.some((c) => c.slug === slug)),
    catchError(() => {
      categoriesCache$ = null;
      return of(false);
    }),
  );
};

// Đợi giỏ trình duyệt gộp vào tài khoản xong rồi mới vào thanh toán.
const cartMergedGuard = () => inject(CartStore).settled().then(() => true);

const wishlistEntryGuard = () =>
  inject(AuthService).isAuthenticated() ? inject(Router).createUrlTree(['/account/wishlist']) : true;

export const routes: Routes = [
  { path: 'support', loadChildren: () => import('./features/after-sales/after-sales.routes').then((m) => m.AFTER_SALES_ROUTES) },
  { path: 'careers', loadChildren: () => import('./features/careers/careers.routes').then((m) => m.CAREERS_ROUTES) },
  { path: 'policies', loadChildren: () => import('./features/policies/policies.routes').then((m) => m.POLICIES_ROUTES) },
  { path: 'search/image', loadChildren: () => import('./features/image-search/image-search.routes').then((m) => m.IMAGE_SEARCH_ROUTES) },
  { path: 'products', loadChildren: () => import('./features/products/products.routes').then((m) => m.PRODUCTS_ROUTES) },
  { path: 'search', loadChildren: () => import('./features/products/products.routes').then((m) => m.PRODUCTS_ROUTES) },
  {
    path: '',
    pathMatch: 'full',
    loadChildren: () => import('./features/home/home.routes').then((m) => m.HOME_ROUTES),
  },
  {
    path: 'welcome-offer',
    data: { layout: 'solid' },
    title: 'Ưu đãi 10% cho khách hàng mới | CaraVeso',
    loadComponent: () =>
      import('./features/welcome-offer/welcome-offer.component').then((m) => m.WelcomeOfferComponent),
  },
  {
    path: 'welcome-offer/confirm',
    data: { layout: 'solid' },
    canActivate: [authGuard],
    title: 'Xác nhận ưu đãi khách mới | CaraVeso',
    loadComponent: () =>
      import('./features/welcome-offer/welcome-offer-confirm.component').then((m) => m.WelcomeOfferConfirmComponent),
  },
  {
    path: 'promotions',
    loadChildren: () =>
      import('./features/promotions/promotions.routes').then((m) => m.PROMOTIONS_ROUTES),
  },
  {
    path: 'collections',
    loadChildren: () =>
      import('./features/collections/collections.routes').then((m) => m.COLLECTION_ROUTES),
  },
  {
    path: 'inspirations',
    loadChildren: () =>
      import('./features/inspirations/inspirations.routes').then((m) => m.INSPIRATIONS_ROUTES),
  },
  {
    path: 'view-your-room',
    loadChildren: () =>
      import('./features/view-your-room/view-your-room.routes').then(
        (m) => m.VIEW_YOUR_ROOM_ROUTES,
      ),
  },
  {
    path: 'fit-your-home',
    loadChildren: () =>
      import('./features/fit-your-home/fit-your-home.routes').then((m) => m.FIT_YOUR_HOME_ROUTES),
  },
  {
    path: 'cart',
    loadChildren: () => import('./features/cart/cart.routes').then((m) => m.CART_ROUTES),
  },
  {
    path: 'checkout',
    // Giỏ hàng lưu ở trình duyệt cho khách; chỉ thanh toán mới bắt đăng nhập (quay lại đúng trang sau đó).
    canActivate: [authGuard, cartMergedGuard],
    loadChildren: () =>
      import('./features/checkout/checkout.routes').then((m) => m.CHECKOUT_ROUTES),
  },
  {
    path: 'auth',
    // Header trắng ngay từ đầu vì trang không có ảnh lớn ở đầu trang.
    data: { layout: 'solid' },
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    // Khách chưa đăng nhập xem danh sách yêu thích tạm; đã đăng nhập thì dùng trang trong tài khoản.
    path: 'wishlist',
    data: { layout: 'solid' },
    canActivate: [wishlistEntryGuard],
    title: 'Danh sách yêu thích | CaraVeso',
    loadComponent: () =>
      import('./features/account/pages/wishlist/wishlist.component').then((m) => m.WishlistComponent),
  },
  {
    path: 'account',
    canActivate: [authGuard],
    data: { layout: 'solid' },
    loadChildren: () => import('./features/account/account.routes').then((m) => m.ACCOUNT_ROUTES),
  },
  {
    path: 'news',
    data: { layout: 'solid' },
    loadChildren: () => import('./features/news/news.routes').then((m) => m.NEWS_ROUTES),
  },
  // `/danh-muc/<slug>` (ví dụ `/danh-muc/phong-ngu`) mở danh sách sản phẩm đã lọc theo danh mục.
  // Slug sai không khớp và rơi về `**`.
  {
    path: 'danh-muc/:categorySlug',
    canMatch: [categorySlugGuard],
    redirectTo: ({ params }) => `/products?categorySlug=${encodeURIComponent(params['categorySlug'])}`,
  },
  // Các trang chưa làm (sản phẩm, tìm kiếm...) tạm đưa về trang chủ.
  { path: '**', redirectTo: '' },
];
