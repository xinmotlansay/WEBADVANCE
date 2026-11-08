import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { FitStatus, WalkwayPassage } from 'shared';
import { VariantPickerService } from '../../services/cart/variant-picker.service';
import { CompactHeaderComponent } from '../../layout/compact-header/compact-header.component';
import { VndPipe } from '../../shared/pipes/vnd.pipe';
import { IconComponent } from '../../shared/ui/icons/icon.component';
import { PassageFormComponent } from './components/passage-form/passage-form.component';
import {
  PASSAGE_TYPE_NAMES,
  POSTURE_ADVICE,
  POSTURE_NAMES,
  STATUS_ICONS,
  STATUS_MESSAGES,
  STATUS_NAMES,
  TYPE_ICONS,
  clearanceLabel,
  describePassage,
} from './fit-labels';
import { FitYourHomeService } from '../../services/room/fit-your-home.service';

@Component({
  selector: 'app-fit-your-home',
  imports: [RouterLink, VndPipe, IconComponent, PassageFormComponent, CompactHeaderComponent],
  providers: [FitYourHomeService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'closeSearchOnOutsideClick($event)' },
  templateUrl: './fit-your-home.component.html',
  styleUrl: './fit-your-home.component.css',
})
export class FitYourHomeComponent {
  private readonly router = inject(Router);
  private readonly picker = inject(VariantPickerService);
  protected readonly fit = inject(FitYourHomeService);

  protected readonly statusNames = STATUS_NAMES;
  protected readonly statusMessages = STATUS_MESSAGES;
  protected readonly postureNames = POSTURE_NAMES;
  protected readonly typeNames = PASSAGE_TYPE_NAMES;
  protected readonly describePassage = describePassage;
  protected readonly statusIcons = STATUS_ICONS;
  protected readonly typeIcons = TYPE_ICONS;
  protected readonly clearanceLabel = clearanceLabel;

  /** `null`: form đóng, `-1`: thêm mới, `>= 0`: đang sửa điểm thứ i. */
  protected readonly editing = signal<number | null>(this.fit.passages().length === 0 ? -1 : null);
  protected readonly editingPassage = computed(() => {
    const index = this.editing();
    return index !== null && index >= 0 ? (this.fit.passages()[index] ?? null) : null;
  });
  protected readonly backFallback = computed(() => {
    const slug = this.fit.slug();
    return slug ? ['/products', slug] : ['/'];
  });
  /**
   * Các điểm trên hành trình. Kiện nguyên không qua được nhưng tháo rời thì qua được thì dùng kết quả
   * kiểm tra theo bộ phận và đánh dấu `byParts`.
   */
  protected readonly stops = computed(() => {
    const r = this.fit.result().data;
    if (!r) return [];
    const parts = r.verdict === 'FITS_BY_PARTS' ? r.partCheck : null;
    return (parts ?? r.packageCheck).details.map((d) => ({ ...d, byParts: !!parts }));
  });

  /** Kết luận lớn ở đầu kết quả: màu, tiêu đề và một câu giải thích. */
  protected readonly banner = computed(() => {
    const r = this.fit.result().data;
    if (!r) return null;
    const name = this.fit.product().data?.name ?? 'Sản phẩm';
    const details = r.packageCheck.details;
    const count = (status: FitStatus): number => details.filter((d) => d.status === status).length;

    let title: string;
    let text: string = STATUS_MESSAGES[r.status];
    if (r.verdict === 'DOES_NOT_FIT') {
      const failed = r.packageCheck.details.filter((d) => d.status === 'FAIL');
      title = failed.length
        ? `${name} không qua được: ${failed.map((d) => d.passageLabel).join(', ')}`
        : `${name} không qua được lối đi của bạn`;
    } else if (r.verdict === 'FITS_BY_PARTS') {
      title = `${name} qua được nếu tháo rời`;
      text = 'Kiện nguyên không qua được, nhưng sản phẩm qua được khi tháo rời các bộ phận.';
    } else if (r.status === 'CAUTION') {
      title = `${name} qua được, nhưng cần lưu ý ${count('CAUTION') || 1} điểm`;
    } else {
      title = `${name} qua được ${details.length > 1 ? `cả ${details.length} lối đi` : 'lối đi'} của bạn`;
    }
    return { status: r.status, title, text, hint: this.transportHint(r.usedDimensions.largest) };
  });

  protected readonly searchOpen = signal(false);
  protected readonly savedMessage = signal('');

  constructor() {
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.fit.slug.set(params.get('product'));
        this.fit.variantId.set(params.get('variant'));
      });
  }

  /** Ô tìm kiếm kèm lịch sử mở khi focus, đóng khi bấm ra ngoài vùng `.search`. */
  protected closeSearchOnOutsideClick(event: Event): void {
    if (!(event.target as Element).closest('.search')) this.searchOpen.set(false);
  }

  /**
   * Gợi ý hướng vận chuyển kiện lớn nhất qua các lối đi còn qua được. Cùng một tư thế ở mọi điểm thì
   * nói một câu chung, khác nhau thì liệt kê từng điểm. Không có điểm nào qua được thì không gợi ý.
   */
  private transportHint(largest: { length: number; width: number; height: number }): string | null {
    const passable = this.stops().filter((s) => s.status !== 'FAIL' && s.posture);
    if (passable.length === 0) return null;
    const size = `${largest.length} × ${largest.width} × ${largest.height} cm`;
    const postures = new Set(passable.map((s) => s.posture));
    if (postures.size === 1) {
      const advice = POSTURE_ADVICE[passable[0]!.posture!];
      const where =
        passable.length > 1
          ? `khi qua ${passable.length} lối đi`
          : `khi qua ${passable[0]!.passageLabel}`;
      return `Gợi ý vận chuyển: kiện lớn nhất (${size}) nên ${advice} ${where}.`;
    }
    const steps = passable.map((s) => `${s.passageLabel}: ${POSTURE_ADVICE[s.posture!]}`);
    return `Gợi ý vận chuyển kiện lớn nhất (${size}): ${steps.join('; ')}.`;
  }

  /** Mua ngay / Thêm giỏ qua popup chọn biến thể, giống thẻ sản phẩm. */
  protected openPicker(mode: 'add' | 'buy'): void {
    const slug = this.fit.slug();
    if (slug) this.picker.open({ mode, slug });
  }

  protected scrollToSimilar(): void {
    document.getElementById('similar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected selectProduct(slug: string): void {
    this.fit.searchTerm.set('');
    this.searchOpen.set(false);
    // Đổi sản phẩm trong trang không thêm vào lịch sử, để Back về đúng trang trước khi vào Fit.
    void this.router.navigate([], { queryParams: { product: slug }, replaceUrl: true });
  }

  protected selectVariant(variantId: string): void {
    void this.router.navigate([], {
      queryParams: { variant: variantId },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected onSearch(event: Event): void {
    this.fit.searchTerm.set((event.target as HTMLInputElement).value);
    this.searchOpen.set(true);
  }

  protected savePassage(passage: WalkwayPassage): void {
    const index = this.editing();
    if (index !== null && index >= 0) this.fit.updatePassage(index, passage);
    else this.fit.addPassage(passage);
    this.editing.set(null);
  }

  protected removePassage(index: number): void {
    this.fit.removePassage(index);
    if (this.editing() === index) this.editing.set(null);
  }

  protected saveProfile(): void {
    this.fit.saveProfile();
    this.savedMessage.set('Đã lưu hồ sơ lối đi trên trình duyệt này.');
  }
}
