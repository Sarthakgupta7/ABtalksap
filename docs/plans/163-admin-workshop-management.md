# 163 — Admin-run workshops, end to end

## 1. Goal

Let an admin run the entire workshop surface from the admin console — add,
publish, update and archive workshops, attach a poster, show or hide the
calendar, and put the public page into a dedicated "coming soon" state — with no
code change and no deploy. ("Archive", not "remove": hard deletion is only ever
allowed for a workshop with an empty roster — see §9.)
The ten existing workshops are preserved as historical records with their
rosters intact, but the public experience starts fresh.

## 2. Current behavior

Running a workshop today requires a developer.

| Piece | Where it lives | Admin can change it? |
|---|---|---|
| The 10 workshops/events | `src/components/workshop/events-data.ts` — a hardcoded `EVENTS: WorkshopEvent[]`, 630 lines | **No** — code + deploy |
| Registrations (366 rows) | Neon/Prisma `WorkshopRegistration`, keyed by free-form `eventId` string | Read-only view |
| Zoom link, WhatsApp link, webinar date/time, countdown target | **Supabase** `workshop_config`, "a single hand-edited row" | Only by editing Supabase directly |
| `/admin/workshop` | Registrations + Analytics tabs | No event CRUD at all |
| Public `/workshop` | Hero, topics, stats, calendar, registration modal | — |
| Public `/workshop/events` | Timeline; renders `ComingSoonCard` when it runs out | — |

Four facts shape everything below:

1. **`WorkshopEvent.Icon` is a `LucideIcon`** — a React component reference. It
   cannot be stored in a database, and this repo forbids passing icons across
   the Server→Client boundary. The DB stores an icon *name*; a client-side map
   turns it back into a component.
2. **`eventId` is the roster join key and it is free-form text.** 366 rows point
   at three ids (`linkedin-ai-interview` 250, `workshop-2026-09-05` 95,
   `workshop-2026-09-12` 21). `events-data.ts` already warns that reusing an id
   "would silently merge two workshops' rosters". The port must preserve ids
   exactly.
3. **The workshop track spans two databases.** Registrations in Neon, config in
   Supabase. That split is why no admin screen can own the config today.
4. **All ten events are already in the past** — dated 2026-06-01 through
   2026-09-26, against a current date of 2026-09-29. Archiving them hides
   nothing that was still upcoming, which is what makes the fresh-start
   decision below low-risk.

## 3. Point of view

- **The real bug is not "no admin UI", it is that the schedule is source code.**
  Every other symptom follows. Fix the source of truth and the admin screen
  becomes ordinary CRUD.
- **Kill the Supabase dependency as part of this.** A second database holding
  five fields, hand-edited, outside the audit log, is the worst thing in this
  feature. `PlatformConfig` and `src/lib/platform-config.ts` already exist, are
  typed and audited, and have an admin panel at `/admin/settings`. Moving five
  values there deletes an external dependency and makes them console-editable
  for free. Do it once; do not build on Supabase and migrate later.
- **"Remove the landing page" should be a state, not a deletion.** Deleting
  loses SEO, backlinks and the archive. A `mode` of `LIVE` / `COMING_SOON` gives
  the same outcome, is reversible in one click, and cannot leave a dead route.
- **Historical data is not the public schedule.** The ten legacy events are kept
  for their rosters and for the record, and are invisible to the public. The new
  schedule starts empty and shows TBA until an admin publishes something.
- **Do not let an admin type the event id.** It is the roster key. Derive it
  from the date (`workshop-YYYY-MM-DD`, the convention already documented in the
  file), make it immutable after creation, and never render it as an input. A
  typo here silently splits or merges rosters and is not recoverable from the UI.
- **Posters need their own public blob store.** The existing store (`resume2_*`)
  is private by design because résumés carry personal data. Posters must be
  readable logged-out. Add a separate public store; do not relax the résumé
  store's privacy to reuse it.

## 4. Decisions locked

- **Phased**: three mergeable phases, one plan.
- **Poster**: upload to a **public** Vercel Blob store; the event row stores the URL.
- **Coming soon**: the **whole `/workshop` page** becomes a dedicated screen.
- **Existing events**: all 10 are ported into the DB with **ids and registration
  relationships preserved**. They are **historical/archived records only and are
  excluded from the new public workshop experience.** `events-data.ts` is
  retired as a data source.

## 5. Data model

```prisma
model WorkshopEvent {
  /// The roster key. Derived from the date as `workshop-YYYY-MM-DD` and NEVER
  /// editable afterwards: WorkshopRegistration.eventId points here by string,
  /// and changing it detaches the roster. The legacy ids
  /// (`linkedin-ai-interview`, `ai-workshop-live`, `uiux-ai-workshop`, …) are
  /// carried over verbatim and do not follow the convention.
  id               String   @id
  date             DateTime
  timeLabel        String
  title            String
  description      String
  host             String
  location         String
  tag              String
  accent           String
  /// A lucide icon NAME, not a component — a component cannot be stored, nor
  /// crossed over the Server→Client boundary.
  iconName         String
  track            WorkshopTrack
  /// Today a `/public` path (`posterSrc`); from phase 3 a Blob URL. Both are
  /// just URLs to an `<img>`, so one column serves both and the port does not
  /// need to distinguish them.
  posterUrl        String?
  registrationOpen Boolean  @default(true)
  register         Boolean  @default(false)
  externalHref     String?
  ctaLabel         String?
  // Replay + modal content. All optional; a workshop gets them after it runs.
  youtubeId        String?
  duration         String?
  titleAccents     String[] @default([])
  takeaways        String[] @default([])
  topics           String[] @default([])
  /// `{label, href, kind}[]`.
  resources        Json?
  /// Session length in minutes; absent falls back to DEFAULT_DURATION_MIN.
  durationMinutes  Int?
  /// Null until an admin publishes. Nothing unpublished is ever public.
  publishedAt      DateTime?
  /// Set on all ten legacy events by the port. Archived rows keep their
  /// registrations and stay visible in the admin console, and are excluded
  /// from every public surface.
  archivedAt       DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([date(sort: Desc)])
  @@index([publishedAt, archivedAt, date])
}
```

`resources` (past-workshop links) is a small `{label, href, kind}[]` — a `Json`
column is proportionate; do not build a second table.

**Field coverage — checked against the real type, which is wider than an early
draft of this plan assumed.** `WorkshopEvent` in `events-data.ts` has 24 fields
and nearly all are consumed outside that file: `duration` (28 uses), `href`
(10), `youtubeId` (8), `placeholder` (8), `register` (5), `topics` (4), and
`posterSrc` / `takeaways` / `resources` / `ctaLabel` / `titleAccents` (1–2
each). The model above now covers every one. Porting against a narrower model
would have silently dropped replays, takeaways, topics and posters from all ten
historical workshops.

Renames to apply in the seed mapping, deliberately and explicitly:
`time`→`timeLabel`, `desc`→`description`, `posterSrc`→`posterUrl`,
`href`→`externalHref`.

**`placeholder` is NOT a column.** It marks synthetic "Workshop — TBA" entries
generated at runtime by `placeholderSaturdays()`, and is never true for a real
event. Persisting it would invite someone to create a placeholder row. It stays
a runtime-only flag on the generated objects.

**`WorkshopTrack` is a genuinely new enum — checked.** There is no `*Track` enum
in the schema today; `track` is currently the TS union
`"workshop" | "hackathon" | "cohort" | "challenge"` in `events-data.ts`. Two
existing enums carry those same four values and **neither may be reused**:

- **`NotificationCategory`** (`schema.prisma:1731`) has exactly
  `WORKSHOP | HACKATHON | COHORT | CHALLENGE`. It is a **hard-locked Prisma enum**
  owned by Manuvrtti — CLAUDE.md names it explicitly in the notification lock.
  Reusing it would breach the lock and couple the workshop schedule to the
  notification domain. **Do not touch it.**
- **`CertificateType`** (`schema.prisma:638`) is close but is about certificates
  and spells the fourth value `CLAUDE_CHALLENGE`.

So: declare a new `WorkshopTrack`, and do not "helpfully" consolidate it with
either of the above.

**TBA already exists — do not build it.** `placeholderSaturdays(year, month)`
generates synthetic "Workshop — TBA" tiles for every Saturday from
`SATURDAY_SERIES_START` (2026-09-01) with no real event that day, and
`eventsForMonth` merges them into the calendar. Once the ten legacy events are
archived, the calendar fills with TBA on its own. Keep this generator; it is the
mechanism that satisfies "empty means TBA". Note `openWorkshops` deliberately
**excludes** placeholders, so TBA never appears as a registerable card — only as
a calendar tile. Preserve that distinction exactly.

**Lifecycle.** Public eligibility is a single rule, and every public read uses it:

```
eligible = publishedAt != null
       AND archivedAt == null
       AND registrationOpen
       AND date is upcoming
```

Legacy registrations keep working against their original `eventId` strings
regardless — the roster lookup is by id and does not consult this rule.

**No foreign key** from `WorkshopRegistration.eventId` to `WorkshopEvent.id` in
phase 1. Adding one is a constraint against 366 existing rows and would fail on
any mismatch. Verify the match first; consider the FK later as its own step.

New `PLATFORM_CONFIG_KEYS` entries, reusing the existing registry:
`workshop.mode` (`LIVE` | `COMING_SOON`), `workshop.calendar_visible`,
`workshop.zoom_link`, `workshop.whatsapp_link`, `workshop.coming_soon_message`.

## 6. Files to touch

### Phase 1 — database becomes the source of truth
- `prisma/schema.prisma` `[edit]` — `WorkshopEvent` + `WorkshopTrack` enum
- `prisma/migrations/<ts>_workshop_events_table/migration.sql` `[new]` — additive only
- `prisma/scripts/seed-workshop-events.ts` `[new]` — one-time port of the 10 events, ids preserved, **`archivedAt` set on every one**
- `src/repositories/workshop.ts` `[new]` — the read/write boundary
- `src/components/workshop/events-data.ts` `[edit]` — keep the type, the `monthAbbr` / `dayNum` helpers and the icon-name→component map; **delete the `EVENTS` array**
- **14 importers of `events-data.ts`, 7 of them Client Components** `[edit]` — see the scope correction below
- `src/features/notification/derive-event-notifications.ts` `[edit]` — **LOCKED path, narrow seam only**, see §8a
- `.github/CODEOWNERS` `[edit]` — add the workshop paths (rule 13; there is no workshop entry today)

#### Scope correction: it is not "three read sites"

An early draft of this plan said three pages read the data. It is **14 files**,
and the shape of the work is a props refactor, not a swap:

| Kind | Files |
|---|---|
| **Client** (read `EVENTS` at module scope — a DB cannot serve them; each needs data threaded from a server parent) | `EventsCalendar`, `EventsTimeline`, `WorkshopHero`, `UpcomingWorkshops`, `WorkshopDetailsModal`, `HackathonPromoModal`, `dashboard-hub/events-section` |
| **Server** | `app/workshop/page.tsx`, `app/workshop/events/page.tsx`, `app/admin/workshop/page.tsx`, `actions/workshop-actions.ts`, `features/dashboard/hub-search-index.ts`, `features/admin/evidence-provenance.ts`, `lib/chatbot/live-facts.ts` |
| **Locked** | `features/notification/derive-event-notifications.ts` |

Seven exported helpers close over the module array and must each take the events
as a parameter instead: `upcomingEvents`, `pastEvents`, `placeholderSaturdays`,
`eventsForMonth`, `openWorkshops`, `sidebarEvents`, `getRegistrableEvent`.
They stay pure functions in `events-data.ts`; only their data source moves.

### Phase 2 — admin CRUD
- `src/app/actions/admin-workshop-actions.ts` `[new]` — create / update / publish / archive
- `src/components/admin/workshop-event-form.tsx` `[new]` (client)
- `src/components/admin/workshop-events-table.tsx` `[new]` (client)
- `src/app/admin/workshop/page.tsx` `[edit]` — a third **Events** tab

### Phase 3 — coming-soon, calendar toggle, posters
- `src/lib/platform-config.ts` `[edit]` — register the new keys
- `src/components/admin/platform-config-panel.tsx` `[edit]` — expose them
- `src/features/workshop/storage.ts` `[new]` — public Blob put/delete
- `src/app/actions/admin-workshop-actions.ts` `[edit]` — poster upload
- `src/components/workshop/WorkshopComingSoon.tsx` `[new]` — the full-page state
- `src/app/workshop/page.tsx` `[edit]` — branch on mode
- `src/components/workshop/EventsCalendar.tsx` `[edit]` — respect the toggle

## 7. Server vs Client

| Component | Kind | Note |
|---|---|---|
| `/workshop`, `/workshop/events`, `/admin/workshop` pages | Server | Read via `src/repositories/workshop.ts` |
| `WorkshopComingSoon` | Server | Static content; no interactivity needed |
| `workshop-event-form`, `workshop-events-table` | Client | Forms and dialogs |
| `EventsCalendar`, `EventsTimeline` | Client (already) | Receive plain serialisable rows |

**Boundary flag:** the DB carries `iconName: string`. The Server→Client props
carry that string, never a `LucideIcon`. The name→component map lives in the
client component. No functions, icons or class instances cross the boundary.

## 8. Steps

### Phase 1

**Phase 1 ships as 1a then 1b, approved separately.**

- **1a — the data operation.** Steps 1–4: schema, migration, seed, 24-field
  round-trip, registration integrity. `EVENTS` stays intact, no consumer or
  importer is touched, the notification module is not touched, and public
  behaviour is unchanged. If the port is wrong, it is found here — before
  fourteen consumers depend on it.
- **1b — the source-of-truth swap.** Steps 5–6 plus §8a: repository,
  parameterised helpers, server parents, client props, the notification seam,
  and only then deleting `EVENTS`. **Do not begin 1b until 1a's verification
  passes and is approved.** 1b is not approved on a green build alone — it needs
  the before/after behavioural comparison, equivalent except for the deliberate
  visibility/TBA change.

**Scope fence.** Phase 1 is items 1–6 below plus §8a and nothing else. It must
not touch admin CRUD, poster upload, Blob infrastructure, the `PlatformConfig`
migration, the coming-soon design, or the calendar toggle. Those are phases 2
and 3. A Phase 1 diff containing `admin-workshop-actions.ts`,
`features/workshop/storage.ts` or `WorkshopComingSoon.tsx` has drifted.

**Stop-and-report rule.** If the port finds an icon name that does not resolve,
a `resources` shape that does not match, or any field that will not round-trip,
**stop and report it. Do not silently fix, coerce or correct the source data.**
A mismatch is a finding, not a chore.

1. Model + additive migration. Nothing existing is altered or dropped.
2. Seed script ports all 10 events, **ids verbatim**, and sets `archivedAt` on
   each. Idempotent (`upsert` by id) so it can be re-run. It prints every id.

   **Derive the rows from the live array; do not retype them.** The script
   `import { EVENTS } from "@/components/workshop/events-data"` and maps over it.
   Hand-copying ten objects is where date, `resources`, `externalHref`,
   `ctaLabel` and `registrationOpen` bugs get in, and they are invisible until a
   past workshop renders wrong months later.

   One field needs real care: **`Icon` is a component, and we are storing a
   name.** Derive it as `event.Icon.displayName ?? event.Icon.name` — lucide
   sets `displayName` — and **assert every one resolved to a non-empty string
   that exists in the icon map** before writing. A silently empty `iconName`
   renders a blank card.

3. **Compare before retiring the array.** With the seed applied and `EVENTS`
   still present, run a check that every event in the array has a `WorkshopEvent`
   row whose `id`, `date`, `title`, `timeLabel`, `host`, `location`, `tag`,
   `accent`, `track`, `iconName`, `externalHref`, `ctaLabel`, `registrationOpen`
   and `resources` match. Only delete the `EVENTS` array once that passes —
   after deletion the comparison is impossible.
4. **Gate before phase 2:** assert every distinct `WorkshopRegistration.eventId`
   matches a `WorkshopEvent.id`. If even one does not, stop — a roster is about
   to detach.
5. Parameterise the seven helpers and rewire all 14 importers (§6 scope
   correction), applying the eligibility rule from §5. Client components receive
   plain serialisable rows from a server parent; none of them reads the data
   itself. With every legacy event archived, the public upcoming surfaces are
   legitimately empty, and `placeholderSaturdays` fills the calendar with TBA.
6. Rewrite `getRegistrableEvent` to the §5 rule. Keep its existing
   "soonest single open event" behaviour — that is what stops two open workshops
   filing both rosters under the earlier one.

### Phase 1a — the notification seam (LOCKED path, approved)

`src/features/notification/derive-event-notifications.ts` imports `EVENTS`
(line 3) and iterates it (line 85). `EVENTS` cannot be retired without it.
**Manuvrtti has approved this specific change.** The approval is narrow and does
not carry to anything else.

**Allowed:** replace the workshop data dependency — `EVENTS` → the workshop
repository read — and make the function async if that requires it.

**Not allowed**, and any of these means stop and report: changing notification
business logic, categories, recipients, templates, timing or schema; touching
`NotificationCategory`; refactoring unrelated notification code; widening the
notification system's scope. Preserve the existing output exactly.

**Proof obligation.** Before and after the swap, run
`derive-event-notifications` over the *same* workshop data and diff the result.
The notification decisions and content must be **byte-identical**. Capture both
runs in the Phase 1 report. A change in output is a failure, not something to
rationalise — the seam is a data-source swap and nothing else.

### Phase 2
7. Actions: `requireAdmin` + Zod + `{ ok, data } | { ok, message }`, each
   writing an `AdminAction` audit row via `writeAudit`.
8. The id is **derived from the date and shown read-only**. Never an input.
9. **Archive, never delete**, for any event with registrations. Deletion only
   when the roster is empty, and the UI must say which case it is in.
10. Mirror existing admin form patterns; `AccountOpsDialog`'s reason-plus-confirm
   is the house style for consequential admin writes.

### Phase 3
11. Register the config keys; expose them in the admin settings panel.
12. Poster upload validates **magic bytes server-side**, not just the extension —
    `src/features/resume/ingest.ts` does exactly this for PDFs and is the pattern
    to copy. Cap the size. Store the returned URL on the event.
13. Retire `getWorkshopConfig()` and the Supabase import once the keys move.
    Leave the cohort-application readers in `workshop-supabase.ts` alone.

## 9. Guardrails (DO NOT)

- **Never let an event id be typed, edited or regenerated after creation.** It is
  the roster key for 366 rows.
- **Do not delete an event that has registrations.** Archive it.
- **Do not surface archived or unpublished events on any public route** — not in
  the calendar, the timeline, the countdown, or `getRegistrableEvent`.
- **Do not fall back to a past or archived workshop when nothing is published.**
  Empty means TBA, never "show the most recent one".
- **Do not store a `LucideIcon`, or pass one from a Server to a Client
  Component.** Store the name; map it on the client.
- **Do not put posters in the résumé Blob store**, and do not make that store
  public. Résumés carry personal data.
- **Do not reuse or modify `NotificationCategory`** for `track`, however well its
  values match. It is a hard-locked enum in Manuvrtti's notification module.
  Declare `WorkshopTrack` — see §5.
- **Do not hard-delete an event to "clean up" the port.** All ten legacy rows
  stay, archived.
- Do not add the `WorkshopRegistration.eventId` → `WorkshopEvent.id` FK in phase 1.
- Do not drop `events-data.ts` wholesale — the type, helpers and icon map stay;
  only the `EVENTS` array goes.
- Do not touch the cohort-application functions in `workshop-supabase.ts`.
- Public surfaces (`/workshop`, `/workshop/events`) stay **public** — no
  `requireAdmin` / `requireRole` on them.
- Server Components by default; mutations via Server Actions, not route handlers.
  Zod at every boundary, `select` on every query, transactions for multi-step
  writes, `lib/logger.ts` never `console`.
- `buttonVariants` on `<Link>`, never `<Button asChild>`.

## 10. DB safety

Phase 1 changes data. Before the seed: commit checkpoint, record the hash, take a
**Neon branch snapshot**. The migration is additive (one new table; nothing on
`WorkshopRegistration` is altered), so the risk is the seed, not the schema. The
seed is `upsert`-by-id and idempotent. **Never** `migrate dev` or `migrate reset`
against a database with real rows — `migrate deploy` only.

## 11. Verification

**Phase 1.** `npx prisma migrate deploy`, `npx prisma generate`, then a script asserting:
- 10 `WorkshopEvent` rows exist, ids matching the original array exactly;
- **all 10 have `archivedAt` set**;
- every distinct `WorkshopRegistration.eventId` matches a `WorkshopEvent.id`;
- `WorkshopRegistration.count()` is still **366**.

Plus the two obligations this phase's scope added:
- **Field round-trip** — every one of the 24 fields survives the port for all
  ten events (§8 step 3), run while `EVENTS` still exists.
- **Notification equivalence** — `derive-event-notifications` produces
  byte-identical output before and after the seam swap (§8a). Both runs go in
  the report.

Then, on the public site: **none of the ten legacy events appears** on `/workshop`
or `/workshop/events`, and with nothing published the page shows the TBA /
coming-soon state rather than a stale countdown or a past workshop. The calendar
shows generated "Workshop — TBA" Saturday tiles, and **no TBA tile appears as a
registerable card** (`openWorkshops` excludes placeholders). In
`/admin/workshop`, all ten are still listed with their registration counts.
Build gates: `npm run build`, `npx tsc --noEmit`, `npx eslint` on touched files
— both `tsc` and the build need `NODE_OPTIONS=--max-old-space-size=8192` here.

**Phase 2.** Create a workshop in the console → confirm the derived id and that
it is **not** public while unpublished → publish it → confirm it becomes the
first publicly visible workshop and the TBA state is replaced. Confirm an
`AdminAction` row was written. Attempt to delete one with registrations and
confirm refusal. Confirm a non-admin gets nothing: `/admin/workshop` redirects
and the actions refuse.

**Phase 3.** Flip `workshop.mode` to `COMING_SOON` → `/workshop` becomes the
coming-soon screen with no countdown and no signup; flip back → full
restoration. Toggle the calendar off and on. Upload a poster and confirm it
renders **while logged out** (the public-store check), then try a non-image and
an oversized file and confirm both are refused server-side.

## 12. Ownership

TASK: admin-managed workshops end to end
MODULE: **Workshop is not assigned to anyone** in CLAUDE.md's ownership table. It
straddles Platform Admin, System configuration, Database conventions and Audit
(Sohail) and the public landing's UI/UX (Shallika).
CROSS-MODULE: `/workshop` and `src/components/workshop/*` are visual surfaces —
**get Shallika's sign-off before phase 3**, where the coming-soon design lands.
Phases 1 and 2 are data and admin console. Nothing here touches notifications,
jobs, hire, resume or recruiter paths.

## 13. Commit messages

- `Move the workshop schedule into the database`
- `Let an admin create and archive workshops from the console`
- `Add a coming-soon state, calendar toggle and posters to the workshop page`
