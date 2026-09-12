import { z } from 'zod';
import { HttpsError } from 'firebase-functions/v2/https';

/**
 * Schemas for anything crossing a trust boundary. The public quote and review
 * endpoints are unauthenticated, so nothing they send is taken on trust.
 */

export const addressSchema = z.object({
  line1: z.string().trim().min(1, 'Address is required').max(120),
  line2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(1, 'Town or city is required').max(80),
  postcode: z
    .string()
    .trim()
    .max(10)
    .regex(/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i, 'Enter a valid UK postcode'),
});

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date');

export const ukPhoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .refine(
    (value) => /^(\+44|0044|0)7\d{9}$/.test(value) || /^(\+44|0044|0)\d{9,10}$/.test(value),
    'Enter a valid UK phone number',
  );

export const lineItemSchema = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: z.number().positive().max(1000),
  unitPricePence: z.number().int().min(0).max(10_000_000),
});

/**
 * A full-day job must occupy the `full` slot and a repair must occupy am or pm.
 * Enforcing it here means the diary logic downstream never has to consider
 * nonsense combinations like a full-day job in the morning slot.
 */
export function assertSlotMatchesType(type: 'full_day' | 'repair', slot: 'full' | 'am' | 'pm'): void {
  if (type === 'full_day' && slot !== 'full') {
    throw new HttpsError('invalid-argument', 'A full-day job must take the whole day.');
  }
  if (type === 'repair' && slot === 'full') {
    throw new HttpsError('invalid-argument', 'A repair must be booked into a morning or afternoon slot.');
  }
}

/** Runs a schema and converts failures into a client-readable HttpsError. */
export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join('. ');
    throw new HttpsError('invalid-argument', message || 'Invalid request.');
  }
  return result.data;
}
