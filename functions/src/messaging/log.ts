import { COLLECTIONS, db } from '../lib/firebase';
import { nowIso } from '../lib/dates';
import type { MessageChannel, MessageLogEntry } from '../domain';

/**
 * Audit trail for everything sent to a customer. When someone says "I never
 * got the quote", this is the answer.
 */
export async function logMessage(entry: {
  channel: MessageChannel;
  template: string;
  to: string;
  subject?: string;
  relatedTo?: MessageLogEntry['relatedTo'];
  status: MessageLogEntry['status'];
  error?: string;
}): Promise<void> {
  try {
    await db.collection(COLLECTIONS.messageLog).add({ ...entry, createdAt: nowIso() });
  } catch (error) {
    // Never let an audit-log failure take down the thing being audited.
    console.error('Failed to write message log', error);
  }
}
