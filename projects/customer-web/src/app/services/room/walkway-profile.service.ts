import { Injectable } from '@angular/core';
import type { WalkwayPassage, WalkwayProfile } from 'shared';
import { readLocal, writeLocal } from '../../core/storage/local-store';

const PROFILE_KEY = 'caraveso.walkwayProfile';
const DRAFT_KEY = 'caraveso.walkwayDraft';

/**
 * Hồ sơ lối đi lưu ở trình duyệt vì chưa có đăng nhập.
 * TODO(FR-14, FR-25): khi có auth, đổi `loadProfile`/`saveProfile` sang `/users/me/walkway-profiles`.
 */
@Injectable({ providedIn: 'root' })
export class WalkwayProfileService {
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
