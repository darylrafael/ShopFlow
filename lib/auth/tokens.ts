import { createSessionToken, hashSessionToken } from './crypto';

export function createOneTimeToken() {
  const token = createSessionToken();
  return { token, tokenHash: hashSessionToken(token) };
}

export const verificationExpiryMs = 24 * 60 * 60 * 1000;
export const passwordResetExpiryMs = 60 * 60 * 1000;
