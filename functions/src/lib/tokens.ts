import { randomBytes } from 'node:crypto';

/**
 * Tokens for public quote links. These are the only thing standing between a
 * URL and a customer's quote, so they use CSPRNG bytes rather than anything
 * derived from a document id or timestamp.
 */
export function generateToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}
