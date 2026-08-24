import { randomBytes } from 'node:crypto';

/**
 * Tokens for public quote links. These are the only thing standing between a
 * URL and a customer's quote, so they use CSPRNG bytes rather than anything
 * derived from a document id or timestamp.
 */
export function generateToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

/** Short human-facing reference, e.g. `Q-7F3K2A`. */
export function generateReference(prefix: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
  let out = '';
  const random = randomBytes(6);
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[random[i] % alphabet.length];
  }
  return `${prefix}-${out}`;
}
