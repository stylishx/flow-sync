# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Flow-Sync is a clinic QR + live token queue system. A doctor/compounder opens a daily
session and prints its QR code; patients scan it, enter name/age/mobile with no login,
and get a live token with an estimated wait. Remote booking with a convenience fee is a
separate, quota-limited path.

## Stack

Next.js 16 (App Router, `src/` directory) · React 19 · TypeScript strict · Tailwind CSS v4 · shadcn/ui
· MongoDB/Mongoose 9 · Motion 13 (Framer Motion; import from `motion/react`) · Zod 4.
Package manager is **npm** — `package-lock.json` is the only lockfile. Ignore the README's
yarn/pnpm/bun instructions; it is untouched create-next-app boilerplate.

## Commands

```
npm run dev      # next dev (Turbopack by default in Next 16)
npm run build    # next build
npm run lint     # eslint  (note: bare `eslint`, no `next lint`)
npm run format   # prettier --write .
npm run typecheck# tsc --noEmit
npm run seed     # DESTRUCTIVE dev seed; needs .env.local
npm run db:indexes # syncIndexes() + print what the database has (non-destructive)
```

There is no test runner and no test script. Do not claim a change works because it
compiles — the user verifies behaviour in the browser.

## Tailwind v4 — no config file

Tailwind is configured **CSS-first**. There is no `tailwind.config.ts` and none should be
created (`components.json` deliberately sets `"tailwind.config": ""`). All theme tokens live
in `@theme inline` inside `src/app/globals.css`. To add or change a colour, font, or radius,
edit that block and the `:root` / `.dark` CSS variables below it.

## shadcn/ui — Base UI, not Radix

`components.json` uses `"style": "base-vega"`, which builds on **`@base-ui/react`**. Do not
add `@radix-ui/*` packages or copy Radix-based shadcn snippets from the web — the primitives
and their prop APIs differ. Add components with `npx shadcn@latest add <name>` rather than
hand-writing them, and import the `cn()` helper from `@/lib/utils`.

**Base UI has no `asChild`.** Use the `render` prop instead — `<Button render={<Link
href="/x" />}>Label</Button>`, `<DialogTrigger render={<Button />}>Label</DialogTrigger>`.
Children stay on the outer component. Every Radix example on the web gets this wrong for
this project.

**Base UI's Button assumes a native `<button>`.** When the `render` prop supplies an
anchor (`next/link`), also pass `nativeButton={false}` — otherwise it keeps button
semantics on an `<a>`, which the browser console flags and which breaks accessibility
and form behaviour:
`<Button render={<Link href="/x" />} nativeButton={false}>Label</Button>`.

Path alias: `@/*` → `./src/*`. `components.json` also aliases `@/hooks`, but `src/hooks/`
does not exist yet — create it if you need it.

## Design system — "Modern Vibrant"

The stock monochrome shadcn look was rejected. Build new UI to this, not to defaults.

- **Palette lives in `oklch`, not HSL.** shadcn generates hover states as
  `bg-primary/80`; in HSL those mixes go muddy and lightness drifts between hues.
  Every token is defined in `:root` and `.dark` in `globals.css`.
- **Brand is violet → blue** (`--brand-from` / `--brand-via` / `--brand-to`).
  **`--live` (emerald) means the queue is moving**; **`--warn` (amber) means it is
  not.** Never use the brand colour for live status — the distinction is what a
  patient reads from across a room.
- **Backgrounds are tinted, never flat white or black.** `page-gradient` supplies the
  coloured ground; without it `backdrop-filter` has nothing to blur and glass panels
  read as flat boxes.
- **Depth comes from tinted shadow, not from borders.** Use `shadow-brand`,
  `shadow-brand-lg`, `shadow-live`. Avoid hard border colours.
- **`Card` IS the glass panel.** `src/components/ui/card.tsx` carries `glass`,
  `rounded-2xl`, `shadow-brand` and a soft `ring-white/50`. Do NOT add `glass` or a
  border at the usage site: `tailwind-merge` cannot dedupe a custom utility against
  `bg-card`, so an opaque background would win and kill the blur. Per-usage classes
  should state only what differs (e.g. `rounded-3xl`, `shadow-brand-lg`).
- **Custom utilities are declared with `@utility` in `globals.css`** — `glass`,
  `glass-strong`, `page-gradient`, `bg-brand-gradient`, `animate-brand-gradient`,
  `text-brand-gradient`, `shadow-brand*`, `shadow-live`. There is no
  `tailwind.config.ts` and one must not be created.
- **`--radius` is the single rounding dial.** Every `--radius-*` derives from it, so
  changing it rounds the whole app at once.
- **Animation respects `prefers-reduced-motion`.** A permanently animating gradient on
  a waiting-room screen is an accessibility problem; the global reduce block in
  `globals.css` handles it and must not be removed.
- **Print strips all of it.** The `@media print` block forces white, kills
  `page-gradient` and both brand gradients, and keeps QR codes pure black — a gradient
  behind a QR stops scanners reading it.

## Gotchas

- `src/app/layout.tsx` types props as `LayoutProps<"/">`, a **generated** global type written
  to `.next/types` by Next 16. Typecheck will fail on a clean checkout until `next dev` or
  `next build` has run at least once.
- `globals.css` defines `@custom-variant dark (&:is(.dark *))`, but nothing in the app ever
  toggles a `.dark` class — there is no theme provider. `dark:` utilities are currently inert.
  Add a theme provider before relying on them.
- `layout.tsx` loads Inter, Geist and Geist Mono, but `@theme inline` maps `--font-sans` to
  Inter and `--font-mono` to Geist Mono. Geist Sans is loaded and unused.
- No environment variables exist anywhere in this project — no `.env*` files, no `process.env`
  usage in `src/`.

## Architecture rules

- **Mongoose connection is cached on `globalThis`** (`src/lib/db.ts`) — both the
  connection and the in-flight promise. Never call `mongoose.connect()` anywhere else.
- **`autoIndex` is off in production.** New or changed indexes only reach a deployed
  database via `syncIndexes()`, which `npm run seed` runs. Adding an index to a schema
  is not enough.
- **`queueOrder` decides serving order, NOT `tokenNumber`.** `tokenNumber` is immutable
  and printed on the patient's slip, so a held patient cannot be re-inserted by
  renumbering. Tokens are issued at `tokenNumber * QUEUE_ORDER_STEP` (1000) and a
  recall lands on the midpoint between neighbours, so there is always room to insert.
  Anything that means "position in the queue" — `callNext`, wait estimates, the
  two-away notification sweep — must read `queueOrder`, never token-number arithmetic.
- **`parked` is reversible, `skipped` is not.** A parked patient keeps their number,
  leaves the waiting pool, and can be recalled. Note the name: `Token.activeHold`
  (anti-abuse) and `BookingHold` (payments) already use "hold", so the queue concept is
  deliberately called "parked" in code even though the UI says "Hold".
- **Token issuance must be atomic.** Use `findOneAndUpdate` with `$inc` on
  `Session.lastIssuedNumber`. A read-then-write hands two patients the same number the
  moment one QR code is scanned twice at once — the normal case in a waiting room.
- **Money is integer paise.** Never floats, never rupees.
- **The public session handle is `qrToken`, never the ObjectId.** ObjectIds are
  enumerable enough to walk other clinics' sessions.
- **Anti-abuse is enforced by unique partial indexes, not by application checks**,
  which race. They filter on the `activeHold` flag because MongoDB partial indexes
  support only `$eq/$exists/$gt/$gte/$lt/$lte/$type/$and` — "status is not cancelled"
  cannot be expressed. `$unset` `activeHold` to release a slot.
- **IP is a rate-limit signal only, never an identity.** A whole waiting room shares
  the clinic's public IP; uniqueness keys off device fingerprint + mobile. Store
  `ipHash`, never a raw IP.
- **Everything under `lib/` that touches secrets or the database carries
  `import "server-only"`** — `env`, `db`, `auth`, `queue`, `issue`, `qr`, `ratelimit`,
  `realtime`, `reclaim`, `payments`, `notify`. Client Components must not import them.
  Client-safe helpers live in `lib/wait.ts`, `lib/mobile.ts`, `lib/slug.ts` and
  `lib/device.ts`. Because of this, a plain Node script importing them needs
  `--conditions=react-server` (see the `seed` and `db:indexes` scripts) or
  `server-only` throws.
- **Never let a driver error cross the Server/Client boundary.** `connectToDatabase()`
  throws `DatabaseUnavailableError` (a plain Error) instead of the Mongoose error,
  whose `reason: TopologyDescription` is an unserialisable class instance — React turns
  that into a second "Only plain objects can be passed to Client Components" error that
  buries the real one and leaks cluster hostnames to the browser. Every Server Action
  runs behind `guardAction` in `lib/action-guard.ts`, which converts infrastructure
  failures into a readable form error while re-throwing Next's `redirect()`/`notFound()`
  control-flow throws.
- **`DialogTrigger` and `DialogClose` carry no styling of their own.** They are bare
  pass-throughs to Base UI, so using one directly renders a NATIVE UNSTYLED BUTTON.
  Always give them a styled element: `<DialogTrigger render={<Button />}>Label</DialogTrigger>`.
- **Print is its own medium, not a screen variant.** Print routes must live OUTSIDE the
  `(dashboard)` route group so they do not inherit the portal header and `max-w-6xl`
  wrapper. The `@media print` block at the end of `globals.css` forces the light
  palette (a dark-mode QR will not scan), neutralises `dvh`/centring (which produce
  blank pages on paper), and sizes QR codes in millimetres via `.print-qr` /
  `.print-qr-small`. Printing is `window.print()` — no PDF library — because the
  browser renders the same CSS and its "Save as PDF" is what staff already know.
- **Payment: verify first, issue second.** The browser's claim that it paid is worth
  nothing. `/api/payment/verify` recomputes `HMAC_SHA256(orderId|paymentId)` with the
  key secret and compares it timing-safely; only then is a token issued. The fee is
  read from the clinic document, never from the request body.
- **A `BookingHold` reserves the `onlineQuota` slot during checkout.** Because the
  token no longer exists until payment verifies, without a hold two patients could both
  pay for the last online slot. `consumeHold` flips `held -> consumed` atomically, so a
  retried Razorpay callback cannot issue a second token. Expired holds are released by
  the cron sweep; a hold that verifies but cannot be issued becomes `orphaned` and is
  logged as REFUND REQUIRED rather than silently dropped.
- **`issueToken({ quotaAlreadyClaimed: true })` when coming from a hold.** Otherwise
  `counters.online` is incremented twice and the quota silently shrinks on every paid
  booking.
- **Server Actions are their own entry points.** A layout auth check does not protect
  them, because actions are directly addressable and do not re-run layouts. Every
  mutating action in `app/portal/actions.ts` calls `requireClinicId()` itself.
- **`InferSchemaType` makes nested subdocuments optional.** `session.counters` and
  `token.patient` are typed as possibly undefined; use `?.` and a default rather than
  asserting.
- **Realtime goes through `lib/realtime.ts` only.** It polls per-stream instead of
  using pub/sub because serverless instances share no memory, and it closes each SSE
  stream after 50 s so it stays inside the function timeout — EventSource reconnects
  on its own. Swapping to Ably/Pusher/Upstash means rewriting that one file.
- **Rate limiting in `lib/ratelimit.ts` is per-instance and therefore advisory.** The
  real uniqueness guarantee is the partial unique indexes. Move it to Redis before
  launch.
- **`lib/device.ts` is a localStorage id, not a browser fingerprint.** Clearing site
  data defeats it by design; mobile number is the second key.
- **The React compiler lint is strict.** `react-hooks/set-state-in-effect` and
  `react-hooks/purity` are errors, not warnings: no `setState` in an effect body, and
  no `Date.now()`/`Math.random()` during render — including in Server Components.
- **Notifications and payments go through their provider interfaces**
  (`lib/notify/`, `lib/payments/`), selected by `NOTIFY_PROVIDER` / `PAYMENT_PROVIDER`.
  Never call the Meta or Razorpay APIs from a route or action directly.
- **WhatsApp messages here are business-initiated**, so they must use a Meta-approved
  template. A free-form message is rejected, not delayed. Template parameter order
  lives in `lib/notify/meta.ts` and nowhere else.
- **The notification sweep claims `notify.twoAwaySentAt` before sending**, not after.
  A patient who receives two "you're nearly up" messages stops trusting the queue.
  It is also fire-and-forget: a WhatsApp outage must never block "Call Next".
- **`PAYMENT_PROVIDER=stub` throws in production** by design — an accept-everything
  gateway on a live deployment would give paid slots away.
- **`rateLimit` is async.** It uses Upstash Redis when both `UPSTASH_REDIS_REST_*` vars
  are set and per-instance memory otherwise, failing open to memory if Redis is down.
- **Never prefix a plain helper with `use`** — the React lint treats it as a hook and
  errors. (`hasSharedBackend`, not `useRedis`.)
- **`/api/cron/reclaim` returns 404, not 401**, when `CRON_SECRET` is unset or wrong, so
  probing cannot confirm the route exists. An unset secret disables it entirely.
- **The root `error.tsx` shows no error text.** Patients reach it; a driver or provider
  message would leak internals into a waiting room.
- **Adding a route changes generated types.** `LayoutProps`/`PageProps` for a new path
  do not exist until `next dev` or `next build` regenerates `.next/types`, so
  `npm run typecheck` will fail on a brand-new route until you build once.

## Data model

`Clinic` → `Session` (one per clinic per day) → `Token`. Schemas in `src/models/`,
always imported through the `src/models/index.ts` barrel so every `ref` is registered
before the first populate.

## Working agreement

- **Never run git write commands.** No `git commit`, `git push`, `git branch`, `git merge`, or
  `git checkout -b`. The user handles all git themselves. Read-only git (`status`, `diff`,
  `log`) is fine. Make the edits, report what changed, and stop.
- Prettier owns formatting. Do not hand-align code or argue about semicolons — a hook runs
  Prettier on every file you write or edit.

---

## Future enhancements

Agreed backlog, not yet built. Each entry records the constraint it will run into, so
the design work is not redone from scratch.

### 1. "No-show" hold queue — BUILT

See the STATUS entry below. Original design notes retained for context:

A **Hold** action for a patient who is not present when called, letting the compounder
slot them back in later without issuing a new token.

- The queue is ordered by `tokenNumber`, which is immutable and printed on the
  patient's slip. Re-inserting therefore cannot mean renumbering — it needs a separate
  ordering field (e.g. `recallAfter` or `queueRank`) that `callNext` sorts on ahead of
  `tokenNumber`.
- **Naming collision to avoid:** `Token.activeHold` (anti-abuse guard) and the
  `BookingHold` model (payment reservation) already use "hold". A third meaning would
  be genuinely confusing — call this state `parked` or `on_hold`.
- `TOKEN_STATUSES` already declares `no_show`, currently unused. Decide whether
  "parked" is a distinct status or `no_show` plus a recall field.
- Open question for the user: does a held patient return immediately next, after a
  fixed number of patients, or at a position the compounder picks?

### 2. Smart TV display mode

Full-screen waiting-room route showing the current token and the next five.

- **A bare `/tv-display` has no clinic context.** It needs to identify a session —
  either `/tv/[qrToken]` (public, unguessable) or an authenticated
  `/portal/tv/[sessionId]`. A TV that reboots must come back without someone logging
  in, which argues for the qrToken form.
- **Privacy:** this screen is visible to a whole waiting room. Show token numbers and
  at most a first name — never full name, age, or mobile.
- Reuse `useQueueStream`; the SSE layer already carries exactly this data.
- TV browsers are frequently old. `backdrop-filter`, `oklch` and `color-mix` may not
  render — this route should use a flat high-contrast variant of the palette, not the
  glass design system, and be tested at 10 feet.

### 3. Lightweight patient CRM

Show a patient's past visits when the compounder enters their mobile number.

- Needs a new index on `{ clinicId: 1, "patient.mobile": 1, createdAt: -1 }`; the
  existing mobile index is per-session and partial, so it cannot serve this.
- **One mobile is often a whole family.** A parent booking for three children puts
  them all under one number, so history keyed on mobile alone will merge different
  people. Group by mobile, then disambiguate by name, and never present merged history
  as if it were one person.
- **This is a real data-protection step up** from holding a token for a day: it turns
  the app into a store of health-adjacent visit history. Needs a retention policy and,
  under India's DPDP Act, a defensible basis for keeping it. Worth a decision before
  building, not after.

### 4. Dynamic wait time

Estimate from the rolling average of recent consultations rather than a static number.

- The data already exists: `Token.calledAt` and `Token.completedAt` give real consult
  durations.
- **Three samples is a very small window** — one long consultation would swing every
  patient's estimate. Prefer blending the rolling average with the clinic's configured
  `estimatedConsultMinutes`, and clamp the result to a sane range.
- The first patients of a session have no history; fall back to the static value.
- **Architectural consequence:** `estimateWaitMinutes` in `lib/wait.ts` is a pure,
  client-safe function today. A dynamic average must be computed server-side and
  passed down (and added to the SSE `queue` payload), so that file stays pure and the
  average travels as data.

## STATUS

### Completed — Phase 1: Foundation

Zod-validated env, serverless-safe cached Mongoose connection, `Clinic`/`Session`/`Token`
models with all indexes, `generateQrToken()`, dev seed, Prettier + format-on-edit hook.

### Completed — Phase 2: Doctor Portal

- Staff auth: scrypt passcode on `Clinic.portalPasscodeHash` (`select: false`), stateless
  HMAC-signed cookie with a 12 h TTL (`src/lib/auth.ts`). Login is deliberately
  non-enumerating — same error for unknown clinic and wrong passcode.
- `src/lib/queue.ts` — atomic `callNext` / `completeCurrent` / `skip` / `addEmergencyDelay`
  / `createSession` / `setSessionStatus` / `getQueueSnapshot`.
- Routes: `/portal/login`, `/portal` (session list + create dialog),
  `/portal/session/[id]` (live control), `/portal/session/[id]/print` (A4 QR poster).
- Motion: token-number swap on `AnimatePresence`, pulse ring while live, queue rows
  slide in/out with `layout`.
- QR is inline SVG (`lib/qr.ts`, error correction "H") so it prints at printer
  resolution rather than a bitmap's.
- `next-themes` provider added, which also fixes the previously inert `.dark` variant.
- Verified: `next build`, `typecheck`, `lint`, `format:check` all clean.

### Completed — Phase 3: Patient flow + realtime

- `POST` via Server Action → `lib/issue.ts`: atomic `$inc` on `lastIssuedNumber` guarded
  by `$expr: lastIssuedNumber < maxPatients`. A returning device or mobile gets its
  existing token back rather than an error; an E11000 race returns the winner's token.
- `Token.publicId` added — the patient status page is `/t/<publicId>`, never the
  ObjectId, because that document holds a name, age and mobile.
- Routes: `/s/[qrToken]` (three-step booking, no login), `/t/[publicId]` (live status),
  `/api/session/[qrToken]/stream` (SSE), `/api/session/[qrToken]/state` (poll fallback).
- `useQueueStream` falls back to 8 s polling after 3 consecutive SSE failures, so a
  buffering proxy cannot leave a patient on a frozen screen.
- `lib/mobile.ts` normalises Indian mobiles to E.164; `maskMobile` for shoulder-surfing.
- Verified: `next build`, `typecheck`, `lint`, `format:check` clean. The SSE stream was
  exercised with an injected reader (dedupes identical polls, emits `gone`, closes
  cleanly) and all nine mobile-normalisation cases pass.

### Completed — Phase 4: Notifications + online booking

- `lib/notify/` — provider interface, `stub` (logs, masks the number) and `meta`
  (Cloud API templates, retryable-vs-permanent error classification). `stub` is the
  default so the queue is fully testable while Meta reviews the template.
- `sweepAlmostUpNotifications()` fires when the queue moves: claims the
  `notify.twoAwaySentAt` stamp conditionally, then sends; releases the stamp only on a
  retryable failure. Called fire-and-forget from `callNext`.
- `lib/payments/` — `stub` (dev only, refuses production) and a `razorpay` placeholder
  that throws rather than faking success.
- Online booking at `/c/[slug]`: one guarded `findOneAndUpdate` claims the token number
  and an `onlineQuota` slot together via `counters.online`, so the quota cannot oversell.
- `env.ts` cross-validates provider selection against credentials, so a misconfigured
  deployment fails at startup rather than at the first patient notification.
- Verified: `next build`, `typecheck`, `lint`, `format:check` clean. Providers exercised
  directly — stub notify masks numbers, stub payments work in development and throw
  under `NODE_ENV=production`, and all three env-guard cases behave correctly.

### Completed — Phase 5: Hardening + deploy

- `lib/reclaim.ts` + `/api/cron/reclaim` (Vercel Cron every 10 min, bearer-authed):
  cancels unpaid online bookings older than 15 min and returns the `onlineQuota` slot.
  Each token is claimed conditionally so overlapping runs cannot double-decrement.
- Rate limiter now has an Upstash Redis backend over plain `fetch` (no client library),
  falling back to memory on outage.
- Portal session page subscribes to the same SSE stream as patients via `LiveRefresh`,
  which calls `router.refresh()` only when the queue actually moves — a second staff
  device no longer goes stale.
- `error.tsx`, `not-found.tsx`, `loading.tsx` (root + portal), security headers and
  `no-store` on patient routes in `next.config.ts`, real landing page replacing the
  create-next-app template, `vercel.json` (cron + 60 s maxDuration on the SSE route).
- `scripts/indexes.ts` + `npm run db:indexes` — the only thing that builds indexes in
  production, since `autoIndex` is off there.
- Verified against a running production server: security headers present on `/`,
  `no-store` on `/t/*`, cron returns 404 unauthenticated AND with a wrong secret while
  a correct secret reaches the handler, and a forced database failure leaked no
  connection string, secret, or driver error into the HTML. Rate limiter verified for
  exact limit, block, window reset, and key independence.

### Completed — clinic registration + audit

- `/portal/register` creates a clinic and signs staff straight in. The slug is derived
  live from the clinic name, checked against a reserved-word list, and ultimately
  guarded by the unique index (E11000) — a check-then-write would race two simultaneous
  registrations onto the same ID.
- `/portal/settings` — clinic details, online booking toggle + fee, WhatsApp toggle +
  template, and a passcode change that requires the current passcode. This closed a hole
  registration created: a new clinic defaulted to `onlineBooking.enabled: false` with no
  way to change it, making online booking and WhatsApp unreachable outside the seed.
- Audit: no `asChild` anywhere (all converted to `render`), no Radix imports, no
  `framer-motion` imports, no Client Component importing a server-only module.
- **Fixed:** `lib/env.ts` and `lib/db.ts` were NOT marked `server-only` despite these
  notes claiming otherwise — nothing stopped a Client Component bundling secrets into
  the browser. Both now carry the guard, proven to reject a client-context import while
  still loading in a server one. Node scripts importing them now pass
  `--conditions=react-server`.
- Verified: slugify/validateSlug over 15 cases including accent folding and truncation;
  passcode hash/verify over 8 cases including the length-mismatch path that would
  otherwise make `timingSafeEqual` throw.

### Completed — print fix + button audit

- **Print rebuilt.** The poster moved from `portal/(dashboard)/session/[id]/print` to
  `portal/print/[sessionId]`, outside the dashboard group, so it no longer inherits the
  sticky header or the padded `max-w-6xl` wrapper. Added the project's first
  `@media print` block and `@page { size: A4; margin: 12mm }`; QR now sized in mm.
- **Patient token slip** (`components/patient/token-slip.tsx`) — `hidden print:block` on
  `/t/[publicId]`, so the page stays a live status screen but prints a clean slip. Its
  QR points at the session, not the patient's private status URL: a slip left on a
  chair must not expose a name and mobile number.
- **Fixed a bug I introduced earlier**: the regex that added `nativeButton={false}`
  corrupted two template-literal `href`s, injecting the prop inside the string. Both
  repaired; all 12 hrefs in the project now verified well-formed.
- **Unstyled buttons: not reproduced.** No raw `<button>` in app code; every button on
  `/`, `/portal/login`, `/portal/register` and 404 carries the full shadcn class list;
  the dev stylesheet serves 200 with preflight and all utilities; every design token is
  defined. Found the latent `DialogTrigger`/`DialogClose` trap (documented above) but no
  live instance. Awaiting a specific screen from the user.

### Completed — Step 2: sessions list + Razorpay

- **`/c/[slug]/sessions`** — public list of today's and upcoming sessions with status,
  now-serving number, waiting count, slots left, estimated wait and online slots
  remaining. Waiting counts come from one grouped aggregate, not a query per session.
- **Razorpay implemented for real**, replacing the placeholder that threw:
  `POST /api/payment/create-order` (creates the order, reserves the quota slot) →
  Checkout modal → `POST /api/payment/verify` (timing-safe HMAC) → token issued.
- **`BookingHold` model** with unique `orderId` and per-device / per-mobile partial
  unique indexes, so one patient cannot sit on several slots.
- The old `app/c/actions.ts` Server Action booking path was deleted — there is now one
  way to book online, not two.
- `PAYMENT_PROVIDER=stub` short-circuits the modal and goes straight to verify, so the
  whole flow is walkable without live keys.
- Verified: Razorpay signature checking across 7 cases (valid, tampered, wrong order,
  wrong payment, empty, short, swapped order/payment) — all correct; `BookingHold`
  registers with all five indexes as declared.

### Completed — Modern Vibrant UI theme

- Palette rewritten: every token had chroma `0` (literally greyscale), which is why the
  app looked black-and-white. Now violet→blue brand, emerald `--live`, amber `--warn`,
  faint blue-tinted light background, deep blue-slate dark background.
- Added `@utility` effects: `page-gradient`, `glass`, `glass-strong`,
  `bg-brand-gradient`, `animate-brand-gradient`, `text-brand-gradient`, `shadow-brand`,
  `shadow-brand-lg`, `shadow-live`, plus `gradient-pan` keyframes.
- `--radius` `0.625rem → 1rem`, rounding every component at once.
- `ui/card.tsx` rebased as the glass panel; its opaque `bg-card` and hard
  `ring-foreground/10` were what defeated the blur and produced the harsh borders.
- Gradient CTAs on the five primary actions; gradient + emerald pulse on both live
  token displays; glass header.
- Verified in a production build: all nine custom utilities emit, `--primary` is
  `#5954f3` and `--live` is `#00c38b` (previously pure grey), `.glass` compiles with a
  `color-mix` fallback plus `backdrop-filter`, `prefers-reduced-motion` is honoured,
  and the print block still forces white with gradients stripped.
- No `tailwind.config.ts` was created — Tailwind v4 is CSS-first.

### Completed — no-show hold queue

- `Token.queueOrder` (spaced by `QUEUE_ORDER_STEP` = 1000) decouples serving position
  from the printed token number; `callNext` and the queue snapshot now sort on it.
- New `parked` status plus `Token.parkedAt` and `Session.counters.parked`.
  `parkCurrent()` holds whoever is in the chair without advancing the queue;
  `recallParked(publicId, afterCount)` slots them back at Next / After 2 / After 5.
- Portal: a "Hold — patient not here" action beside Complete and Skip, and an amber
  "On hold" panel with per-patient call-back controls.
- Patient page: an explicit "You were called and missed — please see the reception
  desk" state. Previously a held patient just saw a silently frozen number.
- **Two knock-on correctness fixes this forced**, both real bugs once position and
  number can diverge:
  - `peopleAhead` was `tokenNumber - currentTokenNumber - 1`, which is wrong for
    everyone behind a recalled patient. Now counted server-side from `queueOrder` and
    refreshed via `router.refresh()` when the stream reports movement.
  - The two-away WhatsApp sweep selected on `tokenNumber <= current + 2`, which would
    have messaged the wrong people. Now takes the first N by `queueOrder`.
- Verified: recall placement across 7 cases. The probe caught a genuine bug — asking
  "After 5" with only two people waiting put the patient FIRST instead of last, because
  indexing past the end left the lower bound at 0. Fixed by clamping the index.
- `npm run db:indexes` must be run before this is used: the hot queue index moved from
  `{sessionId, status, tokenNumber}` to `{sessionId, status, queueOrder}`.

### Also still pending — first real run against MongoDB

Every phase is code-complete and none of it has touched a live database. Create
`.env.local`, then `npm run db:indexes` (proves the partial unique indexes actually
build — the entire anti-abuse guarantee rests on them), `npm run seed`, `npm run dev`.
Walk: register a clinic, create a session, print the QR, take a token, call next.

### Open decisions / blockers

- **Nothing has run against a real database.** All queue, auth, issuance, notification
  and payment logic is unexercised at runtime.
- No automated tests. Verification so far is typecheck, lint, build, and targeted
  probes of pure logic.
- Razorpay is implemented but has never run against live keys or a real card. The
  order-creation call and the modal are untested end to end.
- `orphaned` holds (paid, but the session filled before issuance) are logged for a
  manual refund; there is no automated refund and no admin screen listing them.
- The WhatsApp template still needs submitting to Meta for approval. Body parameters
  are patient name, token number, people ahead — in that order.
- The `your_turn` notification type is defined but never sent; only `almost_up` fires.
- Changing the passcode does NOT revoke other devices: the portal cookie is stateless
  and signed with the app secret, not the passcode. Immediate revocation would need a
  per-clinic token version in the cookie payload.
- Registration validates the clinic contact number as an Indian mobile, so a
  landline-only clinic cannot register as-is.
- The portal has no UI to close a session (only Pause), and no way to issue a token
  manually for a patient whose device was blocked by the anti-abuse indexes.
- Parked patients are never auto-expired: if nobody recalls them, they stay on hold
  until the session closes. There is also no cap on how many can be held at once.
- No clinic deletion, no per-staff accounts, and no audit trail of who called which
  token.
- No Content-Security-Policy: a useful one needs nonce plumbing through middleware, and
  a permissive `unsafe-inline` policy would read as protection without providing any.
- Nothing throttles how many SSE streams one clinic can hold open.
- shadcn `form` was deliberately not installed: it pulls in react-hook-form for what
  are three-field forms, and the project already uses plain forms plus Server Actions.
