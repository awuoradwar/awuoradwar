# Panda Food Safety Checklist

A bilingual (English/Spanish), mobile-first web app for the daily 65-item
Panda Food Safety walkthrough. Associates and managers scan a QR code,
pick their store, and work through the checklist; any "No" answer
requires a photo of the corrective work order plus a note before it
counts as done. One owner account plus any number of admins you add
later can see every store's data, browse history, export CSV, and
manage the store list.

It's a plain static site (no build step) backed by Firebase — Firebase
Authentication and Firestore, including the photos, stored directly as
image data in Firestore documents rather than in Cloud Storage (see
below for why) — deployed to a public URL you QR-code. There's no server
to run or maintain beyond the free Firebase project itself, and no
credit card required anywhere.

## Why Firebase instead of a Claude Artifact

Claude Artifacts with shared data storage are restricted to signed-in
members of the owner's Claude organization — they can't be opened by an
anonymous QR-code scan from a store associate's phone. A real hosted web
app has no such restriction, which is why this is a standalone app you
deploy yourself rather than something living inside claude.ai.

## Why submission photos skip Cloud Storage

As of October 2024, Cloud Storage for Firebase requires the pay-as-you-go
**Blaze** plan — a linked billing account — even though actual usage
would stay well within its free quota for an app this size. Rather than
require a credit card on file at all, submission photos are stored as
compressed base64 image data directly in Firestore instead, one document
per flagged item (`submissions/{id}/photos/{itemId}`). Firestore itself
has stayed free (Spark plan, no billing account) throughout, so the base
app runs at zero cost with nothing to attach a card to.

Cloud Storage *is* used for one thing: the auto-generated weekly slide
decks (see "Automatic weekly slide deck" below). That feature only
exists at all once you've already opted into the automatic photo
checking feature above, which requires Blaze regardless — so enabling
Storage on top of that doesn't cross any new billing line. If you skip
automatic photo checking and stay on the free Spark plan, skip Storage
setup too; the rest of the app works exactly the same without it.

## One-time setup (~15 minutes)

1. **Create a Firebase project.** Go to <https://console.firebase.google.com>,
   "Add project", give it a name. The free "Spark" plan is enough for
   normal use at this scale.

2. **Enable sign-in methods.** In the console: *Build → Authentication →
   Sign-in method* → enable **Anonymous** (this is how associates get a
   session without creating an account) and **Email/Password** (this is
   how admins log in). There's no manual "add user" step needed —
   admins create their own accounts from inside the app (next section).

3. **Enable Firestore.** *Build → Firestore Database* → *Create
   database* → production mode → pick a region close to your stores.
   (No Storage step here — see "Why submission photos skip Cloud
   Storage" above; Storage is only needed if you later set up automatic
   weekly slide decks, covered in its own section below.)

4. **Register a web app to get your config.** *Project settings*
   (gear icon) → *General* tab → under "Your apps" click the web icon
   (`</>`) → register (any nickname, no need for Firebase Hosting setup
   here) → copy the `firebaseConfig` object it shows you.

5. **Paste your config in.** Open `js/firebase-config.js` in this folder
   and replace the placeholder values with what you just copied.

6. **Set the owner email.** In that same file, set `OWNER_EMAIL` to
   your own email — the one you'll sign up with as the permanent owner
   account (see below). Then open `firestore.rules` and replace the
   placeholder email inside `isOwner()` with that same email. This is
   the file that actually enforces it (`firebase-config.js` only
   controls what the UI shows) — keep both in sync if it ever changes.

## Admin accounts: one owner, any number of others

There's exactly one hardcoded account — the **owner** (`OWNER_EMAIL`
above) — and it's permanent: only the owner can add or remove every
other admin, from inside the app, with no code changes or redeploys.
Every admin (owner included) has identical access to view, edit, and
export data; the owner is just the only one who can manage who else
has that access.

To set it up:

1. Deploy the app (next section), then open `your-url/#/admin`.
2. Tap **"New admin? Create an account"**, enter your own email
   (exactly matching `OWNER_EMAIL`) and a password you'll remember, and
   submit. You're now logged in as the owner.
3. To add someone else later: while logged in, open **Manage Admins**
   → enter their email → **Add Admin**. They then visit the same
   `#/admin` link, tap "Create an account" themselves, sign up with
   that exact email, and they're in immediately — no console work, no
   waiting on you.
4. To remove someone's access, go back to **Manage Admins** and remove
   them; they'd need to be re-added to get back in.

### Giving access to someone without email/signup

**Manage Admins → Add by Username & Password** creates a full admin
account for someone else on the spot — no email, no signup screen on
their end. You pick a username and password there and just tell them
both; they log in with the username directly (the login screen accepts
either an email or a username). They can then set up a PIN from the
Account menu for faster access after that first login. Access level is
identical to any other admin (not owner) either way.

The tradeoff: since there's no real email behind a username account,
**"Forgot password?" can't help them** — there's nowhere to send a
reset link. If they forget it, create them a new username/password pair
instead (the old one still exists but is harmless once removed from the
roster; Firebase doesn't let this app delete the underlying account
without a paid-tier Admin SDK, so the leftover just sits there unused).

**One-time setup after first deploying this feature:** it needs a
`usernames` Firestore collection with its own rule (already in
`firestore.rules` in this repo) — but rule changes are deliberately left
out of the GitHub Actions auto-deploy (it only covers Hosting and Cloud
Functions; see "First composite-index search" under Known limitations
for why). Copy the contents of `firestore.rules` into the Firebase
Console under **Firestore Database → Rules** and click **Publish** once.
Skip this and username accounts will fail with permission-denied errors
instead of being created.

## Deploy

You need Node.js installed once, to get the Firebase CLI:

```
npm install -g firebase-tools
firebase login
cd panda-food-safety
firebase use --add          # pick the project you created above
firebase deploy --only firestore:rules,hosting
```

The deploy prints a live URL like `https://your-project.web.app` — that's
the link to QR-code for associates. The same link with `#/admin` appended
(`https://your-project.web.app/#/admin`) is the admin dashboard login.

Whenever you edit any file in this folder afterward, redeploy with the
same `firebase deploy --only ...` command.

## Add your stores

Before generating the associate QR code, log into the admin dashboard
(`…/#/admin`), open **Manage Stores**, and add each store's number and
name. Associates will see "no stores configured" until at least one
exists.

## Generate the QR code

Point any QR code generator (for example
<https://www.qr-code-generator.com>, or the `qrencode` command-line tool)
at your Hosting URL, then print/post it in each store.

## Day-to-day use

**Associates:** scan the QR code → pick your store, type your name → date
and time fill in automatically → answer all 65 items → any "No" opens a
required photo-of-the-work-order upload plus a short note before it
counts as complete → Submit once every item is answered. If someone
already submitted for that store today, you'll see who and when, with the
option to view it or edit it anyway.

Associates can also check **their own store's** last 7 days right on the
setup screen — pick your store, then tap "View this week's summary"
before starting the walkthrough (or without starting one at all).

**Admins:** open the same link plus `#/admin`, log in with your email/
password → **Today's Status** shows which stores have or haven't
submitted yet (this is a flag you check on the dashboard, not a push
notification — see limitations below) → **Weekly Summary** ranks every
store by days submitted in the last 7 days (worst first) plus flagged
item counts, so problem stores surface automatically, and tapping any
day on a store's strip opens that day's submissions directly →
**Weekly Report** is the same week's data laid out as one printable
summary (store completion, trending/repeat violations, every flagged
item, automated photo flags) plus, if you've set up the scheduled
function below, the auto-generated slide deck to download → **History**
to filter by store and date range, drill into any submission's flagged
items and photos, and export CSV → **Manage Stores** to add/remove
stores.

## Known limitations

- **Missed-day notification is dashboard-only**, by design choice — no
  push, email, or text is sent. An admin has to open the dashboard to see
  which stores haven't submitted yet today.
- **"Today" is each device's local date/time.** If your stores span
  multiple time zones, the daily cutover happens at a slightly different
  real-world moment per store. Not an issue if all stores are in one
  region.
- **Data access isn't per-store-walled.** Any signed-in visitor —
  including an associate, who is auto-signed-in anonymously the moment
  they open the link — can technically read or write the shared
  `submissions` collection if they inspect network requests directly.
  The Firestore rules block outside/anonymous-to-the-internet access, but
  they don't cryptographically prevent one store's associate from seeing
  another store's data the way a full per-store login system would. Given
  this holds internal operational data (no payment info, no customer
  PII), that's a deliberate trade for keeping the associate flow to a
  single tap with no login screen. Only admin accounts can manage the
  store roster or pull cross-store history/exports — and anyone can
  self-sign-up as an admin, but only gets treated as one if the owner
  has already added their email under Manage Admins.
- **Anyone can create a Firebase Auth account with any email.** The
  "Create an account" sign-up isn't itself gated — what actually
  matters is whether that email is the owner's or already listed under
  Manage Admins; an unlisted email just lands on a "not authorized yet"
  screen after signing up, with no access to anything.
- **First composite-index search.** The first time you run a History
  search with both a store filter and a date range, or the first time
  anyone opens their store's weekly summary (same query shape: one
  store + a date range), Firestore may show a "this query requires an
  index" error with a link in it — click the
  link, wait about a minute while it builds, then re-run the search. This
  is normal, one-time Firestore behavior, not a bug. The needed index is
  tracked in `firestore.indexes.json` for reference, but the GitHub
  Action only deploys Hosting and Cloud Functions, never Firestore
  config — the console link is the actual fix.
- **Free-tier limits.** Firestore's free Spark quota (roughly 1 GiB
  stored, 50K reads/20K writes/20K deletes per day, at time of writing —
  check the Firebase console for current figures) comfortably covers
  daily use for a modest number of stores, photos included. If you scale
  up to many more stores or a lot more photo volume, watch usage in the
  console; you'd only need to consider the paid Blaze plan if you
  actually exceeded these quotas, not before.
- **Photos are capped smaller than a typical phone photo.** Each is
  compressed client-side to at most 1280px wide, JPEG quality 0.6,
  before being stored — enough to read a thermometer or a work order,
  but noticeably lower resolution than the original if you zoom in a
  lot. That's deliberate, to stay safely under Firestore's 1 MiB
  per-document limit.

## Editing the checklist

Any admin can edit the live checklist from **Manage Checklist** —
no code change or redeploy needed. Per question, you can:

- **Hide** it — removes it from the next walkthrough someone starts.
  Past submissions that already answered it are unaffected: the admin
  detail view and CSV export still show that answer, just labeled as no
  longer on the checklist. Hiding is reversible (tap **Show** to bring
  it back) — it never deletes historical data.
- **Edit** its wording (English and Spanish) or change whether it needs
  a photo (never / only on a "No" / always).
- **Add** a brand-new question to any section, with its own English and
  Spanish wording. This is the tool to use to trim the walkthrough down
  — pare each section to what's actually necessary, remove anything
  duplicated elsewhere, and reword anything unclear, aiming for however
  long you want the walkthrough to take.

`js/checklist-data.js` is still the starting-point list the app ships
with (the original 65 items transcribed from the paper form) — it's
what Manage Checklist edits are layered on top of, not something you
need to hand-edit day to day. `js/i18n.js` holds every other UI label.

**One-time setup after first deploying this feature:** the
`checklistOverrides` collection needs a Firestore rule allowing admins
to write to it and everyone signed in to read it (already in
`firestore.rules` in this repo) — but rule changes are deliberately left
out of the GitHub Actions auto-deploy (see "First composite-index
search" below for why). Copy the contents of `firestore.rules` into the
Firebase Console under **Firestore Database → Rules** and click
**Publish** once. Skip this and Manage Checklist will show
permission-denied errors instead of saving.

## Automatic photo checking (AI temperature + duplicate detection)

A Cloud Function (`functions/`) automatically checks the photo attached
to a submission the moment it's finalized:

- **Temperature mismatch** — for the 3 photo-required temperature items
  (#3 reach-in cooler, #15 Grilled Teriyaki Chicken, #16 walk-in
  cooler), it reads the number shown in the photo (Claude Haiku 4.5
  vision) and flags it if that disagrees with the yes/no answer given.
- **Unreadable photo** — same 3 items; if the photo doesn't show a clear
  reading at all (blank, blurry, wrong subject), that's flagged too,
  rather than silently ignored.
- **Duplicate photo** — every photo-required item, any store: if the
  exact same photo file was already used in an earlier submission for
  that store+item, it's flagged, no API call needed (just a content
  hash comparison).

Flags show up as a bell icon with a count in the admin top bar, and as
a badge on the flagged item wherever that submission's detail is
viewed. This is a signal for a human to double-check, not an
accusation — automated reads can be wrong.

**Cloud Functions redeploy automatically** on every push, same as
Hosting (see "Deploy" above and the GitHub Actions workflow at
`.github/workflows/deploy.yml`) — but the secret it needs and the
`aiFlagged` collection's Firestore rule are both one-time manual setup,
since a GitHub Actions service account can't hold API keys or edit
security rules on its own:

1. Confirm the Firebase project is on the **Blaze** (pay-as-you-go)
   plan — Console → gear icon → **Usage and billing**. Cloud Functions
   can't make outbound API calls on the free Spark plan at all. Actual
   cost at normal usage is expected to be a few dollars a month at most
   (Firestore/Functions usage stays inside Blaze's free monthly
   allowance; the only real cost is the Anthropic API call itself).
2. Get an Anthropic API key with billing enabled at
   [console.anthropic.com](https://console.anthropic.com).
3. From the `functions/` directory: `npm install -g firebase-tools`
   (if not already installed), then `firebase login`.
4. `firebase functions:secrets:set ANTHROPIC_API_KEY` — paste the key
   when prompted (never commit it or paste it anywhere else). Do this
   before the function's first deploy; a deploy that references a secret
   which doesn't exist yet fails.
5. Deploy the `aiFlagged` collection's rule once: copy the contents of
   `firestore.rules` into the Firebase Console under **Firestore
   Database → Rules** and click **Publish** (or run
   `firebase deploy --only firestore:rules` from the repo root).
6. Push to your deploy branch (or run
   `firebase deploy --only functions` yourself once) to get the
   function live for the first time. After that, it stays live and
   up to date automatically with every ordinary push — no more manual
   redeploys for this feature.

**Applying this to submissions from before the function existed:**
`functions/backfill.js` runs the same checks against every already-existing
submission. It's a one-time script, not a deployed function — run it
locally with a Firebase service account key (Console → Project Settings
→ Service Accounts → Generate new private key):

```
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json ANTHROPIC_API_KEY=sk-ant-... node functions/backfill.js --dry-run
```

Always run `--dry-run` first — it reports exactly how many submissions,
photos, and Anthropic API calls (i.e. real cost) a real run would make,
without calling the API or writing anything. Drop `--dry-run` once
those numbers look right. Safe to re-run: anything already checked is
skipped, so it never double-charges for the same photo.

## Automatic weekly slide deck

A second scheduled Cloud Function (`functions/weekly-report-generator.js`)
builds a real `.pptx` presentation every Sunday at 00:00 business time
(right after Saturday 11:59pm) for the Sunday-Saturday week that just
ended — store completion, cross-store trending violations, repeat
violations by store, every flagged item, and automated photo flags,
grouped by reason. It's the presentation-ready counterpart to the
Weekly Report tab's on-screen text report (same underlying data, laid
out as slides).

The finished file uploads to Cloud Storage and its metadata (week label,
size, when it was generated) is recorded in Firestore. Admins download
it from the dashboard's **Weekly Report** tab, under **Weekly Slide
Decks** — no separate login or console access needed.

This depends on Cloud Functions, so it requires everything in
"Automatic photo checking" above (Blaze plan, `firebase-tools`,
`firebase login`) already done — plus Cloud Storage specifically, which
isn't enabled by default even on Blaze:

1. **Enable Cloud Storage.** Console → **Build → Storage** → get
   started, same default bucket/region prompts as Firestore. (If you
   never enabled Cloud Storage before, this is the one genuinely new
   step this feature adds — see "Why submission photos skip Cloud
   Storage" above for why it wasn't needed until now.)
2. **Deploy `storage.rules` once** — it isn't covered by the GitHub
   Actions auto-deploy any more than `firestore.rules` is:
   `firebase deploy --only storage` from the repo root. These rules
   check the same admin roster as Firestore's rules
   (`firestore.exists(...)` from inside a Storage rule) — Firebase may
   show a one-time console permission prompt the first time you deploy
   a cross-service rule like this; approve it if so.
3. **Deploy the updated `firestore.rules`** too (the `weeklyReports`
   collection's metadata rule is new) — same one-time manual step as
   the other rule changes above: copy into the Console and Publish, or
   `firebase deploy --only firestore:rules`.
4. Push to your deploy branch (or run `firebase deploy --only functions`
   yourself once) to get the scheduled function live. From then on it
   redeploys automatically with every ordinary push, same as the photo
   checker.

**Testing without waiting for Sunday:** `functions/generate-weekly-report-now.js`
runs the exact same generation logic on demand, for last week by default
or any specific Sunday-starting week you pass it:

```
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node functions/generate-weekly-report-now.js
```

It prints a confirmation once the deck's uploaded — check the Weekly
Report tab's Weekly Slide Decks section afterward to download it.
