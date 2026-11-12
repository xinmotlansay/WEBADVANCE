import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  CatalogApiService,
  FitApiService,
  type FitCheckRequest,
  type FitCheckResult,
  type ProductDetail,
  type ProductListItem,
  type SimilarFitItem,
  type WalkwayPassage,
} from 'shared';
import {
  Observable,
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import type { WalkwayProfile as AccountProfile } from '../account/account-api.service';
import { RecentlyViewedService } from '../ui/recently-viewed.service';
import { WalkwayProfileService } from './walkway-profile.service';

export interface Loadable<T> {
  loading: boolean;
  data: T | null;
  error: string | null;
}

const DEBOUNCE_MS = 300;

function errorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    const message = (err.error as { error?: { message?: string } } | null)?.error?.message;
    return message ?? 'Không kết nối được máy chủ, vui lòng thử lại.';
  }
  return 'Đã có lỗi xảy ra, vui lòng thử lại.';
}

function idle<T>(): Loadable<T> {
  return { loading: false, data: null, error: null };
}

function load<T>(source: Observable<T>): Observable<Loadable<T>> {
  return source.pipe(
    map((data) => ({ loading: false, data, error: null })),
    catchError((err: unknown) => of({ loading: false, data: null, error: errorMessage(err) })),
  );
}

/** Trạng thái trang Fit your home: sản phẩm đang xem, lối đi, kết quả và sản phẩm tương tự. */
@Injectable()
export class FitYourHomeService {
  private readonly catalog = inject(CatalogApiService);
  private readonly fitApi = inject(FitApiService);
  private readonly profiles = inject(WalkwayProfileService);
  private readonly viewed = inject(RecentlyViewedService);

  /** Lấy từ URL (`?product=<slug>&variant=<id>`). */
  readonly slug = signal<string | null>(null);
  readonly variantId = signal<string | null>(null);
  readonly passages = signal<WalkwayPassage[]>(
    this.profiles.loadDraft() ?? this.profiles.loadProfile()?.passages ?? [],
  );
  /** Các hồ sơ nhà trong tài khoản và hồ sơ đang chọn (`null`: hồ sơ mới chưa lưu). */
  readonly accountProfiles = signal<AccountProfile[]>([]);
  readonly selectedProfileId = signal<string | null>(null);
  readonly loggedIn = computed(() => this.profiles.loggedIn);

  private readonly initRemote = (() => {
    const hasDraft = !!this.profiles.loadDraft();
    this.profiles.listRemote().subscribe({
      next: (list) => {
        this.accountProfiles.set(list);
        const main = list.find((p) => p.isDefault) ?? list[0] ?? null;
        this.selectedProfileId.set(main?.id ?? null);
        if (main && !hasDraft && this.passages().length === 0) this.setPassages(main.passages as WalkwayPassage[]);
      },
      error: () => undefined,
    });
  })();
  readonly includeCaution = signal(false);
  readonly searchTerm = signal('');
  readonly history = this.viewed.items;

  readonly product = toSignal(
    toObservable(this.slug).pipe(
      switchMap((slug) =>
        slug
          ? load(
              this.catalog
                .getProduct(slug)
                .pipe(tap((p) => this.viewed.add({ slug: p.slug, name: p.name }))),
            ).pipe(startWith<Loadable<ProductDetail>>({ loading: true, data: null, error: null }))
          : of(idle<ProductDetail>()),
      ),
    ),
    { initialValue: idle<ProductDetail>() },
  );

  readonly variant = computed(() => {
    const variants = this.product().data?.variants ?? [];
    return variants.find((v) => v.id === this.variantId()) ?? variants[0] ?? null;
  });

  private readonly request = computed<FitCheckRequest | null>(() => {
    const product = this.product().data;
    const variant = this.variant();
    const passages = this.passages();
    if (!product || !variant || passages.length === 0) return null;
    return { productId: product.id, variantId: variant.id, passages };
  });

  readonly result = toSignal(
    toObservable(this.request).pipe(
      debounceTime(DEBOUNCE_MS),
      switchMap((req) => (req ? load(this.fitApi.check(req)) : of(idle<FitCheckResult>()))),
    ),
    { initialValue: idle<FitCheckResult>() },
  );

  private readonly similarRequest = computed(() => {
    const req = this.request();
    return req ? { ...req, includeCaution: this.includeCaution() } : null;
  });

  readonly similar = toSignal(
    toObservable(this.similarRequest).pipe(
      debounceTime(DEBOUNCE_MS),
      switchMap((req) => (req ? load(this.fitApi.similar(req)) : of(idle<SimilarFitItem[]>()))),
    ),
    { initialValue: idle<SimilarFitItem[]>() },
  );

  readonly searchResults = toSignal(
    toObservable(this.searchTerm).pipe(
      debounceTime(DEBOUNCE_MS),
      map((q) => q.trim()),
      distinctUntilChanged(),
      switchMap((q) =>
        q.length < 2
          ? of([])
          : this.catalog.getProducts({ q, limit: 6 }).pipe(
              map((r) => r.items),
              catchError(() => of([])),
            ),
      ),
    ),
    { initialValue: [] as ProductListItem[] },
  );

  addPassage(passage: WalkwayPassage): void {
    this.setPassages([...this.passages(), passage]);
  }

  updatePassage(index: number, passage: WalkwayPassage): void {
    this.setPassages(this.passages().map((p, i) => (i === index ? passage : p)));
  }

  removePassage(index: number): void {
    this.setPassages(this.passages().filter((_, i) => i !== index));
  }

  /** Chọn một hồ sơ nhà trong tài khoản để dùng, hoặc `null` để nhập hồ sơ mới. */
  selectProfile(id: string | null): void {
    this.selectedProfileId.set(id);
    const profile = this.accountProfiles().find((p) => p.id === id);
    this.setPassages(profile ? ([...profile.passages] as WalkwayPassage[]) : []);
  }

  /** `true` nếu đã lưu vào tài khoản, `false` nếu chỉ lưu ở trình duyệt (chưa đăng nhập). */
  saveProfile(): Observable<boolean> {
    if (!this.profiles.loggedIn) {
      this.profiles.saveProfile({ name: 'Hồ sơ của tôi', passages: this.passages() });
      return of(false);
    }
    const list = this.accountProfiles();
    const existing = list.find((p) => p.id === this.selectedProfileId()) ?? null;
    return this.profiles
      .saveRemote(existing, this.passages(), `Hồ sơ nhà ${list.length + 1}`, list.length === 0)
      .pipe(
        tap((saved) => {
          this.accountProfiles.set(
            existing ? list.map((p) => (p.id === saved.id ? saved : p)) : [...list, saved],
          );
          this.selectedProfileId.set(saved.id);
        }),
        map(() => true),
      );
  }

  private setPassages(passages: WalkwayPassage[]): void {
    this.passages.set(passages);
    this.profiles.saveDraft(passages);
  }
}
