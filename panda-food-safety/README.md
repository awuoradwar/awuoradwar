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

## Why no Cloud Storage

As of October 2024, Cloud Storage for Firebase requires the pay-as-you-go
**Blaze** plan — a linked billing account — even though actual usage
would stay well within its free quota for an app this size. Rather than
require a credit card on file at all, photos are stored as compressed
base64 image data directly in Firestore instead, one document per
flagged item (`submissions/{id}/photos/{itemId}`). Firestore itself has
stayed free (Spark plan, no billing account) throughout, so the whole
app runs at zero cost with nothing to attach a card to.

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
   (No Storage step — see "Why no Cloud Storage" above.)

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
item counts, so problem stores surface automatically → **History** to
filter by store and date range, drill into any submission's flagged
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
  is normal, one-time Firestore behavior, not a bug.
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

## Editing the checklist or wording

- `js/checklist-data.js` — the 65 items and section headers, English and
  Spanish, transcribed from the paper form. Each item's `id` is also its
  Firestore field key, so don't renumber existing items — add new ones
  with new ids instead.
- `js/i18n.js` — every other UI label/button, English and Spanish.
