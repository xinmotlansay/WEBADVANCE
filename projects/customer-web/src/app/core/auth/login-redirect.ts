import type { Params } from '@angular/router';

export type LoginReason = 'login-required' | 'session-expired';

const LOGIN_NOTICES: Record<LoginReason, string> = {
  'login-required': 'Bạn cần đăng nhập để sử dụng tính năng này.',
  'session-expired': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
};

/** Query params cho trang đăng nhập: quay lại `returnUrl` sau khi đăng nhập và báo lý do. */
export function loginQueryParams(returnUrl: string, reason: LoginReason = 'login-required'): Params {
  return { returnUrl, reason };
}

/** Thông báo hiển thị trên trang đăng nhập, hoặc null nếu không có lý do hợp lệ. */
export function loginNoticeFor(reason: string | null): string | null {
  return reason && reason in LOGIN_NOTICES ? LOGIN_NOTICES[reason as LoginReason] : null;
}
