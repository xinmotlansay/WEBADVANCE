import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { Showroom, ShowroomRegion } from 'shared';
import { IconComponent } from '../../../../shared/ui/icons/icon.component';
import { VIETNAM_ARCHIPELAGOS, VIETNAM_MAP, projectToMap, type MapPoint } from './vietnam-map';

type RegionFilter = 'ALL' | ShowroomRegion;

interface MapPin extends MapPoint {
  showroom: Showroom;
}

const REGION_OPTIONS: { value: RegionFilter; label: string }[] = [
  { value: 'ALL', label: 'Cả nước' },
  { value: 'NORTH', label: 'Miền Bắc' },
  { value: 'CENTRAL', label: 'Miền Trung' },
  { value: 'SOUTH', label: 'Miền Nam' },
];

const AUTOPLAY_MS = 4500;
const COUNT_UP_MS = 1400;
/** Trùng thời gian mở/thu gọn mục trong CSS (`.item__more`). */
const ACCORDION_MS = 420;

/**
 * Giới thiệu hệ thống showroom: bản đồ Việt Nam có điểm sáng, danh sách và số liệu đếm tăng.
 * Tự lần lượt giới thiệu từng điểm cho tới khi khách tự thao tác.
 */
@Component({
  selector: 'app-showroom-network',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './showroom-network.component.html',
  styleUrl: './showroom-network.component.css',
})
export class ShowroomNetworkComponent {
  readonly showrooms = input.required<Showroom[]>();

  protected readonly map = VIETNAM_MAP;
  protected readonly archipelagos = VIETNAM_ARCHIPELAGOS;
  protected readonly regionOptions = REGION_OPTIONS;

  protected readonly region = signal<RegionFilter>('ALL');
  protected readonly activeId = signal<string | null>(null);
  protected readonly inView = signal(false);
  protected readonly progress = signal(0);

  private readonly userControlled = signal(false);
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly pins = computed<MapPin[]>(() =>
    this.showrooms().map((showroom) => ({
      showroom,
      ...projectToMap(showroom.longitude, showroom.latitude),
    })),
  );

  protected readonly visiblePins = computed(() =>
    this.region() === 'ALL'
      ? this.pins()
      : this.pins().filter((p) => p.showroom.region === this.region()),
  );

  protected readonly active = computed(
    () =>
      this.visiblePins().find((p) => p.showroom.id === this.activeId()) ?? this.visiblePins()[0],
  );

  private readonly flagship = computed(() => this.pins().find((p) => p.showroom.isFlagship));

  /** Đường cong nối showroom chủ lực tới điểm đang chọn. */
  protected readonly route = computed(() => {
    const from = this.flagship();
    const to = this.active();
    if (!from || !to || from.showroom.id === to.showroom.id) return null;

    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    // Lệch vuông góc về phía tây để đường cong uốn ra phía biển.
    const bend = Math.min(60, length * 0.25);
    const cx = midX + bend;
    const cy = midY;
    return `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
  });

  protected readonly stats = computed(() => {
    const all = this.showrooms();
    const ease = 1 - Math.pow(1 - this.progress(), 3);
    const count = (n: number): number => Math.round(n * ease);
    return [
      { value: count(all.length), label: 'showroom' },
      { value: count(new Set(all.map((s) => s.city)).size), label: 'tỉnh thành' },
      { value: count(new Set(all.map((s) => s.region)).size), label: 'miền đất nước' },
    ];
  });

  protected readonly regionCounts = computed(() => {
    const counts = new Map<RegionFilter, number>([['ALL', this.showrooms().length]]);
    for (const { region } of this.showrooms()) counts.set(region, (counts.get(region) ?? 0) + 1);
    return counts;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            this.inView.set(true);
            observer.disconnect();
            this.countUp();
          }
        },
        { threshold: 0.25 },
      );
      observer.observe(this.host.nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());

      const timer = setInterval(() => this.advance(), AUTOPLAY_MS);
      destroyRef.onDestroy(() => clearInterval(timer));
    });

    // Cuộn danh sách tới mục đang chọn (không kéo cả trang), chờ mục cũ thu gọn xong mới tính vị trí.
    effect((onCleanup) => {
      const id = this.active()?.showroom.id;
      const timer = setTimeout(() => {
        const list = this.list()?.nativeElement;
        const item = id ? list?.querySelector<HTMLElement>(`[data-id="${id}"]`) : null;
        if (list && item) list.scrollTo({ top: item.offsetTop - 8, behavior: 'smooth' });
      }, ACCORDION_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected selectRegion(value: RegionFilter): void {
    this.region.set(value);
    this.activeId.set(null);
    this.userControlled.set(true);
  }

  protected select(id: string): void {
    this.activeId.set(id);
    this.userControlled.set(true);
  }

  protected directionsUrl(showroom: Showroom): string {
    return `https://www.google.com/maps/search/?api=1&query=${showroom.latitude},${showroom.longitude}`;
  }

  protected percent(value: number, total: number): string {
    return `${((value / total) * 100).toFixed(2)}%`;
  }

  private advance(): void {
    const pins = this.visiblePins();
    if (this.userControlled() || !this.inView() || pins.length < 2) return;
    const index = pins.findIndex((p) => p.showroom.id === this.active()?.showroom.id);
    this.activeId.set(pins[(index + 1) % pins.length].showroom.id);
  }

  private countUp(): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.progress.set(1);
      return;
    }
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      this.progress.set(t);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}
