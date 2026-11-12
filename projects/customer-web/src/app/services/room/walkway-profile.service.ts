import { Injectable, inject } from '@angular/core';
import { type Observable, of } from 'rxjs';
import type { WalkwayPassage, WalkwayProfile } from 'shared';
import { AccountApiService, type WalkwayProfile as AccountProfile } from '../account/account-api.service';
import { AuthService } from '../auth/auth.service';
import { readLocal, writeLocal } from '../../core/storage/local-store';

const PROFILE_KEY = 'caraveso.walkwayProfile';
const DRAFT_KEY = 'caraveso.walkwayDraft';

/**
 * Hồ sơ lối đi lưu ở trình duyệt vì chưa có đăng nhập.
 * TODO(FR-14, FR-25): khi có auth, đổi `loadProfile`/`saveProfile` sang `/users/me/walkway-profiles`.
 */
@Injectable({ providedIn: 'root' })
export class WalkwayProfileService {
  private readonly auth = inject(AuthService);
  private readonly account = inject(AccountApiService);

  get loggedIn(): boolean {
    return this.auth.isAuthenticated();
  }

  /** Danh sách hồ sơ nhà trong tài khoản (rỗng nếu chưa đăng nhập). */
  listRemote(): Observable<AccountProfile[]> {
    return this.loggedIn ? this.account.walkwayProfiles() : of([]);
  }

  /** Cập nhật hồ sơ đã chọn, hoặc tạo hồ sơ mới nếu `id` rỗng. */
  saveRemote(
    existing: AccountProfile | null,
    passages: WalkwayPassage[],
    newName: string,
    makeDefault: boolean,
  ): Observable<AccountProfile> {
    const passagesBody = passages as AccountProfile['passages'];
    return existing
      ? this.account.updateWalkwayProfile(existing.id, {
          name: existing.name,
          address: existing.address,
          isDefault: existing.isDefault,
          passages: passagesBody,
        })
      : this.account.createWalkwayProfile({
          name: newName,
          address: '',
          isDefault: makeDefault,
          passages: passagesBody,
        });
  }

  loadProfile(): WalkwayProfile | null {
    return readLocal<WalkwayProfile | null>(PROFILE_KEY, null);
  }

  saveProfile(profile: WalkwayProfile): void {
    writeLocal(PROFILE_KEY, profile);
  }

  /** Nháp đang nhập, giữ lại khi tải lại trang. */
  loadDraft(): WalkwayPassage[] | null {
    return readLocal<WalkwayPassage[] | null>(DRAFT_KEY, null);
  }

  saveDraft(passages: WalkwayPassage[]): void {
    writeLocal(DRAFT_KEY, passages);
  }
}
