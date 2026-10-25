import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
  input,
  output,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { WarrantyService } from 'shared';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/api-error';
import { EvidenceUploadComponent } from '../../shared/ui/evidence-upload/evidence-upload.component';
@Component({
  selector: 'app-warranty-form',
  imports: [ReactiveFormsModule, RouterLink, EvidenceUploadComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './warranty-form.component.html',
})
export class WarrantyFormComponent {
  readonly embedded = input(false);
  readonly requestCreated = output<string>();
  private readonly api = inject(WarrantyService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  protected readonly cards = signal<import('shared').WarrantyCard[] | null | undefined>(undefined);
  protected readonly evidence = signal<string[]>([]);
  protected readonly uploading = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly form = this.fb.nonNullable.group({
    warrantyCardId: [this.route.snapshot.queryParamMap.get('card') ?? '', Validators.required],
    defectDescription: [
      '',
      [Validators.required, Validators.minLength(10), Validators.maxLength(3000)],
    ],
    contact: this.fb.nonNullable.group({
      name: [
        this.auth.user()?.fullName ?? '',
        [Validators.required, Validators.minLength(2), Validators.maxLength(100)],
      ],
      phone: ['', [Validators.required, Validators.pattern(/^(?:0|\+?84)\d{9,10}$/)]],
      address: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
    }),
  });
  constructor() {
    this.reload();
  }
  protected reload(): void {
    this.cards.set(undefined);
    this.api
      .cards()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (cards) => this.cards.set(cards), error: () => this.cards.set(null) });
  }
  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.evidence().length || this.loading() || this.uploading()) return;
    this.error.set('');
    this.loading.set(true);
    this.api
      .create({ ...this.form.getRawValue(), evidence: this.evidence() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (this.embedded()) {
            this.requestCreated.emit(result.id);
            this.loading.set(false);
          } else void this.router.navigate(['/account/warranty', result.id]);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error));
          this.loading.set(false);
        },
      });
  }
}
