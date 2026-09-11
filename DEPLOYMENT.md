# Deploying Skim City

Three GitHub Actions workflows, and the handful of one-off steps that need your
credentials.

| Workflow | Runs on | Does |
|---|---|---|
| `ci.yml` | PRs, non-main branches | Lint, typecheck, build both packages, run the security-rules tests against the Firestore emulator |
| `pr-preview.yml` | PRs | Deploys the PR to its own Hosting preview channel and comments the URL |
| `deploy.yml` | Push to `main`, or manual | Re-runs the checks, then ships rules, indexes and the site — and Functions once enabled |

Nothing deploys unless the checks pass first.

---

## What you need to do

These four steps need credentials, so they're yours. Roughly fifteen minutes.

### 1. Push the code

The repo is committed locally and the remote is already set to
`github.com/cpwaters/skim-city`. It needs your GitHub credentials to push.

Pick whichever you prefer:

```bash
# GitHub CLI — easiest if you don't mind installing it
brew install gh && gh auth login
git push -u origin main

# or HTTPS with a personal access token (repo scope)
#   github.com/settings/tokens → Generate new token (classic)
git push -u origin main        # username: cpwaters, password: the token

# or SSH — you have ~/.ssh/id_ed25519.pub but it isn't registered with GitHub
#   Add it at github.com/settings/keys, then:
git remote set-url origin git@github.com:cpwaters/skim-city.git
git push -u origin main
```

> The first push will fail CI until you finish step 2, because the build
> deliberately refuses to run with placeholder Firebase config.

### 2. Repository variables — the Firebase web config

`github.com/cpwaters/skim-city/settings/variables/actions` → **New repository variable**

Get the values from
[console.firebase.google.com/project/skimcity-bac3b](https://console.firebase.google.com/project/skimcity-bac3b)
→ ⚙ Project settings → General → Your apps → Web app → *SDK setup and configuration*.
If no web app is registered yet, add one first (**Add app → Web**).

| Variable | Example |
|---|---|
| `VITE_FIREBASE_API_KEY` | `AIzaSy…` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `skimcity-bac3b.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `skimcity-bac3b` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `skimcity-bac3b.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `123456789012` |
| `VITE_FIREBASE_APP_ID` | `1:123456789012:web:…` |

**Variables, not secrets, on purpose.** These ship inside the JavaScript bundle
and are readable by anyone who views the site. They identify the project; they
don't authorise anything. Access control lives in `firestore.rules` and the
admin-claim checks in Cloud Functions. Treating them as secrets would imply a
protection they don't provide.

### 3. Repository secret — the deploy credential

This one **is** a real credential.

1. [console.cloud.google.com/iam-admin/serviceaccounts?project=skimcity-bac3b](https://console.cloud.google.com/iam-admin/serviceaccounts?project=skimcity-bac3b)
2. **Create service account** — name it `github-deploy`
3. Grant these five roles — the role ID is given because the console's display
   names don't always match what you'd guess, and searching for the wrong one
   wastes a deploy:
   - **Firebase Hosting Admin** (`roles/firebasehosting.admin`) — deploy the site and preview channels
   - **Cloud Datastore Index Admin** (`roles/datastore.indexAdmin`) — deploy Firestore indexes
   - **Firebase Rules Admin** (`roles/firebaserules.admin`) — deploy Firestore and Storage rules
   - **Cloud Storage for Firebase Admin** (`roles/firebasestorage.admin`) — read the default bucket the Storage rules attach to. The console may label it *(Beta)*. It is not "Storage Admin", which is plain Cloud Storage and grants nothing this deploy needs
   - **Service Usage Consumer** (`roles/serviceusage.serviceUsageConsumer`) — the CLI checks each required API is enabled before deploying, which is a Service Usage call
   - **Storage Admin** (`roles/storage.admin`) — also needed for the Storage step, on top of the Firebase one above. Verified by removing it: the step fails without it. `roles/storage.bucketViewer` is 2 permissions rather than 113 and looks like it should be enough, but hasn't been tried
   - *(add later, only for Functions)* **Cloud Functions Admin**, **Service Account User**, **Secret Manager Secret Accessor**, **Artifact Registry Writer**
4. **Keys → Add key → Create new key → JSON** → downloads a file
5. `github.com/cpwaters/skim-city/settings/secrets/actions` → **New repository secret**
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Value: the entire contents of that JSON file
6. Delete the downloaded file — it's a live credential.

Give it only the roles above rather than Owner. If the key ever leaks, the blast
radius is your hosting and rules, not the whole Google Cloud project.

**Firebase Rules Admin alone isn't enough for Storage.** Deploying the Storage
rules looks up the project's default bucket first, which is a separate
permission — `firebasestorage.defaultBucket.get` — hence the Storage role. The
bucket also has to exist: [console → Storage](https://console.firebase.google.com/project/skimcity-bac3b/storage)
→ **Get started** if it doesn't. Choose the same location as Firestore, because
it can't be changed afterwards.

**The Storage step needs two separate grants.** `roles/firebasestorage.admin`
covers the Firebase side of the default-bucket lookup and `roles/storage.admin`
the Cloud Storage side; the step fails with only one of them. It fails with the
same message either way — "Firebase Storage has not been set up" — which names
neither, and describes a third thing that isn't wrong.

IAM changes can also take a minute or two to take effect, so a grant that is
genuinely correct can fail a deploy run immediately after being added. Re-run
once before concluding it was the wrong role.

To see what a service account actually holds, rather than what it was meant to:

```bash
gcloud projects get-iam-policy skimcity-bac3b \
  --flatten="bindings[].members" \
  --filter="bindings.members:github-deploy@skimcity-bac3b.iam.gserviceaccount.com" \
  --format="value(bindings.role)"
```

**Replacing an existing credential?** Update the secret, run the deploy, and
only delete the superseded key once that run is green. Keep the working
credential until the replacement is proven, or a bad paste leaves you unable to
deploy at all. Delete the old *key*, not the account — another service may be
using it.

### 4. Deploy

Push to `main`, or **Actions → Deploy → Run workflow**. When it finishes the
site is at:

**https://skimcity-bac3b.web.app**

---

## Turning on Cloud Functions

Hosting works on the free Spark plan, so the marketing site goes live without
this. But **booking, quotes, invoices, payments, the gallery and reviews all run
through Cloud Functions**, and Functions need the Blaze plan — they make
outbound calls to Square, Stripe, Resend and Telegram, which Google doesn't
permit on the free tier.

Until then, `deploy.yml` skips the Functions job rather than failing the whole
deploy, and those parts of the site will show their error states.

To enable:

1. **Upgrade to Blaze** — Firebase console → ⚙ → Usage and billing → Modify plan.
   Set a budget alert while you're there; this project's usage should sit inside
   the free monthly allowance, but an alert means you find out before a bill does.
2. **Add the extra service-account roles** listed in step 3.
3. **Set the secrets** (once, from your machine, not from CI):

   ```bash
   firebase login --reauth        # your CLI token has expired
   firebase functions:secrets:set SQUARE_ACCESS_TOKEN
   firebase functions:secrets:set SQUARE_LOCATION_ID
   firebase functions:secrets:set SQUARE_WEBHOOK_SIGNATURE_KEY
   firebase functions:secrets:set STRIPE_SECRET_KEY
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   firebase functions:secrets:set RESEND_API_KEY
   firebase functions:secrets:set TELEGRAM_BOT_TOKEN
   firebase functions:secrets:set TELEGRAM_CHAT_ID
   ```

   Secret **values** never pass through GitHub. They live in Google Secret
   Manager and the deployed function is granted access by name, so a compromised
   Actions run can't read them.

4. **Set repository variable `DEPLOY_FUNCTIONS` to `true`**, then re-run Deploy.
5. **Register the webhook URLs** with Square and Stripe — see the table in
   `README.md`. The Square notification URL must match `SQUARE_WEBHOOK_URL` in
   `functions/.env` exactly, because Square signs over that string.
6. **Grant yourself CRM access:**
   ```bash
   npm run grant-admin -- chris@skimcity.co.uk
   ```
   The account must exist first — Firebase console → Authentication → Add user.

---

## Custom domain

Firebase console → Hosting → **Add custom domain** → `skimcity.co.uk`. It gives
you two A records to add at your registrar and provisions the certificate
itself, usually within the hour.

Once it's live, update `SITE_URL` in `functions/.env` and redeploy, so links in
quote and review emails point at the real domain rather than `web.app`.

---

## If something goes wrong

**"Refusing to build for production with placeholder Firebase config"** —
step 2 isn't done, or a variable name is misspelled. The message names the
offending variable.

**`HTTP Error: 403` on deploy** — the deploy service account is missing a role.
The error names the permission it wanted and ends with a troubleshooter URL;
open that, because it names the principal that was actually denied. Check that
principal before granting anything — it may not be the account you expect.

**`HTTP Error: 400, this index is not necessary`** — `firestore.indexes.json`
declares a composite index over a single field. Firestore indexes every field
automatically and rejects one-field composites. Delete the entry; the query it
was meant to serve already works.

**"Firebase Storage has not been set up on project"** — usually untrue. The CLI
prints this whenever its default-bucket lookup comes back empty, including when
the lookup was refused, so it reads as a missing bucket when it's a missing or
still-propagating permission. Check the bucket really is absent before setting
anything up:

```bash
TOKEN=$(gcloud auth print-access-token)
curl -s -H "Authorization: Bearer $TOKEN" \
  https://firebasestorage.googleapis.com/v1alpha/projects/skimcity-bac3b/defaultBucket
```

A bucket object back means Storage is fine and the problem is the credential.

**Functions deploy fails with "requires Blaze"** — expected on the free plan.
Leave `DEPLOY_FUNCTIONS` unset until you've upgraded.

**Functions deploy fails on a missing secret** — one of the
`functions:secrets:set` commands hasn't been run. Check with
`firebase functions:secrets:access SECRET_NAME`.

**Rules tests fail in CI but pass locally** — usually a stale emulator locally.
`pkill -f "firebase emulators"` and re-run `npm test`.

---

## Running it locally

See `README.md`. In short:

```bash
npm run install:all
cp web/.env.example web/.env.local     # fill in the same values as step 2
npm run emulators                      # terminal 1
npm run dev                            # terminal 2
```
