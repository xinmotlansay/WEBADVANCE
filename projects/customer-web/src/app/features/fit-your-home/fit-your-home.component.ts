import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { WalkwayPassage } from 'shared';
import { CompactHeaderComponent } from '../../layout/compact-header/compact-header.component';
import { VndPipe } from '../../shared/pipes/vnd.pipe';
import { IconComponent } from '../../shared/ui/icons/icon.component';
import { PassageFormComponent } from './components/passage-form/passage-form.component';
import {
  PASSAGE_TYPE_NAMES,
  POSTURE_NAMES,
  STATUS_MESSAGES,
  STATUS_NAMES,
  describePassage,
} from './fit-labels';
import { FitYourHomeService } from './fit-your-home.service';

@Component({
  selector: 'app-fit-your-home',
  imports: [RouterLink, VndPipe, IconComponent, PassageFormComponent, CompactHeaderComponent],
  providers: [FitYourHomeService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fit-your-home.component.html',
  styleUrl: './fit-your-home.component.css',
})
export class FitYourHomeComponent {
  private readonly router = inject(Router);
  protected readonly fit = inject(FitYourHomeService);

  protected readonly statusNames = STATUS_NAMES;
  protected readonly statusMessages = STATUS_MESSAGES;
  protected readonly postureNames = POSTURE_NAMES;
  protected readonly typeNames = PASSAGE_TYPE_NAMES;
  protected readonly describePassage = describePassage;

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
