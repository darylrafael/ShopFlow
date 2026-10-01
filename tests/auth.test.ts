import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../lib/auth/crypto';

describe('ShopFlow authentication crypto', () => {
  it('hashes and verifies a password without storing the plaintext', async () => {
    const password = 'A secure planner password 2026!';
    const hash = await hashPassword(password);

    expect(hash).not.toContain(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });
});
