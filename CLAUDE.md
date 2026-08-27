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

### Next pending task — first real run against MongoDB

Every phase is code-complete and none of it has touched a live database. Create
`.env.local`, then `npm run db:indexes` (proves the partial unique indexes actually
build — the entire anti-abuse guarantee rests on them), `npm run seed`, `npm run dev`.
Walk: register a clinic, create a session, print the QR, take a token, call next.

### Open decisions / blockers

- **Nothing has run against a real database.** All queue, auth, issuance, notification
  and payment logic is unexercised at runtime.
- No automated tests. Verification so far is typecheck, lint, build, and targeted
  probes of pure logic.
- Razorpay is a deliberate placeholder that throws; implementing it means order
  creation plus a timing-safe HMAC check of the checkout callback.
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
- No clinic deletion, no per-staff accounts, and no audit trail of who called which
  token.
- No Content-Security-Policy: a useful one needs nonce plumbing through middleware, and
  a permissive `unsafe-inline` policy would read as protection without providing any.
- Nothing throttles how many SSE streams one clinic can hold open.
- shadcn `form` was deliberately not installed: it pulls in react-hook-form for what
  are three-field forms, and the project already uses plain forms plus Server Actions.
