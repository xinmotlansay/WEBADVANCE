import type { RoleName } from '../enums/role.enum';
import type { ApiResponse } from '../models/api-response.model';

export type OtpPurposeValue =
  | 'REGISTER'
  | 'LINK_GOOGLE'
  | 'FORGOT_PASSWORD'
  | 'CHANGE_CONTACT'
  | 'DELETE_ACCOUNT'
  | 'ADMIN_SET_PASSWORD';

export type OtpChannelValue = 'EMAIL' | 'PHONE';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string | null;
  phoneNumber: string | null;
  avatar: string;
  roleName: RoleName;
  mustChangePassword: boolean;
}

export interface OtpSendRequest {
  purpose: OtpPurposeValue;
  channel: OtpChannelValue;
  target: string;
}

export interface OtpSendResponse {
  otpId: string;
  expiresAt: string;
  resendAvailableAt: string;
  /** Chỉ có khi giả lập SMS ở môi trường dev. */
  devCode?: string;
}

export interface OtpVerifyRequest {
  otpId: string;
  code: string;
}

export interface OtpVerifyResponse {
  verified: boolean;
}

export interface RegisterRequest {
  fullName: string;
  dateOfBirth?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  password: string;
  termsAccepted: boolean;
  otpId: string;
}

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface ResetPasswordRequest {
  otpId: string;
  newPassword: string;
}

export interface GoogleLoginRequest {
  idToken: string;
}

export interface GoogleEmailExistsDetails {
  linkToken: string;
  verifyMethods: Array<'PASSWORD' | 'OTP_EMAIL'>;
  email: string;
}

export interface GoogleLinkOtpRequest {
  linkToken: string;
}

export interface GoogleLinkOtpResponse {
  otpId: string;
  expiresAt: string;
  resendAvailableAt: string;
  email: string;
}

export interface GoogleLinkRequest {
  linkToken: string;
  password?: string;
  otpId?: string;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}
