import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  NgZone,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CatalogApiService, type ProductListItem } from 'shared';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ProductPanelComponent } from './components/product-panel/product-panel.component';
import {
  RoomSettingsComponent,
  type RoomTypeOption,
} from './components/room-settings/room-settings.component';
import { ViewRoomApiService } from './view-room-api.service';
import { ViewRoomHeaderComponent } from './components/view-room-header/view-room-header.component';
import { RoomScene, type ViewMode } from './scene/room-scene';
import {
  DEFAULT_ROOM,
  defaultRoomSize,
  formatVnd,
  newUid,
  type LayoutSnapshot,
  type PlacedItem,
  type ProductDetail,
  type RoomConfig,
  type RoomSuggestions,
} from './view-your-room.models';

/** Gộp các lần đổi liên tiếp (kéo thanh trượt) thành một bước hoàn tác. */
const COALESCE_MS = 800;
const HISTORY_LIMIT = 50;

@Component({
  selector: 'app-view-your-room',
  imports: [RoomSettingsComponent, ProductPanelComponent, ViewRoomHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './view-your-room.component.html',
  styleUrl: './view-your-room.component.css',
})
export class ViewYourRoomComponent implements AfterViewInit {
  private readonly zone = inject(NgZone);
  private readonly catalog = inject(CatalogApiService);
  private readonly api = inject(ViewRoomApiService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);
  private readonly canvasHost = viewChild.required<ElementRef<HTMLElement>>('canvasHost');

  protected readonly room = signal<RoomConfig>(DEFAULT_ROOM);
  protected readonly items = signal<PlacedItem[]>([]);
  protected readonly selectedUid = signal<string | null>(null);
  protected readonly selectedItem = computed(
    () => this.items().find((item) => item.uid === this.selectedUid()) ?? null,
  );
  protected readonly total = computed(() =>
    this.items().reduce((sum, item) => sum + item.priceFrom, 0),
  );
  protected readonly zoomPercent = signal(100);
  protected readonly viewMode = signal<ViewMode>('3d');
  protected readonly canUndo = signal(false);
  protected readonly canRedo = signal(false);
  protected readonly saving = signal(false);
  protected readonly notice = signal<string | null>(null);

  protected readonly suggestions = signal<RoomSuggestions | null>(null);
  protected readonly suggestionsFailed = signal(false);
  protected readonly roomTypes = signal<RoomTypeOption[]>([]);
  protected readonly roomTypeId = signal<string | null>(null);
  protected readonly roomSlug = computed(
    () => this.roomTypes().find((type) => type.id === this.roomTypeId())?.slug ?? null,
  );

  protected readonly formatVnd = formatVnd;

  private scene: RoomScene | null = null;
  private past: LayoutSnapshot[] = [];
  private future: LayoutSnapshot[] = [];
  private lastRecordKey: string | null = null;
  private lastRecordAt = 0;
  private readonly detailCache = new Map<string, ProductDetail>();
  private suggestionTimer: ReturnType<typeof setTimeout> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  ngAfterViewInit(): void {
    // Vòng lặp render chạy ngoài Angular zone để không kích hoạt change detection mỗi khung hình.
    this.scene = this.zone.runOutsideAngular(
      () =>
        new RoomScene(this.canvasHost().nativeElement, {
          onItemChange: (uid, patch) => this.zone.run(() => this.updateItem(uid, patch)),
          onSelect: (uid) => this.zone.run(() => this.selectedUid.set(uid)),
          onZoomChange: (percent) => this.zone.run(() => this.zoomPercent.set(percent)),
        }),
    );
    this.scene.setRoom(this.room());
    this.loadCatalog();

    this.destroyRef.onDestroy(() => {
      this.scene?.dispose();
      if (this.suggestionTimer) clearTimeout(this.suggestionTimer);
      if (this.noticeTimer) clearTimeout(this.noticeTimer);
    });
  }

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (event.key === 'r' || event.key === 'R') this.rotateSelected();
    if (event.key === 'Delete' || event.key === 'Backspace') this.removeSelected();
  }

  protected onRoomChange(next: RoomConfig): void {
    if (!this.scene) return;
    this.record('room');
    this.scene.setRoom(next);
    this.room.set(next);
    const fitted = this.scene.fitItemsToRoom(this.items());
    this.items.set(fitted);
    this.scene.syncItems(fitted);
    this.refreshSuggestions();
  }

  /** Đổi loại phòng: áp kích thước mặc định của loại đó và tính lại danh sách còn thiếu. */
  protected onRoomTypeChange(roomTypeId: string): void {
    this.roomTypeId.set(roomTypeId);
    this.suggestions.set(null);
    const size = defaultRoomSize(this.roomSlug());
    this.onRoomChange({ ...this.room(), length: size.length, width: size.width });
  }

  protected async addProduct(product: ProductListItem): Promise<void> {
    if (!this.scene) return;
    const detail = await this.loadDetail(product.slug);
    if (!detail) return;
    if (!detail.has3DModel || !detail.model3DUrl) {
      this.notify(`${detail.name} chưa hỗ trợ xem 3D`);
      return;
    }

    const draft: PlacedItem = {
      uid: newUid(),
      productId: detail.id,
      slug: detail.slug,
      name: detail.name,
      priceFrom: detail.priceFrom,
      model3DUrl: detail.model3DUrl,
      dimensions: detail.dimensions,
      x: 0,
      z: 0,
      rotationY: 0,
    };
    const spot = await this.scene.findFreeSpot(draft);
    if (!spot) {
      this.notify('Phòng đã hết chỗ cho sản phẩm này');
      return;
    }

    const placed: PlacedItem = { ...draft, x: spot.x, z: spot.z };
    this.record();
    this.items.update((list) => [...list, placed]);
    this.selectedUid.set(placed.uid);
    this.scene.select(placed.uid);
    this.scene.syncItems(this.items());
    this.refreshSuggestions();
  }

  protected rotateSelected(): void {
    if (!this.scene || !this.selectedUid()) return;
    if (!this.scene.rotateSelected()) {
      this.notify('Không xoay được vì sản phẩm sẽ đè lên đồ khác');
    }
  }

  protected removeSelected(): void {
    const uid = this.selectedUid();
    if (!uid || !this.scene) return;
    this.record();
    this.items.update((list) => list.filter((item) => item.uid !== uid));
    this.selectedUid.set(null);
    this.scene.select(null);
    this.scene.syncItems(this.items());
    this.refreshSuggestions();
  }

  protected undo(): void {
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push(this.snapshot());
    this.apply(previous);
    this.updateHistoryFlags();
  }

  protected redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.snapshot());
    this.apply(next);
    this.updateHistoryFlags();
  }

  protected resetLayout(): void {
    this.record();
    this.apply({ room: DEFAULT_ROOM, items: [] });
    this.updateHistoryFlags();
  }

  protected setView(mode: ViewMode): void {
    this.viewMode.set(mode);
    this.scene?.setView(mode);
  }

  protected zoomIn(): void {
    this.scene?.zoomIn();
  }

  protected zoomOut(): void {
    this.scene?.zoomOut();
  }

  protected save(): void {
    if (!this.auth.isAuthenticated() || this.saving()) return;
    const name = `Bố cục ${new Date().toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}`;
    this.saving.set(true);
    this.api
      .saveLayout(name, this.snapshot())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notify('Đã lưu bố cục');
        },
        error: () => {
          this.saving.set(false);
          this.notify('Không lưu được bố cục, thử lại sau');
        },
      });
  }

  protected scrollToProducts(): void {
    document.getElementById('vyr-products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private loadCatalog(): void {
    this.catalog
      .getCategories('ROOM')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rooms) => {
          this.roomTypes.set(
            rooms.map((room) => ({ id: room.id, name: room.name, slug: room.slug })),
          );
          this.roomTypeId.set(
            (rooms.find((room) => room.slug === 'phong-ngu') ?? rooms[0])?.id ?? null,
          );
          this.refreshSuggestions();
        },
        error: () => this.notify('Không tải được danh mục phòng'),
      });
  }

  private async loadDetail(slug: string): Promise<ProductDetail | null> {
    const cached = this.detailCache.get(slug);
    if (cached) return cached;
    try {
      const detail = await firstValueFrom(this.api.getProductDetail(slug));
      this.detailCache.set(slug, detail);
      return detail;
    } catch {
      this.notify('Không tải được thông tin sản phẩm');
      return null;
    }
  }

  private updateItem(uid: string, patch: Partial<Pick<PlacedItem, 'x' | 'z' | 'rotationY'>>): void {
    this.record();
    this.items.update((list) =>
      list.map((item) => (item.uid === uid ? { ...item, ...patch } : item)),
    );
    this.scene?.syncItems(this.items());
    this.refreshSuggestions();
  }

  private snapshot(): LayoutSnapshot {
    return { room: this.room(), items: this.items() };
  }

  private apply(snapshot: LayoutSnapshot): void {
    if (!this.scene) return;
    this.scene.setRoom(snapshot.room);
    this.room.set(snapshot.room);
    this.items.set(snapshot.items);
    this.selectedUid.set(null);
    this.scene.select(null);
    this.scene.syncItems(snapshot.items);
    this.refreshSuggestions();
  }

  private record(key: string | null = null): void {
    const now = Date.now();
    const coalesce =
      key !== null && key === this.lastRecordKey && now - this.lastRecordAt < COALESCE_MS;
    this.lastRecordKey = key;
    this.lastRecordAt = now;
    if (coalesce) return;

    this.past.push(this.snapshot());
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
    this.updateHistoryFlags();
  }

  private updateHistoryFlags(): void {
    this.canUndo.set(this.past.length > 0);
    this.canRedo.set(this.future.length > 0);
  }

  private refreshSuggestions(): void {
    if (this.suggestionTimer) clearTimeout(this.suggestionTimer);
    this.suggestionTimer = setTimeout(() => {
      const roomTypeId = this.roomTypeId();
      if (!roomTypeId) return;
      const placedProductIds = [...new Set(this.items().map((item) => item.productId))];
      this.api
        .getSuggestions(roomTypeId, placedProductIds)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (result) => {
            this.suggestionsFailed.set(false);
            this.suggestions.set(result);
          },
          error: () => {
            this.suggestionsFailed.set(true);
            this.suggestions.set(null);
          },
        });
    }, 300);
  }

  private notify(message: string): void {
    this.notice.set(message);
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice.set(null), 3000);
  }
}
