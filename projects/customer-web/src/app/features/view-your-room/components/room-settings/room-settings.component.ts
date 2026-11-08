import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  FLOOR_OPTIONS,
  ROOM_LIMITS,
  WALL_SWATCHES,
  formatMeters,
  roomSizePresets,
  wallHex,
  type FloorType,
  type RoomConfig,
  type SizePreset,
  type WallColor,
} from '../../view-your-room.models';

const CUSTOM = 'custom';

export interface RoomTypeOption {
  id: string;
  name: string;
  slug: string;
}

@Component({
  selector: 'app-room-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './room-settings.component.html',
  styleUrl: './room-settings.component.css',
})
export class RoomSettingsComponent {
  readonly room = input.required<RoomConfig>();
  readonly roomTypes = input<RoomTypeOption[]>([]);
  readonly roomTypeId = input<string | null>(null);
  readonly roomSlug = input<string | null>(null);
  readonly roomChange = output<RoomConfig>();
  readonly roomTypeChange = output<string>();

  protected readonly limits = ROOM_LIMITS;
  protected readonly swatches = WALL_SWATCHES;
  protected readonly floorOptions = FLOOR_OPTIONS;
  protected readonly formatMeters = formatMeters;
  protected readonly wallHex = wallHex;
  protected readonly custom = CUSTOM;

  protected readonly presets = computed<SizePreset[]>(() => roomSizePresets(this.roomSlug()));

  /** `custom` khi người dùng vừa bấm "Tuỳ chỉnh" hoặc kéo thanh trượt; `null` để suy ra từ kích thước phòng. */
  private readonly manualPreset = signal<typeof CUSTOM | null>(null);

  protected readonly selectedPreset = computed<string>(() => {
    if (this.manualPreset() === CUSTOM) return CUSTOM;
    const room = this.room();
    const match = this.presets().find((p) => p.length === room.length && p.width === room.width);
    return match?.label ?? CUSTOM;
  });

  protected readonly isCustomWall = computed(() => this.room().wallColor.startsWith('#'));

  protected setRoomType(event: Event): void {
    this.roomTypeChange.emit((event.target as HTMLSelectElement).value);
  }

  protected selectPreset(preset: SizePreset): void {
    this.manualPreset.set(null);
    this.roomChange.emit({ ...this.room(), length: preset.length, width: preset.width });
  }

  protected selectCustom(): void {
    this.manualPreset.set(CUSTOM);
  }

  protected updateDimension(key: 'length' | 'width' | 'height', event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.manualPreset.set(CUSTOM);
    this.roomChange.emit({ ...this.room(), [key]: value });
  }

  protected setWallColor(color: WallColor): void {
    this.roomChange.emit({ ...this.room(), wallColor: color });
  }

  protected setCustomWallColor(event: Event): void {
    this.setWallColor((event.target as HTMLInputElement).value as WallColor);
  }

  protected setFloor(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as FloorType;
    this.roomChange.emit({ ...this.room(), floorType: value });
  }

  protected rangeFill(key: 'length' | 'width' | 'height'): string {
    const { min, max } = ROOM_LIMITS[key];
    const percent = ((this.room()[key] - min) / (max - min)) * 100;
    return `${percent}%`;
  }
}
