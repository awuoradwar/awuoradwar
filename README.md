# Shift Ops

A mobile-first restaurant shift execution, accountability, delegation and
handoff app, built from the attached product specification. It runs as an
installable Progressive Web App (no app store) with a real backend, real
authentication, role-based permissions, and an append-only audit trail.

## Run it locally right now

```bash
npm install
node scripts/seed.js   # creates/resets data/shift-ops.db with demo data
npm run dev             # http://localhost:3000
```

Demo accounts (password for all: `shiftops123`):

| Role | Email | Notes |
|---|---|---|
| GM | `gm@shiftops.demo` | Full permissions, only one with Admin access |
| Assistant Manager | `am@shiftops.demo` | Identical permissions to Chef |
| Chef | `chef@shiftops.demo` | Identical permissions to AM; Spanish UI by default |
| Visiting Manager | `visiting@shiftops.demo` | Temporary/authorized access |

Open `http://localhost:3000` on a phone (or your desktop browser's device
toolbar) — the layout, tap targets and navigation are built mobile-first.
"Add to Home Screen" installs it as a standalone app via the PWA manifest
and service worker in `public/`.

## What's actually implemented

This is a working app, not a mockup — every button is wired to a real
database mutation with server-side authorization and an audit trail. Covered
end to end: authentication & roles, My Shift dashboard (NOW/THIS
SHIFT/TODAY/THIS WEEK/FROM LAST SHIFT with automatic priority), Week
planning + manager capacity, the full `+ Add` quick-capture flow (task,
call-in, late, cleaning, guest recovery, meal replacement, borrowed item,
issue, acknowledgement, note), cleaning areas with delegate → complete →
verify, attendance events, guest recovery / meal replacement with a separate
approval step, borrowed-item settlement tracking, persistent cross-shift
issues, acknowledgements with outstanding-associate tracking, auto-generated
handoff + "Since You Were Here", associate schedule-request intake + GM
approval queue + conflict warnings, append-only audit events with
"last updated by" + full Activity view, a recurring task/template engine
with dependency and conditional-meeting support, English/Spanish per-user
localization, an operational Inbox with a human-review import pipeline, and
an offline queue with client-generated idempotency keys so a retry after
reconnecting never creates a duplicate record.

**Honest scope notes** — a few pieces are intentionally simplified for this
first build, in line with the spec's own instruction to ship in vertical
slices rather than everything at once:

- **Document extraction (spec section 8)** uses a lightweight
  keyword-based heuristic (`src/lib/services/importService.ts`) instead of
  real OCR/LLM extraction, so the human review → correct → approve pipeline
  is fully real and testable today. Swapping in a real document-AI call is a
  single-function change; nothing downstream needs to move.
- **Offline support** covers the write paths the spec calls out as
  must-work-offline (task completion, call-in/late, guest recovery,
  borrowed item, issue) with a local queue + idempotency keys. It is not a
  full offline-first sync engine (no background sync API, no full local
  mirror of the last shift's data yet).
- **Notifications** are dashboard-first as the spec requires; actual push
  delivery (web push) isn't wired to a push service yet — the plumbing
  point is `src/lib/services` (a `notificationService.ts` would sit
  alongside the others).
- **Reports** cover the metrics named in spec section 28 plus a browsable
  history range; a dedicated weekly-close ceremony screen isn't built yet.

## Architecture

- **Client**: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind,
  mobile-first, installable via `public/manifest.json` + `public/sw.js`.
- **Server logic**: Next.js Server Actions calling a service layer
  (`src/lib/services/*`) — one file per business domain (tasks, shifts,
  cleaning, attendance, guest recovery, borrowing, issues, acknowledgements,
  handoffs, scheduling, import, search, recurrence), matching the spec's
  suggested API/service boundaries (section 24) directly.
- **Data**: `src/lib/schema.sql` (SQLite via `better-sqlite3`) for local
  development — zero setup, one file, real SQL. `supabase_schema.sql` is the
  equivalent production schema for Postgres/Supabase, including the Row
  Level Security policies the spec requires (store-membership scoping,
  GM-only actions enumerated explicitly, append-only audit log enforced at
  the database level, not just in application code).
- **Auth**: email/password with hashed passwords and a signed session
  cookie (`src/lib/auth.ts`). Position (GM/Assistant Manager/Chef/Visiting)
  is stored separately from PIC (a shift-scoped role) exactly as the spec
  requires. All permission decisions run through one file,
  `src/lib/permissions.ts` — Assistant Manager and Chef are asserted to be
  the same permission tier there, not scattered across the UI.
- **Audit**: every material mutation calls `writeAudit()`
  (`src/lib/audit.ts`), an append-only insert with actor, PIC-at-time,
  action, and old/new values. Records show "Last updated by…" with a full
  Activity view on demand, never a noisy feed.

## Going to production (Supabase + Vercel)

You chose to build first and deploy later — here's the path when you're
ready, roughly 15 minutes:

1. Create a free project at supabase.com. In the SQL editor, run
   `supabase_schema.sql` from this repo.
2. In Supabase Auth settings, enable email/password sign-in. Create your
   manager accounts there (or keep using this app's own login and just
   point `src/lib/auth.ts` at Supabase Auth — see the file's comments).
3. Swap `src/lib/db.ts` for a Supabase client (`@supabase/supabase-js`),
   using the same table/column names — the service files in
   `src/lib/services/` were written so their SQL shape barely has to change.
4. Push this repo to GitHub, import it in Vercel, add your Supabase URL and
   keys as environment variables, deploy.
5. Open the Vercel URL on a phone and "Add to Home Screen" — that's the
   installed app, no app store involved.

## Project layout

```
src/app/                     Routes (App Router) + Server Actions
src/app/(app)/                Authenticated shell: My Shift, Week, Add, Handoff, More...
src/components/               UI components, one form per + Add type
src/lib/services/             Business logic, one file per domain
src/lib/schema.sql             SQLite schema (local dev)
src/lib/i18n/                 English/Spanish dictionaries
supabase_schema.sql            Postgres + RLS schema (production)
scripts/seed.js                 Demo data seed script
```
