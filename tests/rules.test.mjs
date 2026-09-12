/**
 * Security-rule tests.
 *
 * The rules are the last line of defence: the route guard in the browser only
 * decides what to render, and anyone can talk to Firestore directly with the
 * public web config. These tests assert the two things that actually matter —
 * the public can read the booking calendar and nothing else, and a signed-in
 * user without the admin claim is no better off than a stranger.
 *
 * Requires the Firestore emulator on 127.0.0.1:8080.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'skimcity-rules-test',
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });

  // Seed through a context that bypasses rules, so the reads under test have
  // something real to find.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'availability', '2026-09-01'), {
      date: '2026-09-01',
      fullDayTaken: true,
      amTaken: true,
      pmTaken: false,
      blocked: false,
    });
    await setDoc(doc(db, 'customers', 'c1'), { name: 'Danielle Hartley', email: 'd@example.com' });
    await setDoc(doc(db, 'jobs', 'j1'), { customerId: 'c1', date: '2026-09-01', status: 'confirmed' });
    await setDoc(doc(db, 'invoices', 'i1'), { customerId: 'c1', number: 'SC-0001', totalPence: 42000 });
    await setDoc(doc(db, 'payments', 'p1'), { invoiceId: 'i1', amountPence: 8400 });
    await setDoc(doc(db, 'dayBookings', '2026-09-01'), { date: '2026-09-01', fullDayJobId: 'j1' });
    await setDoc(doc(db, 'settings', 'business'), { depositPercent: 20 });
    await setDoc(doc(db, 'counters', 'invoices'), { value: 1 });
    await setDoc(doc(db, 'reviews', 'r1'), {
      authorName: 'Susan W.',
      rating: 5,
      body: 'Tidy job.',
      status: 'published',
      requestToken: 'secret-review-token',
    });
    await setDoc(doc(db, 'galleryItems', 'g1'), {
      title: 'Ceiling re-skim',
      afterUrl: 'https://example.com/a.jpg',
      published: true,
      order: 0,
    });
  });
});

after(async () => {
  await testEnv?.cleanup();
});

describe('unauthenticated visitors', () => {
  const db = () => testEnv.unauthenticatedContext().firestore();

  it('cannot read the diary projection', async () => {
    await assertFails(getDoc(doc(db(), 'availability', '2026-09-01')));
  });

  it('cannot write to the diary projection', async () => {
    await assertFails(setDoc(doc(db(), 'availability', '2026-09-01'), { blocked: true }));
  });

  it('cannot read customers', async () => {
    await assertFails(getDoc(doc(db(), 'customers', 'c1')));
  });

  it('cannot list customers', async () => {
    await assertFails(getDocs(collection(db(), 'customers')));
  });

  it('cannot read jobs', async () => {
    await assertFails(getDoc(doc(db(), 'jobs', 'j1')));
  });

  it('cannot read invoices', async () => {
    await assertFails(getDoc(doc(db(), 'invoices', 'i1')));
  });

  it('cannot read the private dayBookings mirror', async () => {
    await assertFails(getDoc(doc(db(), 'dayBookings', '2026-09-01')));
  });

  it('cannot create a job directly, bypassing requestBooking', async () => {
    await assertFails(setDoc(doc(db(), 'jobs', 'forged'), { date: '2026-09-02', status: 'confirmed' }));
  });

  it('can read the gallery', async () => {
    // World-readable on purpose: the marketing site renders it, and the images
    // already sit at public Storage URLs.
    await assertSucceeds(getDoc(doc(db(), 'galleryItems', 'g1')));
  });

  it('cannot write to the gallery', async () => {
    await assertFails(setDoc(doc(db(), 'galleryItems', 'g1'), { title: 'Defaced' }));
    await assertFails(setDoc(doc(db(), 'galleryItems', 'spam'), { title: 'Buy cheap watches' }));
  });

  it('cannot read reviews, even published ones', async () => {
    // Unlike the gallery, this collection is NOT world-readable: the documents
    // hold review-request tokens, and anyone who could read them could post a
    // review as that customer. The public site goes through getReviews.
    await assertFails(getDoc(doc(db(), 'reviews', 'r1')));
  });

  it('cannot list reviews to harvest request tokens', async () => {
    await assertFails(getDocs(collection(db(), 'reviews')));
  });

  it('cannot post a review directly, bypassing the invite', async () => {
    await assertFails(
      setDoc(doc(db(), 'reviews', 'fake'), { authorName: 'Bot', rating: 5, body: 'Best plasterer ever' }),
    );
  });

  it('cannot tamper with an existing review', async () => {
    await assertFails(setDoc(doc(db(), 'reviews', 'r1'), { rating: 1 }));
  });
});

describe('signed in without the admin claim', () => {
  const db = () => testEnv.authenticatedContext('some-user', { email: 'nosy@example.com' }).firestore();

  it('cannot read customers', async () => {
    await assertFails(getDoc(doc(db(), 'customers', 'c1')));
  });

  it('cannot read invoices', async () => {
    await assertFails(getDoc(doc(db(), 'invoices', 'i1')));
  });

  it('cannot read payments', async () => {
    await assertFails(getDoc(doc(db(), 'payments', 'p1')));
  });

  it('cannot write settings', async () => {
    await assertFails(setDoc(doc(db(), 'settings', 'business'), { depositPercent: 0 }));
  });

  it('cannot grant itself anything by writing a job', async () => {
    await assertFails(setDoc(doc(db(), 'jobs', 'j1'), { status: 'cancelled' }));
  });

  it('cannot post photos to the gallery', async () => {
    await assertFails(setDoc(doc(db(), 'galleryItems', 'spam'), { title: 'Not allowed' }));
  });

  it('cannot read reviews or their request tokens', async () => {
    await assertFails(getDoc(doc(db(), 'reviews', 'r1')));
  });

  it('cannot post a review', async () => {
    await assertFails(setDoc(doc(db(), 'reviews', 'fake'), { rating: 5, body: 'Nice one' }));
  });
});

describe('admin', () => {
  const db = () => testEnv.authenticatedContext('chris', { admin: true }).firestore();

  it('can read and write customers', async () => {
    await assertSucceeds(getDoc(doc(db(), 'customers', 'c1')));
    await assertSucceeds(setDoc(doc(db(), 'customers', 'c1'), { name: 'Danielle Hartley', notes: 'Repeat' }));
  });

  it('can read and write jobs', async () => {
    await assertSucceeds(getDoc(doc(db(), 'jobs', 'j1')));
    await assertSucceeds(setDoc(doc(db(), 'jobs', 'j1'), { status: 'in_progress' }));
  });

  it('can read invoices', async () => {
    await assertSucceeds(getDoc(doc(db(), 'invoices', 'i1')));
  });

  it('can read payments but NOT write them', async () => {
    await assertSucceeds(getDoc(doc(db(), 'payments', 'p1')));
    // The ledger is written only by Cloud Functions via the Admin SDK, so the
    // record of money received cannot be edited from a browser session.
    await assertFails(setDoc(doc(db(), 'payments', 'p1'), { amountPence: 999999 }));
  });

  it('cannot touch the invoice number counter', async () => {
    await assertFails(setDoc(doc(db(), 'counters', 'invoices'), { value: 500 }));
  });

  it('can read availability — the diary renders from it', async () => {
    await assertSucceeds(getDoc(doc(db(), 'availability', '2026-09-01')));
  });

  it('cannot write availability directly', async () => {
    await assertFails(setDoc(doc(db(), 'availability', '2026-09-01'), { blocked: true }));
  });

  it('can read and write settings', async () => {
    await assertSucceeds(setDoc(doc(db(), 'settings', 'business'), { depositPercent: 25 }));
  });

  it('can manage the gallery', async () => {
    await assertSucceeds(setDoc(doc(db(), 'galleryItems', 'g1'), { title: 'Ceiling re-skim', published: false }));
    await assertSucceeds(setDoc(doc(db(), 'galleryItems', 'g2'), { title: 'New photo', order: 1 }));
  });

  it('can read and moderate reviews', async () => {
    await assertSucceeds(getDoc(doc(db(), 'reviews', 'r1')));
    await assertSucceeds(setDoc(doc(db(), 'reviews', 'r1'), { status: 'published' }));
  });
});

describe('unknown collections', () => {
  it('are denied even to an admin', async () => {
    const db = testEnv.authenticatedContext('chris', { admin: true }).firestore();
    await assertFails(getDoc(doc(db, 'secrets', 'whatever')));
    await assertFails(setDoc(doc(db, 'secrets', 'whatever'), { value: 1 }));
  });
});
