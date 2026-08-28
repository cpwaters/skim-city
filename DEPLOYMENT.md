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
3. Grant these roles:
   - **Firebase Hosting Admin** — deploy the site and preview channels
   - **Cloud Datastore Index Admin** — deploy Firestore indexes
   - **Firebase Rules Admin** — deploy Firestore and Storage rules
   - *(add later, only for Functions)* **Cloud Functions Admin**, **Service Account User**, **Secret Manager Secret Accessor**, **Artifact Registry Writer**
4. **Keys → Add key → Create new key → JSON** → downloads a file
5. `github.com/cpwaters/skim-city/settings/secrets/actions` → **New repository secret**
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Value: the entire contents of that JSON file
6. Delete the downloaded file — it's a live credential.

Give it only the roles above rather than Owner. If the key ever leaks, the blast
radius is your hosting and rules, not the whole Google Cloud project.

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

**`HTTP Error: 403` on deploy** — the service account is missing a role from
step 3. The error names the permission it wanted.

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
