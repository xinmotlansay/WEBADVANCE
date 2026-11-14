import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyIdToken } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));

import { config } from '../config/index.js';
import { verifyGoogleIdToken } from './google.js';

const CLIENT_ID = 'client-id.apps.googleusercontent.com';
const originalClientId = config.googleClientId;

describe('verifyGoogleIdToken', () => {
  beforeEach(() => {
    config.googleClientId = CLIENT_ID;
    verifyIdToken.mockReset();
  });

  afterEach(() => {
    config.googleClientId = originalClientId;
  });

  it('verifies against the configured client ID and maps a verified Google profile', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-user-id',
        email: 'User@Example.com',
        email_verified: true,
        name: ' Google User ',
        picture: 'https://example.com/avatar.png',
      }),
    });

    await expect(verifyGoogleIdToken('google-id-token')).resolves.toEqual({
      googleId: 'google-user-id',
      email: 'user@example.com',
      fullName: 'Google User',
      avatar: 'https://example.com/avatar.png',
    });
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'google-id-token',
      audience: CLIENT_ID,
    });
  });

  it('rejects unverified Google email addresses', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-user-id',
        email: 'user@example.com',
        email_verified: false,
      }),
    });

    await expect(verifyGoogleIdToken('google-id-token')).rejects.toMatchObject({
      code: 'GOOGLE_EMAIL_NOT_VERIFIED',
      httpStatus: 401,
    });
  });

  it('fails explicitly when the OAuth client ID is not configured', async () => {
    config.googleClientId = '';

    await expect(verifyGoogleIdToken('google-id-token')).rejects.toMatchObject({
      code: 'GOOGLE_LOGIN_NOT_CONFIGURED',
      httpStatus: 500,
    });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});
