import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';

export interface MapPickResult {
  latitude: number;
  longitude: number;
  addressLine: string;
  province: string;
  ward: string;
  formattedAddress: string;
}

interface VnUnits {
  provinces: { name: string; wards: string[] }[];
}

interface NominatimAddress {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  village?: string;
  town?: string;
  city?: string;
  city_district?: string;
  county?: string;
  state?: string;
  province?: string;
}

interface NominatimResult {
  display_name?: string;
  lat: string;
  lon: string;
  address?: NominatimAddress;
}

interface SearchResult {
  label: string;
  lat: number;
  lng: number;
  address: NominatimAddress;
  displayName: string;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const VIETNAM_BOUNDS = '&countrycodes=vn&accept-language=vi';
const DEFAULT_CENTER: L.LatLngTuple = [10.776889, 106.700806];

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/^(tinh|thanh pho|tp\.?|tp)\s+/g, '')
    .replace(/^(phuong|xa|thi tran|tt\.?)\s+/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findProvince(units: VnUnits | null | undefined, raw: string): string {
  if (!units || !raw) return '';
  const n = normalizeName(raw);
  let best = units.provinces.find((p) => normalizeName(p.name) === n)?.name;
  if (best) return best;
  best = units.provinces.find((p) => {
    const pn = normalizeName(p.name);
    return pn && (n.includes(pn) || pn.includes(n));
  })?.name;
  return best || '';
}

function findWard(units: VnUnits | null | undefined, provinceName: string, raw: string): string {
  if (!units || !provinceName || !raw) return '';
  const province = units.provinces.find((p) => p.name === provinceName);
  if (!province) return '';
  const n = normalizeName(raw);
  let best = province.wards.find((w) => normalizeName(w) === n);
  if (best) return best;
  best = province.wards.find((w) => {
    const wn = normalizeName(w);
    return wn && (n.includes(wn) || wn.includes(n));
  });
  return best || '';
}

function pickAddressLine(addr: NominatimAddress, display: string): string {
  const parts = [addr.house_number, addr.road || addr.pedestrian].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return display
    .replace(/,?\s*(Việt Nam|Vietnam)\s*$/i, '')
    .split(',')
    .slice(0, 2)
    .join(',')
    .trim();
}

function pickWardRaw(addr: NominatimAddress): string {
  return (
    addr.suburb ||
    addr.quarter ||
    addr.neighbourhood ||
    addr.village ||
    addr.town ||
    addr.city_district ||
    addr.county ||
    ''
  );
}

/** Ghim đỏ kiểu Google Maps, vẽ bằng SVG để không phụ thuộc ảnh của Leaflet khi bundle. */
function createPinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'map-picker__pin',
    html: '<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg"><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="#EA4335"/><circle cx="14" cy="14" r="5.2" fill="#fff"/></svg>',
    iconSize: [28, 40],
    iconAnchor: [14, 40],
  });
}

type MapLayer = 'roadmap' | 'hybrid';

/**
 * Chọn vị trí giao hàng bằng Leaflet với tile Google Maps (miễn phí, không API key).
 * Hỗ trợ click bản đồ, kéo ghim, GPS và tìm địa chỉ (Nominatim miễn phí).
 */
@Component({
  selector: 'app-address-map-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="map-picker-backdrop" (click)="onBackdrop($event)">
      <div class="map-picker" role="dialog" aria-modal="true" aria-label="Chọn vị trí giao hàng">
        <div class="map-picker__head">
          <h3>Chọn vị trí giao hàng</h3>
          <button type="button" class="map-picker__close" (click)="cancel.emit()" aria-label="Đóng">×</button>
        </div>
        <div class="map-picker__body">
          <div class="map-picker__search">
            <input
              #searchInput
              type="text"
              class="map-picker__search-input"
              placeholder="Tìm địa chỉ, phường/xã, thành phố..."
              (keydown.enter)="$event.preventDefault(); onSearch(searchInput.value)"
            />
            <button type="button" class="map-picker__btn-inline" (click)="onSearch(searchInput.value)" [disabled]="searching()">
              {{ searching() ? 'Đang tìm...' : 'Tìm' }}
            </button>
            <button type="button" class="map-picker__gps" (click)="locateMe()" [disabled]="locating()">
              {{ locating() ? 'Đang định vị...' : 'Vị trí hiện tại' }}
            </button>
          </div>

          @if (error()) {
            <p class="map-picker__error" role="alert">{{ error() }}</p>
          }

          @if (results().length) {
            <ul class="map-picker__results">
              @for (r of results(); track r.label) {
                <li>
                  <button type="button" (click)="pickResult(r)">{{ r.label }}</button>
                </li>
              }
            </ul>
          }

          <div class="map-picker__map-wrap">
            <div #mapEl class="map-picker__map" role="application" aria-label="Bản đồ chọn vị trí"></div>
            <div class="map-picker__layers">
              <button type="button" [class.active]="layer() === 'roadmap'" (click)="setLayer('roadmap')">Bản đồ</button>
              <button type="button" [class.active]="layer() === 'hybrid'" (click)="setLayer('hybrid')">Vệ tinh</button>
            </div>
          </div>

          <div class="map-picker__coords">
            <label>
              Vĩ độ
              <input
                #latInput
                type="number"
                step="0.000001"
                min="-90"
                max="90"
                [value]="selected()?.latitude ?? ''"
                (change)="onManualCoords(latInput.value, lngInput.value)"
              />
            </label>
            <label>
              Kinh độ
              <input
                #lngInput
                type="number"
                step="0.000001"
                min="-180"
                max="180"
                [value]="selected()?.longitude ?? ''"
                (change)="onManualCoords(latInput.value, lngInput.value)"
              />
            </label>
          </div>

          <div class="map-picker__hint">
            @if (selected()) {
              <p><strong>Tọa độ:</strong> {{ selected()!.latitude.toFixed(6) }}, {{ selected()!.longitude.toFixed(6) }}</p>
              @if (selected()!.formattedAddress) {
                <p class="map-picker__addr">{{ selected()!.formattedAddress }}</p>
              }
            } @else {
              <p>Chạm vào bản đồ hoặc kéo ghim để chọn vị trí. Kinh độ/vĩ độ là bắt buộc.</p>
            }
            <p class="map-picker__note">Bạn có thể chỉnh lại Phường/Xã và Tỉnh/Thành phố sau khi chọn.</p>
          </div>
        </div>
        <div class="map-picker__actions">
          <button type="button" class="map-picker__btn" (click)="cancel.emit()">Huỷ</button>
          <button type="button" class="map-picker__btn map-picker__btn--primary" (click)="confirmPick()" [disabled]="!selected()">
            Xác nhận vị trí
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .map-picker-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px}
    .map-picker{background:#fff;border-radius:12px;width:min(720px,100%);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25)}
    .map-picker__head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e5e7eb}
    .map-picker__head h3{margin:0;font-size:16px;font-weight:600}
    .map-picker__close{background:none;border:0;font-size:22px;line-height:1;cursor:pointer;padding:4px 8px}
    .map-picker__body{padding:12px 16px;overflow-y:auto;overflow-x:hidden}
    .map-picker__search{display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap}
    .map-picker__search-input{flex:1;min-width:180px;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font:inherit}
    .map-picker__btn-inline{padding:10px 14px;border:1px solid #d1d5db;background:#f9fafb;border-radius:8px;cursor:pointer;font:inherit}
    .map-picker__gps{padding:10px 12px;border:1px solid #5b5b22;background:#fff;color:#5b5b22;border-radius:8px;cursor:pointer;font:inherit;white-space:nowrap}
    .map-picker__gps:disabled,.map-picker__btn-inline:disabled{opacity:.6;cursor:not-allowed}
    .map-picker__results{list-style:none;margin:0 0 8px;padding:0;max-height:160px;overflow:auto;border:1px solid #e5e7eb;border-radius:8px}
    .map-picker__results li+li{border-top:1px solid #f3f4f6}
    .map-picker__results button{width:100%;text-align:left;background:none;border:0;padding:8px 12px;cursor:pointer;font:inherit;font-size:13px;color:#111827}
    .map-picker__results button:hover{background:#f3f4f6}
    .map-picker__map-wrap{position:relative}
    .map-picker__map{width:100%;height:360px;border-radius:8px;background:#e8eaed;position:relative;z-index:0;cursor:crosshair}
    .map-picker__layers{position:absolute;top:10px;right:10px;z-index:500;display:flex;gap:2px;background:#fff;border-radius:8px;padding:3px;box-shadow:0 1px 4px rgba(0,0,0,.3)}
    .map-picker__layers button{border:0;background:none;padding:6px 10px;border-radius:6px;font:inherit;font-size:12px;cursor:pointer;color:#3c4043}
    .map-picker__layers button.active{background:#e8f0fe;color:#1a73e8;font-weight:600}
    .map-picker__coords{display:flex;gap:12px;margin-top:8px;flex-wrap:wrap}
    .map-picker__coords label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:#374151;flex:1;min-width:140px}
    .map-picker__coords input{padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font:inherit}
    .map-picker__hint{margin-top:8px;font-size:13px;color:#374151}
    .map-picker__hint p{margin:2px 0}
    .map-picker__addr{color:#6b7280}
    .map-picker__note{color:#9ca3af;font-size:12px}
    .map-picker__error{color:#b91c1c;margin:4px 0 8px;font-size:13px}
    .map-picker__actions{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid #e5e7eb}
    .map-picker__btn{padding:10px 16px;border-radius:8px;border:1px solid #d1d5db;background:#fff;cursor:pointer;font:inherit}
    .map-picker__btn--primary{background:#5b5b22;color:#fff;border-color:#5b5b22}
    .map-picker__btn--primary:disabled{opacity:.5;cursor:not-allowed}
    @media (max-width:640px){.map-picker__map{height:300px}}
  `],
})
export class AddressMapPickerComponent implements AfterViewInit, OnDestroy {
  initialLat = input<number | null | undefined>(null);
  initialLng = input<number | null | undefined>(null);
  units = input<VnUnits | null | undefined>(null);

  confirm = output<MapPickResult>();
  cancel = output<void>();

  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  private readonly zone = inject(NgZone);

  protected readonly error = signal('');
  protected readonly locating = signal(false);
  protected readonly searching = signal(false);
  protected readonly selected = signal<MapPickResult | null>(null);
  protected readonly results = signal<SearchResult[]>([]);
  protected readonly layer = signal<MapLayer>('roadmap');

  private map?: L.Map;
  private marker?: L.Marker;
  private tileLayer?: L.TileLayer;
  private resizeObserver?: ResizeObserver;

  ngAfterViewInit(): void {
    // Đợi layout xong mới tạo map để Leaflet đo đúng kích thước container.
    requestAnimationFrame(() => this.zone.runOutsideAngular(() => this.initMap()));
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.map?.remove();
    this.map = undefined;
    this.marker = undefined;
    this.tileLayer = undefined;
  }

  private googleTileUrl(): string {
    const lyrs = this.layer() === 'hybrid' ? 'y' : 'm';
    return `https://{s}.google.com/vt/lyrs=${lyrs}&x={x}&y={y}&z={z}&hl=vi`;
  }

  private createTileLayer(): L.TileLayer {
    return L.tileLayer(this.googleTileUrl(), {
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      maxZoom: 20,
      attribution: '&copy; Google',
    });
  }

  protected setLayer(layer: MapLayer): void {
    if (this.layer() === layer) return;
    this.layer.set(layer);
    if (this.map) {
      this.tileLayer?.remove();
      this.tileLayer = this.createTileLayer().addTo(this.map);
    }
  }

  private initMap(): void {
    const lat = this.initialLat();
    const lng = this.initialLng();
    const hasInitial = typeof lat === 'number' && typeof lng === 'number' && this.validCoords(lat, lng);
    const center: L.LatLngTuple = hasInitial ? [lat!, lng!] : DEFAULT_CENTER;

    const container = this.mapEl().nativeElement;
    const map = L.map(container, { zoomControl: true }).setView(center, hasInitial ? 16 : 12);
    this.tileLayer = this.createTileLayer().addTo(map);

    const marker = L.marker(center, { draggable: true, icon: createPinIcon() });
    if (hasInitial) marker.addTo(map);

    this.map = map;
    this.marker = marker;

    map.on('click', (e: L.LeafletMouseEvent) => {
      this.zone.run(() => this.setPosition(e.latlng.lat, e.latlng.lng, true));
    });

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      this.zone.run(() => this.setPosition(pos.lat, pos.lng, true));
    });

    // Container đổi kích thước (mở dialog, xoay màn hình, responsive) thì Leaflet vẽ lại cho khớp.
    this.resizeObserver = new ResizeObserver(() => map.invalidateSize());
    this.resizeObserver.observe(container);
    map.whenReady(() => map.invalidateSize());

    if (hasInitial) {
      this.zone.run(() => this.setPosition(lat!, lng!, true));
    }
  }

  private setPosition(lat: number, lng: number, reverse: boolean): void {
    if (!this.validCoords(lat, lng)) {
      this.error.set('Toạ độ không hợp lệ (vĩ độ -90..90, kinh độ -180..180).');
      return;
    }
    this.error.set('');
    this.marker?.setLatLng([lat, lng]).addTo(this.map!);
    this.selected.set(this.baseResult(lat, lng));
    if (reverse) this.reverseGeocode(lat, lng);
  }

  protected onSearch(raw: string): void {
    const q = raw.trim();
    if (!q) {
      this.error.set('Nhập địa chỉ cần tìm.');
      return;
    }
    this.error.set('');
    this.searching.set(true);
    this.results.set([]);
    const url = `${NOMINATIM}/search?format=jsonv2&addressdetails=1&limit=5${VIETNAM_BOUNDS}&q=${encodeURIComponent(q)}`;
    fetch(url, { headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? (res.json() as Promise<NominatimResult[]>) : Promise.reject(new Error('search'))))
      .then((list) => {
        const mapped = (Array.isArray(list) ? list : [])
          .map((r) => {
            const lat = Number(r.lat);
            const lng = Number(r.lon);
            if (!this.validCoords(lat, lng)) return null;
            return {
              label: r.display_name || `${lat}, ${lng}`,
              lat,
              lng,
              address: r.address || {},
              displayName: r.display_name || '',
            } satisfies SearchResult;
          })
          .filter((r): r is SearchResult => r !== null);
        this.results.set(mapped);
        if (!mapped.length) this.error.set('Không tìm thấy địa chỉ phù hợp. Thử từ khoá khác hoặc dùng GPS.');
      })
      .catch(() => this.error.set('Không tìm được địa chỉ lúc này. Bạn có thể dùng GPS hoặc chạm lên bản đồ.'))
      .finally(() => this.searching.set(false));
  }

  protected pickResult(result: SearchResult): void {
    this.results.set([]);
    this.error.set('');
    const matched = this.matchAddress(result.address, result.displayName);
    this.marker?.setLatLng([result.lat, result.lng]).addTo(this.map!);
    this.map?.setView([result.lat, result.lng], 17);
    this.selected.set({
      latitude: result.lat,
      longitude: result.lng,
      ...matched,
      formattedAddress: result.displayName || matched.formattedAddress,
    });
  }

  protected onManualCoords(latRaw: string, lngRaw: string): void {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!this.validCoords(lat, lng)) {
      this.error.set('Toạ độ không hợp lệ (vĩ độ -90..90, kinh độ -180..180).');
      return;
    }
    this.error.set('');
    this.map?.setView([lat, lng], 16);
    this.setPosition(lat, lng, true);
  }

  protected locateMe(): void {
    if (!navigator.geolocation) {
      this.error.set('Trình duyệt không hỗ trợ định vị GPS.');
      return;
    }
    this.error.set('');
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.zone.run(() => {
          this.locating.set(false);
          this.map?.setView([pos.coords.latitude, pos.coords.longitude], 17);
          this.setPosition(pos.coords.latitude, pos.coords.longitude, true);
        });
      },
      (err) => {
        this.zone.run(() => {
          this.locating.set(false);
          this.error.set(
            err.code === err.PERMISSION_DENIED
              ? 'Bạn đã từ chối quyền truy cập vị trí. Hãy cho phép GPS hoặc chạm lên bản đồ.'
              : 'Không lấy được vị trí hiện tại. Hãy thử lại hoặc chạm lên bản đồ.',
          );
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  protected confirmPick(): void {
    const s = this.selected();
    if (!s) return;
    this.confirm.emit(s);
  }

  protected onBackdrop(ev: MouseEvent): void {
    if ((ev.target as HTMLElement)?.classList.contains('map-picker-backdrop')) this.cancel.emit();
  }

  private reverseGeocode(lat: number, lng: number): void {
    const url = `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1${VIETNAM_BOUNDS}&lat=${lat}&lon=${lng}`;
    fetch(url, { headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? (res.json() as Promise<NominatimResult>) : Promise.reject(new Error('reverse'))))
      .then((r) => {
        this.zone.run(() => {
          const cur = this.selected();
          if (!cur || Math.abs(cur.latitude - lat) > 1e-7 || Math.abs(cur.longitude - lng) > 1e-7) return;
          const matched = this.matchAddress(r.address || {}, r.display_name || '');
          this.selected.set({
            ...cur,
            ...matched,
            formattedAddress: r.display_name || matched.formattedAddress,
          });
        });
      })
      .catch(() => {
        // Không tự điền được địa chỉ thì người dùng vẫn có toạ độ và tự chọn phường/xã.
      });
  }

  private baseResult(lat: number, lng: number): MapPickResult {
    return {
      latitude: lat,
      longitude: lng,
      addressLine: '',
      province: '',
      ward: '',
      formattedAddress: '',
    };
  }

  private matchAddress(
    addr: NominatimAddress,
    display: string,
  ): Pick<MapPickResult, 'addressLine' | 'province' | 'ward' | 'formattedAddress'> {
    const provinceRaw = addr.state || addr.city || addr.province || '';
    const province = findProvince(this.units(), provinceRaw) || '';
    const ward = findWard(this.units(), province, pickWardRaw(addr)) || '';
    return {
      addressLine: pickAddressLine(addr, display),
      province,
      ward,
      formattedAddress: display,
    };
  }

  private validCoords(lat: number, lng: number): boolean {
    return (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    );
  }
}