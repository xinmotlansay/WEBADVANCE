import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { of, switchMap } from 'rxjs';
import {
  AdminApiService,
  apiMessage,
  type ProductDetail,
  type ProductInput,
} from '../../core/api/admin-api.service';
import { FORMAT_PIPES } from '../../shared/format';
import { PRODUCT_STATUS, toneClass } from '../../shared/status';
import { IconComponent } from '../../shared/ui/icon.component';
import { ToastService } from '../../shared/ui/toast';

const TIER_INFO: Record<number, string> = {
  1: 'Cấp 1 · Nhỏ (≤ 60 cm, ≤ 10 kg) · đối tác',
  2: 'Cấp 2 · Vừa (≤ 120 cm, ≤ 30 kg) · đối tác',
  3: 'Cấp 3 · Lớn (≤ 200 cm, ≤ 80 kg) · đội xe',
  4: 'Cấp 4 · Rất lớn (> 200 cm hoặc > 80 kg) · đội xe',
};

/** Gợi ý cấp vận chuyển theo kích thước và cân nặng (requirements Phần A mục 1.2). */
export function suggestTier(sides: number[], weight: number, packageCount: number): number | null {
  if (sides.some((s) => !(s > 0))) return null;
  const longest = Math.max(...sides);
  if (longest > 200 || weight > 80) return 4;
  if (longest > 120 || weight > 30 || packageCount > 1) return 3;
  if (longest > 60 || weight > 10) return 2;
  return 1;
}

type Num = number | null;

/** PA-04 / PA-05: thêm mới hoặc chỉnh sửa sản phẩm, biến thể, kiện hàng, bộ phận, ảnh. */
@Component({
  selector: 'app-product-form',
  imports: [ReactiveFormsModule, RouterLink, IconComponent, ...FORMAT_PIPES],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-form.component.html',
  styleUrl: './product-form.component.css',
})
export class ProductFormComponent implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /** Có `id` (từ route `san-pham/:id/sua`) là chế độ sửa. */
  readonly id = input<string>();

  protected readonly tierInfo = TIER_INFO;
  protected readonly tiers = [1, 2, 3, 4];
  protected readonly productStatus = PRODUCT_STATUS;
  protected readonly toneClass = toneClass;
  protected readonly saving = signal(false);
  protected readonly uploading = signal(0);
  protected readonly error = signal('');
  protected readonly submitted = signal(false);
  protected readonly product = signal<ProductDetail | null>(null);
  protected readonly isEdit = computed(() => !!this.id());

  protected readonly categories = rxResource({ loader: () => this.api.categoryOptions() });
  protected readonly productTypes = computed(() => (this.categories.value() ?? []).filter((c) => c.type === 'PRODUCT_CATEGORY'));
  protected readonly rooms = computed(() => (this.categories.value() ?? []).filter((c) => c.type === 'ROOM'));
  protected readonly styles = computed(() => (this.categories.value() ?? []).filter((c) => c.type === 'STYLE'));

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(150)]],
    skuRange: ['100', [Validators.pattern(/^\d{3}$/)]],
    shortDescription: ['', Validators.maxLength(500)],
    description: [''],
    productType: ['', Validators.required],
    roomIds: this.fb.control<string[]>([]),
    styleIds: this.fb.control<string[]>([]),
    tags: [''],
    searchKeywords: ['', Validators.maxLength(500)],
    warrantyMonths: this.fb.control<Num>(12, [Validators.required, Validators.min(0), Validators.max(120)]),
    warrantyTerms: [''],
    seoTitle: ['', Validators.maxLength(70)],
    seoDescription: ['', Validators.maxLength(170)],
    model3d: [''],
    images: this.fb.control<string[]>([]),
    parts: this.fb.array<FormGroup>([]),
    variants: this.fb.array<FormGroup>([]),
  });

  protected get variants(): FormArray<FormGroup> {
    return this.form.controls.variants;
  }

  protected get parts(): FormArray<FormGroup> {
    return this.form.controls.parts;
  }

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  /** Điều kiện lên kệ (PA-04): ảnh, giá, cấp vận chuyển, kích thước kiện. Cập nhật theo từng thao tác. */
  protected readonly checklist = computed(() => {
    const v = this.value();
    const active = (v.variants ?? []).filter((x) => x['status'] !== 'DISCONTINUED');
    return [
      { label: 'Có ít nhất 1 ảnh sản phẩm', ok: (v.images ?? []).length > 0 },
      { label: 'Có ít nhất 1 biến thể đang bán', ok: active.length > 0 },
      { label: 'Mọi biến thể có giá bán', ok: active.length > 0 && active.every((x) => Number(x['salePrice']) > 0) },
      { label: 'Mọi biến thể có cấp vận chuyển', ok: active.length > 0 && active.every((x) => !!x['shippingTier']) },
      {
        label: 'Mọi biến thể có kích thước kiện',
        ok: active.length > 0 && active.every((x) => (x['packages'] ?? []).length > 0),
      },
    ];
  });
  protected readonly readyToList = computed(() => this.checklist().every((item) => item.ok));
  protected readonly priceRange = computed(() => {
    const prices = (this.value().variants ?? []).map((x) => Number(x['salePrice'])).filter((p) => p > 0);
    return prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null;
  });
  protected readonly skuPreview = computed(() => this.product()?.productCode ?? `${this.value().skuRange || 'AAA'}.PPP`);

  /** Chế độ sửa: tải chi tiết rồi đổ vào form; thêm mới thì bắt đầu với một biến thể trống. */
  ngOnInit(): void {
    const id = this.id();
    if (!id) {
      this.addVariant();
      return;
    }
    this.api
      .product(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (product) => this.fill(product),
        error: (error: unknown) => this.error.set(apiMessage(error, 'Không tải được sản phẩm. Thử tải lại trang.')),
      });
  }

  // ----- Biến thể, kiện, bộ phận -----
  private variantGroup(data?: ProductDetail['variants'][number]): FormGroup {
    const group = this.fb.group({
      id: [data?.id ?? ''],
      sku: [data?.sku ?? ''],
      color: [data?.color ?? '', [Validators.required, Validators.maxLength(60)]],
      material: [data?.material ?? '', Validators.maxLength(100)],
      length: this.fb.control<Num>(data?.dimensions.length ?? null, [Validators.required, Validators.min(1)]),
      width: this.fb.control<Num>(data?.dimensions.width ?? null, [Validators.required, Validators.min(1)]),
      height: this.fb.control<Num>(data?.dimensions.height ?? null, [Validators.required, Validators.min(1)]),
      weight: this.fb.control<Num>(data?.weight ?? null, [Validators.required, Validators.min(0)]),
      originalPrice: this.fb.control<Num>(data?.originalPrice ?? null, [Validators.required, Validators.min(1)]),
      salePrice: this.fb.control<Num>(data?.salePrice ?? null, [Validators.required, Validators.min(1)]),
      stockQuantity: this.fb.control<Num>(data ? data.stockQuantity : 0, [Validators.min(0)]),
      lowStockThreshold: this.fb.control<Num>(data?.lowStockThreshold ?? 5, [Validators.required, Validators.min(0)]),
      shippingTier: this.fb.control<Num>(data?.shippingTier ?? null, Validators.required),
      installationService: [data?.installationService ?? 'NONE'],
      installationFee: this.fb.control<Num>(data?.installationFee || null),
      status: [data?.status ?? 'ACTIVE'],
      packages: this.fb.array<FormGroup>((data?.packages ?? []).map((p) => this.packageGroup(p))),
    });
    // Cấp 1–2 không có lắp đặt (requirements 1.2).
    group.controls['shippingTier'].valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((tier) => {
      if (Number(tier) < 3) group.patchValue({ installationService: 'NONE', installationFee: null }, { emitEvent: false });
    });
    return group;
  }

  private packageGroup(data?: { name?: string; length: number; width: number; height: number; weight: number }): FormGroup {
    return this.fb.group({
      name: [data?.name ?? ''],
      length: this.fb.control<Num>(data?.length ?? null, [Validators.required, Validators.min(1)]),
      width: this.fb.control<Num>(data?.width ?? null, [Validators.required, Validators.min(1)]),
      height: this.fb.control<Num>(data?.height ?? null, [Validators.required, Validators.min(1)]),
      weight: this.fb.control<Num>(data?.weight ?? null, [Validators.required, Validators.min(0)]),
    });
  }

  protected packagesOf(variant: FormGroup): FormArray<FormGroup> {
    return variant.controls['packages'] as FormArray<FormGroup>;
  }

  protected addVariant(copyFrom?: FormGroup): void {
    const group = this.variantGroup();
    if (copyFrom) {
      const { id: _id, sku: _sku, color: _color, stockQuantity: _stock, status: _status, packages, ...rest } = copyFrom.getRawValue();
      group.patchValue(rest);
      for (const pkg of packages as { name: string; length: number; width: number; height: number; weight: number }[]) {
        this.packagesOf(group).push(this.packageGroup(pkg));
      }
    }
    this.variants.push(group);
  }

  protected removeVariant(index: number): void {
    this.variants.removeAt(index);
  }

  protected toggleVariantStatus(variant: FormGroup): void {
    const status = variant.controls['status'];
    status.setValue(status.value === 'DISCONTINUED' ? 'ACTIVE' : 'DISCONTINUED');
    variant.markAsDirty();
  }

  /** Kiện đầu tiên lấy sẵn kích thước tổng thể để nhập nhanh. */
  protected addPackage(variant: FormGroup): void {
    const packages = this.packagesOf(variant);
    const v = variant.getRawValue();
    packages.push(
      this.packageGroup(
        packages.length === 0 && v.length && v.width && v.height
          ? { length: v.length, width: v.width, height: v.height, weight: v.weight ?? 0 }
          : undefined,
      ),
    );
  }

  protected removePackage(variant: FormGroup, index: number): void {
    this.packagesOf(variant).removeAt(index);
  }

  protected suggestedTier(variant: FormGroup): number | null {
    const v = variant.getRawValue();
    return suggestTier([Number(v.length), Number(v.width), Number(v.height)], Number(v.weight) || 0, this.packagesOf(variant).length);
  }

  protected applyTier(variant: FormGroup, tier: number): void {
    variant.controls['shippingTier'].setValue(tier);
    variant.markAsDirty();
  }

  protected addPart(data?: { id?: string; name: string; quantity: number; isDetachable: boolean }): void {
    this.parts.push(
      this.fb.group({
        id: [data?.id ?? ''],
        name: [data?.name ?? '', Validators.required],
        quantity: this.fb.control<Num>(data?.quantity ?? 1, [Validators.required, Validators.min(1)]),
        isDetachable: [data?.isDetachable ?? false],
      }),
    );
  }

  protected toggleIn(control: 'roomIds' | 'styleIds', id: string): void {
    const ctrl = this.form.controls[control];
    ctrl.setValue(ctrl.value.includes(id) ? ctrl.value.filter((v) => v !== id) : [...ctrl.value, id]);
    ctrl.markAsDirty();
  }

  // ----- Ảnh -----
  protected upload(files: FileList | null): void {
    const list = Array.from(files ?? []);
    const allowed = list.filter((f) => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type) && f.size <= 5 * 1024 * 1024);
    if (allowed.length < list.length) this.toast.show('Bỏ qua tệp không phải JPG/PNG/WebP hoặc lớn hơn 5 MB.', 'error');
    if (!allowed.length) return;
    this.uploading.update((n) => n + allowed.length);
    for (const file of allowed) {
      this.api.uploadProductImage(file).subscribe({
        next: (url) => {
          this.uploading.update((n) => n - 1);
          this.form.controls.images.setValue([...this.form.controls.images.value, url]);
          this.form.markAsDirty();
        },
        error: (error: unknown) => {
          this.uploading.update((n) => n - 1);
          this.toast.show(apiMessage(error), 'error');
        },
      });
    }
  }

  protected addImageUrl(input: HTMLInputElement): void {
    const url = input.value.trim();
    if (!/^(https?:\/\/|\/uploads\/)/.test(url)) {
      this.toast.show('Đường dẫn ảnh phải bắt đầu bằng https:// hoặc /uploads/.', 'error');
      return;
    }
    this.form.controls.images.setValue([...this.form.controls.images.value, url]);
    this.form.markAsDirty();
    input.value = '';
  }

  protected moveImage(index: number, delta: -1 | 1): void {
    const images = [...this.form.controls.images.value];
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    [images[index], images[target]] = [images[target], images[index]];
    this.form.controls.images.setValue(images);
    this.form.markAsDirty();
  }

  protected removeImage(index: number): void {
    this.form.controls.images.setValue(this.form.controls.images.value.filter((_, i) => i !== index));
    this.form.markAsDirty();
  }

  // ----- Lưu -----
  protected invalid(control: { invalid: boolean; touched: boolean }): boolean {
    return control.invalid && (control.touched || this.submitted());
  }

  protected save(publish: boolean): void {
    this.submitted.set(true);
    this.error.set('');
    if (this.form.invalid || !this.variants.length) {
      this.form.markAllAsTouched();
      this.error.set('Còn trường bắt buộc chưa hợp lệ. Kiểm tra các ô được đánh dấu đỏ.');
      return;
    }
    if (publish && !this.readyToList()) {
      this.error.set('Chưa đủ điều kiện lên kệ. Hoàn thành danh sách ở cột bên phải hoặc chọn "Lưu nháp".');
      return;
    }
    const body = this.toInput();
    const id = this.id();
    this.saving.set(true);
    (id ? this.api.updateProduct(id, body) : this.api.createProduct(body))
      .pipe(
        switchMap((saved) =>
          publish && saved.status !== 'ACTIVE' ? this.api.setProductStatus(saved.id, 'ACTIVE') : of(saved),
        ),
      )
      .subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.form.markAsPristine();
          this.toast.show(
            id ? `Đã lưu thay đổi cho ${saved.name}.` : `Đã tạo ${saved.name} (SKU ${saved.productCode}).${publish ? ' Sản phẩm đã lên kệ.' : ''}`,
          );
          void this.router.navigate(['/san-pham']);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.error.set(apiMessage(error));
        },
      });
  }

  protected setStatus(status: 'HIDDEN' | 'ACTIVE'): void {
    const id = this.id();
    if (!id || this.saving()) return;
    this.saving.set(true);
    this.api.setProductStatus(id, status).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.product.set(updated);
        this.toast.show(status === 'HIDDEN' ? `${updated.name} đã ẩn khỏi cửa hàng.` : `${updated.name} đã lên kệ.`);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(apiMessage(error));
      },
    });
  }

  /** Rời trang khi còn thay đổi chưa lưu thì hỏi lại. */
  canLeave(): boolean {
    return this.form.pristine || this.saving() || window.confirm('Bạn có thay đổi chưa lưu. Rời trang và bỏ thay đổi?');
  }

  private fill(product: ProductDetail): void {
    this.product.set(product);
    this.variants.clear();
    product.variants.forEach((v) => this.variants.push(this.variantGroup(v)));
    this.parts.clear();
    product.parts.forEach((p) => this.addPart(p));
    const byType = (type: string) => product.categories.filter((c) => c.type === type).map((c) => c.id);
    this.form.patchValue({
      name: product.name,
      skuRange: product.productCode.split('.')[0],
      shortDescription: product.shortDescription,
      description: product.description,
      productType: byType('PRODUCT_CATEGORY')[0] ?? '',
      roomIds: byType('ROOM'),
      styleIds: byType('STYLE'),
      tags: product.tags.join(', '),
      searchKeywords: product.searchKeywords,
      warrantyMonths: product.warrantyMonths,
      warrantyTerms: product.warrantyTerms,
      seoTitle: product.seo.title,
      seoDescription: product.seo.description,
      model3d: product.media.find((m) => m.type === 'MODEL_3D')?.url ?? '',
      images: product.media.filter((m) => m.type === 'IMAGE').map((m) => m.url),
    });
    this.form.markAsPristine();
  }

  private toInput(): ProductInput {
    const v = this.form.getRawValue();
    const num = (value: unknown) => Number(value) || 0;
    return {
      name: v.name.trim(),
      ...(this.isEdit() ? {} : { skuRange: v.skuRange }),
      shortDescription: v.shortDescription.trim(),
      description: v.description.trim(),
      searchKeywords: v.searchKeywords.trim(),
      tags: v.tags.split(',').map((t) => t.trim()).filter(Boolean),
      categoryIds: [v.productType, ...v.roomIds, ...v.styleIds].filter(Boolean),
      seo: { title: v.seoTitle.trim(), description: v.seoDescription.trim() },
      warrantyMonths: num(v.warrantyMonths),
      warrantyTerms: v.warrantyTerms.trim(),
      parts: v.parts.map((p) => ({
        ...(p['id'] ? { id: p['id'] } : {}),
        name: String(p['name']).trim(),
        quantity: num(p['quantity']),
        isDetachable: !!p['isDetachable'],
      })),
      media: [
        ...v.images.map((url) => ({ url, type: 'IMAGE' as const })),
        ...(v.model3d.trim() ? [{ url: v.model3d.trim(), type: 'MODEL_3D' as const }] : []),
      ],
      variants: v.variants.map((x) => ({
        ...(x['id'] ? { id: x['id'] } : {}),
        color: String(x['color']).trim(),
        material: String(x['material']).trim(),
        dimensions: { length: num(x['length']), width: num(x['width']), height: num(x['height']) },
        weight: num(x['weight']),
        originalPrice: num(x['originalPrice']),
        salePrice: num(x['salePrice']),
        stockQuantity: num(x['stockQuantity']),
        lowStockThreshold: num(x['lowStockThreshold']),
        shippingTier: num(x['shippingTier']),
        installationService: x['installationService'],
        installationFee: num(x['installationFee']),
        status: x['status'],
        packages: (x['packages'] as Record<string, unknown>[]).map((p) => ({
          name: String(p['name'] ?? '').trim() || undefined,
          length: num(p['length']),
          width: num(p['width']),
          height: num(p['height']),
          weight: num(p['weight']),
        })),
      })),
    };
  }
}
