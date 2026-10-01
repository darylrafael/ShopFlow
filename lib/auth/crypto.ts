import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { scrypt as scryptCallback } from 'node:crypto';

const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELISM = 1;

function deriveKey(password: string, salt: Buffer, cost: number, blockSize: number, parallelism: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, 64, { N: cost, r: blockSize, p: parallelism }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt, SCRYPT_COST, SCRYPT_BLOCK_SIZE, SCRYPT_PARALLELISM);
  return `scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELISM}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelism, saltValue, hashValue] = stored.split('$');
  if (algorithm !== 'scrypt' || !cost || !blockSize || !parallelism || !saltValue || !hashValue) return false;
  const derived = await deriveKey(password, Buffer.from(saltValue, 'base64url'), Number(cost), Number(blockSize), Number(parallelism));
  const expected = Buffer.from(hashValue, 'base64url');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function getSessionSecret() {
  const secret = process.env['SHOPFLOW_SESSION_SECRET'];
  if (!secret && process.env['NODE_ENV'] === 'production') throw new Error('SHOPFLOW_SESSION_SECRET is required in production');
  return secret || 'local-development-session-secret-change-me';
}

export function signValue(value: string) {
  return createHmac('sha256', getSessionSecret()).update(value).digest('hex');
}
