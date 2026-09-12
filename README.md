# SKIM CITY

**Taking the rough to the smooth.**

Plastering CRM, booking system and payments for Skim City, Manchester.
A public marketing site with self-service booking, feeding a private CRM where
Chris runs the pipeline: enquiry → quote → confirmed job → deposit → completed →
balance → paid.

---

## What's in here

```
skim-city/
├── web/          Vite + React + TypeScript + Tailwind v4  → Firebase Hosting
├── functions/    Cloud Functions v2 (Node 22, TypeScript) → europe-west2
├── shared/       Canonical domain types, synced into both packages
├── scripts/      grant-admin, seed, sync-types
└── firestore.rules · storage.rules · firestore.indexes.json · firebase.json
```

**Public site** — `/`, `/services`, `/gallery`, `/reviews`, `/contact`, `/privacy`, `/terms`
**Customer-facing, no login** — `/quote/:token`, `/pay/success`, `/pay/cancel`
**CRM (admin claim required)** — `/app` dashboard, diary, jobs, customers, quotes, invoices, payments, settings

**Deploying?** See [DEPLOYMENT.md](DEPLOYMENT.md) — CI/CD is wired up through
GitHub Actions, and there are a few one-off credential steps to do first.

---

## Getting it running locally

```bash
npm run install:all                      # installs web/ and functions/
cp web/.env.example web/.env.local       # then fill in the Firebase web config
```

Get the web config from
[console.firebase.google.com/project/skimcity-bac3b](https://console.firebase.google.com/project/skimcity-bac3b)
→ Project settings → General → Your apps → Web app. Those values are public
identifiers, not secrets.

Then, in two terminals:

```bash
# 1 — emulators (Auth, Firestore, Functions, Storage)
npm --prefix functions run build
npm run emulators

# 2 — dev server, pointed at the emulators
#     set VITE_USE_EMULATORS=true in web/.env first
npm run dev
```

Seed some demo data and give yourself CRM access:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run grant-admin -- chris@skimcity.co.uk
```

The seed script **refuses to run against a live database** unless you pass
`--force`, and a production build **refuses to run with placeholder Firebase
config**. Both guards are deliberate: the first stops fabricated invoices
landing in the real books, the second stops a deploy that looks fine and
silently fails every booking.

## Tests

```bash
npm run emulators   # in another terminal — the rules tests need Firestore
npm test
```

`tests/rules.test.mjs` asserts the two things that actually matter: the public
can read nothing at all, and a signed-in user without the admin claim is no
better off than a stranger.

---

## How the diary works

The rule, in one sentence: **a working day is either one full-day job, or up to
two repair slots (AM and PM).**

- Booking a full day consumes both repair slots.
- Booking one repair slot leaves the other half free but rules out a full day.
- `dayBookings/{date}` is the authoritative record and the lock.
- `availability/{date}` is a projection of it — booleans only, admin-read.

The two stay separate because the diary renders from the projection without
needing job ids. Neither is world-readable: there is no public calendar.

Concurrency is handled in `functions/src/booking/availability.ts`. `createJob`
claims the days inside a transaction, so two jobs cannot take the same slot —
Firestore retries the loser, which then sees the slot taken. Jobs are only
created from the CRM, so this is now a safety net rather than a race the public
can trigger. The `onJobWrite` trigger is a *reconciler*, not the guard:
it rebuilds a day from the jobs collection whenever anything is cancelled,
rescheduled or edited by hand.

---

## Payments

Stripe is the payment processor. Everything above
`functions/src/payments/processor.ts` works in terms of the `PaymentAdapter`
interface and never imports a vendor SDK directly, so a second processor would
be a change to `functions/src/payments/` alone.

Money is **integer pence everywhere**. Quotes get split into deposits and
percentages, and floating-point pounds accumulate rounding error the moment you
do that. Conversion happens only at the UI edges.

### Webhook idempotency

Both processors retry webhooks, and a duplicate would overstate revenue. Two
independent guards, in `functions/src/payments/apply.ts`:

1. the ledger document id is derived from the processor's event id, so a replay
   overwrites rather than appends; and
2. we compare the processor's **cumulative** paid total against what we have
   already recorded, and do nothing when the delta is not positive.

The second guard is the load-bearing one — it also makes partial payments and
out-of-order delivery behave correctly.

Both handlers read `req.rawBody`, never `req.body`. Signature verification runs
over the exact bytes the processor sent; a JSON body parser would re-serialise
the payload and every signature would fail.

---

## Gallery

Photos are uploaded in the CRM at **/app/gallery** and appear on the public
**/gallery** page once published.

- **Straight off a phone is fine.** Images are resized to 1800px and re-encoded
  as JPEG *in the browser before upload* — a 780KB photo lands as ~245KB. A raw
  iPhone photo is 5–12MB, which would be slow for Chris on site and brutal for
  every visitor who later loads the page.
- **EXIF orientation is applied** during that step, so portrait photos don't
  arrive on their side. Safari also decodes HEIC here, which is what turns an
  iPhone photo into something every browser can show.
- **Optional "before" photo** per item. Add one and the tile becomes a
  before/after comparison slider, built on a real `<input type="range">` so it
  works with touch, keyboard and screen readers.
- **New photos start hidden.** A photo with no title or description isn't ready
  for the site, so Publish stays disabled until both are filled in.
- **Deleting** goes through a Cloud Function so the Firestore document and both
  image files are removed together — deleting from the browser would leave
  orphaned files in the bucket every time it half-failed.

`published` is a display flag, not a security boundary: the images sit at public
Storage URLs either way. Don't put anything private in the gallery.

The public page reads through the `getGallery` callable rather than Firestore
directly, so the marketing bundle never has to load the Firestore SDK.

---

## Reviews

Reviews are invite-only. There is **no public "leave a review" form** — Chris
taps *Ask for a review* on a completed job, the customer gets a private
tokenised link by email, and that link is the only way in. Two consequences
worth knowing:

- **Nothing can be spammed in.** No CAPTCHA needed, because there is no open
  endpoint to attack.
- **Every review traces to real work.** A review exists only against a job that
  was actually finished.

Flow: job completed → *Ask for a review* → customer opens `/review/:token` →
rates and writes → lands in the CRM as `pending` → Chris publishes it → it
appears on `/reviews` and in the home page strip.

Details that matter:

- **The link keeps working after they review.** Clicking it again says "you've
  already left a review, thank you" rather than "link not valid" — the
  `submittedAt` guard is what prevents overwriting, so there is no reason to
  burn the token and confuse someone who clicks twice.
- **Names are shortened**, "Danielle Hartley" → "Danielle H.", and only the town
  is shown. The customer can edit how they appear before submitting.
- **Moderation is a publish step, not a filter for bad reviews.** Unmoderated
  text on a public page is a liability whoever wrote it. Bad reviews are worth
  publishing and replying to — there's a public reply field for exactly that.
- **`reviews` is not publicly readable**, unlike `galleryItems`. The documents
  hold request tokens; anyone who could read the collection could harvest one
  and post as that customer. The site reads through the `getReviews` callable.
- **Reviews given by text or in person** can be typed in via *Add one manually*.
  They're tagged `source: 'manual'` so it stays obvious in the CRM which ones
  came through a verified link.

### No invented reviews, anywhere

If nothing is published, the home page strip **renders nothing at all** and
`/reviews` says so plainly. Unlike the gallery — where a placeholder tile is
obviously an abstract stand-in claiming nothing — an invented testimonial is a
lie about work that was never done, so there is no placeholder content here and
none in the seed script.

The `/reviews` page emits `AggregateRating` structured data so the star rating
can appear in Google results. It is only emitted when there are real reviews
behind it.

---

## Messaging

| Channel | How | Why |
|---|---|---|
| **Email** | Resend, as `chris@skimcity.co.uk` | Branded quotes, invoices, receipts |
| **Telegram** | Bot API → Chris's phone | New booking, quote accepted, payment received, 07:00 digest |
| **WhatsApp** | `wa.me` click-to-chat links | Keeps Chris's own number and chat history |

WhatsApp is deliberately **not** the Cloud API. Click-to-chat needs no Meta
business verification, no approved message templates, and costs nothing per
message. The CRM builds the link with the message pre-filled and Chris taps
send. Every call site funnels through `whatsappLink()` in `web/src/lib/format.ts`,
so swapping to the Cloud API later is a one-file change.

Notification failures are logged and swallowed, never thrown. A payment webhook
that succeeded must not return 500 because Telegram was briefly down — the
processor would retry a payment we have already recorded.

---

## Deploying

### One-time setup

1. **Re-authenticate the CLI** — the current token is expired:
   ```bash
   firebase login --reauth
   ```
2. **Upgrade `skimcity-bac3b` to the Blaze plan.** Cloud Functions v2 and any
   outbound call to Stripe, Resend or Telegram require it. Everything
   works on emulators until then.
3. **Check the Firestore region.** `REGION` in `functions/src/lib/config.ts` is
   `europe-west2`. A Firestore location is permanent once set — if the project
   was created elsewhere, change the constant to match rather than the reverse.

### Secrets

```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
firebase functions:secrets:set TELEGRAM_CHAT_ID
```

Non-secret config goes in `functions/.env`:

```
SITE_URL=https://skimcity.co.uk
FROM_EMAIL=Skim City <chris@skimcity.co.uk>
ENFORCE_APP_CHECK=false           # flip to true once reCAPTCHA v3 is set up
```

### Deploy

```bash
npm run deploy              # everything
npm run deploy:hosting      # site only
npm run deploy:functions    # functions only
npm run deploy:rules        # security rules only
```

Then grant yourself CRM access against production:

```bash
npm run grant-admin -- chris@skimcity.co.uk
```

(Needs `GOOGLE_APPLICATION_CREDENTIALS` pointing at a service-account JSON, or
an active `gcloud auth application-default login`.)

### Webhook endpoints to register

| Processor | URL | Events |
|---|---|---|
| Stripe | `https://europe-west2-skimcity-bac3b.cloudfunctions.net/stripeWebhook` | `invoice.paid`, `invoice.payment_succeeded` |

The signing secret is issued when the endpoint is created, so it cannot be set
before the first deploy. Set `STRIPE_WEBHOOK_SECRET` to a placeholder, deploy,
register the endpoint, then set the real value and deploy again — Functions v2
pins the secret version at deploy time.

---

## Accounts you'll need

| Service | What for | What to grab |
|---|---|---|
| Stripe | Invoices, card payments | Secret key, webhook signing secret |
| Resend | Sending quotes and invoices | API key + DNS records on `skimcity.co.uk` |
| Telegram | Alerts to your phone | Bot token from `@BotFather`, your chat id |

---

## Things to sort before going live

- [ ] **VAT** — off by default in Settings. UK invoices must show a VAT number
      and a VAT breakdown once registered, and charging VAT while unregistered
      is an offence. Turn it on only when you actually are.
- [ ] **Terms & conditions** — `/terms` is a sensible starting point but has not
      been checked by a solicitor. Review the deposit, cancellation and
      guarantee clauses before relying on them.
- [ ] **Gallery photos** — upload job photos in the CRM at **/app/gallery**.
      Until something is published the public Work page shows branded
      placeholder tiles rather than an empty grid.
- [ ] **Rates** — day rate, repair rate and deposit % are in CRM → Settings.
- [ ] **App Check** — add a reCAPTCHA v3 site key, then set
      `ENFORCE_APP_CHECK=true` to protect the public endpoints from spam.

---

## Editing domain types

`shared/domain.ts` is the single source of truth. `npm run sync:types` copies it
into `web/src/types/domain.ts` and `functions/src/domain.ts`, and runs
automatically before both builds. Both copies are gitignored and marked
`GENERATED FILE` — **edit the canonical file only.**
