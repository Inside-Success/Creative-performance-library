# Creative Performance Library

Inside Success TV internal dashboard for identifying winning, losing, and not-enough-data creatives across the two approved Meta ad accounts.

## Current phase

Phase 1 - Technical Validation & Meta API Spike.

The app currently includes:

- Live Meta dashboard backed by a per-date-range snapshot cache.
- Corrected Phase 0 decisions captured in `src/config/phase0.ts`.
- Ranking helpers for Winners, Watch / Cut, and Too Early to Call, decided on
  appointment volume and cost per appointment.
- Date-range selector (last 7 / 14 / 30 / 90 days) on the dashboard.
- Collapsed Diagnostics area holding coverage counts, attribution mechanics,
  and the link to System Checks.
- Meta access probe endpoint at `/api/meta/probe`.
- Meta Phase 1 spike endpoint at `/api/meta/spike`.
- Cached live creative data endpoint at `/api/creatives`.
- Admin-only Meta snapshot refresh endpoint at `/api/meta/refresh`.
- Phase 1 lock/status endpoint at `/api/phase1/status`.
- Google Workspace SSO gate at `/login`.
- Environment template in `.env.example`.

## Phase 1 setup

Copy `.env.example` to `.env.local` and fill in the temporary Meta token locally:

```bash
META_SYSTEM_USER_TOKEN=...
META_API_VERSION=v21.0
META_APPOINTMENT_ACTION_TYPES=
SYNC_INTERVAL_HOURS=6
AUTO_REFRESH_MINUTES=30
META_CACHE_TTL_MINUTES=35
```

`META_APPOINTMENT_ACTION_TYPES` is intentionally empty. See "Appointment attribution" below.

Do not commit `.env.local`.

For the spike, Usman's token may be used temporarily to validate API access. Production should migrate to a dedicated Meta system user before deployment.

## Approved Meta ad accounts

- Inside Success TV - `1988537858156251`
- Inside Success TV | Split Test - `968479534887236`

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

To test Meta account read access after setting `.env.local`, open:

```text
http://localhost:3000/api/meta/probe
```

To run the Phase 1 live Meta spike after the probe passes, open:

```text
http://localhost:3000/api/meta/spike
http://localhost:3000/phase1
```

`/phase1` no longer queries anything on load - expand "Live provider checks" to
start the spike. Both routes are admin-only, and `/phase1` is intentionally
absent from the top nav: the only in-app link to it is in the collapsed
Diagnostics panel on the dashboard, next to the warning about what it costs.

To refresh the dashboard snapshot cache from the command line:

```bash
npm run sync
```

To inspect the live app:

```text
http://localhost:3000
http://localhost:3000/api/creatives
http://localhost:3000/api/phase1/status
http://localhost:3000/api/hyros/probe
```

## Production boundary

The app now reads live Meta + Hyros data into a snapshot cache and serves
dashboard reads from that cache.

Completed for Hosted V1:

- Google Workspace SSO
- admin/viewer route access
- Hyros appointment attribution
- Render cron trigger plumbing for scheduled refresh

Still reserved until the fuller production phase:

- dedicated Meta system user
- secret-manager storage
- database-backed scheduled sync
- audit logging
- production deployment

Hosted V1 is protected by Google Workspace SSO. Users must sign in with a
verified email on the configured `ALLOWED_EMAIL_DOMAIN`. Admin-only areas are
controlled by `CPL_ADMIN_EMAILS`; leave it empty locally to treat allowed domain
users as admins during setup.

## Appointment attribution

Verified against both approved accounts on 2026-08-18 over a 30-day window:

- **Zero custom conversions** are defined on either ad account.
- **No observed Meta action type represents a booked appointment.** The full
  conversion-like set is the lead family, `initiate_checkout`, `add_payment_info`,
  `purchase`, and `offsite_conversion.fb_pixel_custom`.
- Therefore Meta **cannot currently answer** "how many appointments did this creative
  book?" for these accounts. This is a data-availability fact, not a config mistake -
  no keyword or code change can recover it.

Because of that, Hosted V1 uses Hyros as the appointment source. Rows with Hyros
appointments rank on **cost per appointment** and expose `attributionBasis:
appointment`. Rows without appointment signal remain provisional.

Every row carries an `appointmentSource` of `meta`, `hyros`, or `none`, and the
table renders it as a badge next to the appointment count. A Hyros-attributed
number must never be read as a Meta-reported one, so the provider is always
named on the row.

### Confirmed zero vs. no answer

These are different states and the code keeps them apart:

- **`appointments: 0` with a real source** - a provider answered and the answer
  was zero. This is a rankable result and buckets as `zeroAppointments` in
  Watch / Cut.
- **`appointments: null`, source `none`** - no provider covered the ad. Nothing
  is known, so the row falls back to the lead/CPL proxy and is labelled as
  provisional.

Hyros zeros were previously dropped from the attribution map, which collapsed
both states into `null` and pushed confirmed-zero rows onto the lead proxy.
`getHyrosAppointmentsForCreatives` now records every ad Hyros answers for,
including zeros; absence from the map is the only signal for "not covered".

### Windows do not match, by design

Meta spend and Hyros appointments are read over **different windows on
different clocks**, and the dashboard states this above the table rather than
hiding it:

- Meta resolves its `date_preset` in the **ad account timezone** and excludes
  today.
- Hyros is queried in **UTC** and includes today.

Combined with `last_click` attribution - which credits a booking to the last ad
clicked - an ad can legitimately show spend against zero appointments. That is
a finding, not a sync bug, and it is exactly what a cost-per-appointment
ranking is meant to surface.

Two ways to resolve it, in order of preference:

1. **Create a custom conversion in Meta Events Manager** for the booking event.
   **Status: PENDING team discussion.** The
   most likely place it is hiding is `offsite_conversion.fb_pixel_custom` (~3.5k
   events/30d), which is Meta's bucket for custom pixel events that have no custom
   conversion defined - the API cannot break it out by name. Once a custom conversion
   exists it appears in insights as `offsite_conversion.custom.<id>`; put that exact
   string in `META_APPOINTMENT_ACTION_TYPES` and ranking switches to cost per
   appointment with no code change.

   To take to the meeting: someone with Events Manager access opens the Inside Success
   TV pixel (`627166340065830`, last fired 2026-08-10) and reports what the custom
   events actually are. The API cannot answer this - it only sees the unnamed
   aggregate. Also worth confirming whether a new custom conversion reports
   retroactively over existing pixel history or only counts forward, since that
   decides whether appointment ranking works immediately or after a ~30-day wait.
2. **Make Hyros the appointment source** - the documented Phase 0 fallback.
   **Status: DONE FOR HOSTED V1.** Leave
   `META_APPOINTMENT_ACTION_TYPES` empty for this route. Set `HYROS_API_KEY` in
   `.env.local`; the app asks Hyros for Facebook ad-level attribution and fills
   appointments from `HYROS_APPOINTMENT_FIELD` (`qualified_calls` by default).
   Latest validation matched 67 Meta ad rows and 540 qualified-call appointments.

`/phase1` lists the candidate action types with volumes to support this decision.

## Ranking

Creatives are bucketed on **appointment volume and cost per appointment** -
never on leads. Leads and CPL stay as displayed columns for context.

Thresholds live in `src/config/phase0.ts`:

| Threshold | Default | Role |
|---|---|---|
| `minSpend` | `$120` | Below this, nothing is judged |
| `winnerAppointmentThreshold` | `10` | Volume floor for a win |
| `targetCpaBenchmark` | `$80` | Efficiency ceiling for a win |
| `lowVolumeAppointmentBand` | `[1, 2]` | Low-volume band |

Buckets:

- **Winners** - at least `winnerAppointmentThreshold` appointments **and** cost
  per appointment at or under `targetCpaBenchmark`. Both axes are required:
  high volume at a bad CPA is the most expensive way to lose money, so it drops
  to Watch / Cut as `highCpa`. Ordered cheapest booking first, volume breaking
  ties.
- **Watch / Cut** - spend over `minSpend` with a confirmed zero
  (`zeroAppointments`), high volume above the CPA benchmark (`highCpa`), or low
  volume above it (`lowVolumeHighCost`). Ordered worst tier first, then by
  spend.
- **Too Early to Call** - under `minSpend`, or booking acceptably but not yet at
  the volume floor. Not a verdict; just not enough yet. This bucket was
  previously labelled "Needs Attribution", which wrongly implied a data bug.
  The underlying `notEnoughData` key is unchanged.

`resolveRankingMode` in `src/lib/ranking.ts` is the **single** source of truth
for which metric the view ranks on. The page header and the table column header
both read it. They used to derive it independently - the header from "any row
has appointments", the table from "any row is a proxy" - and a mixed snapshot
made both true at once, so the two contradicted each other.

When no row has an appointment source, the whole view falls back to cost per
lead and says so in both places.

## Data freshness

The dashboard reads `data/meta-snapshot.json` first. If the snapshot is fresh, the
page loads from cache instead of re-querying Meta. If the snapshot is stale or missing,
the server attempts a refresh. If that refresh fails but a previous snapshot exists,
the app keeps showing the last successful data and labels it as stale instead of
blanking the dashboard.

Set `META_SNAPSHOT_PATH` to move this cache to another location, such as a Render
persistent disk path (`/var/data/meta-snapshot.json`). Leave it unset for local
development.

### One snapshot per date range

Each date range gets its own snapshot file, so switching range does not evict
the range you were just looking at:

| Range | File |
|---|---|
| Last 30 days (default) | `data/meta-snapshot.json` |
| Last 7 days | `data/meta-snapshot.last_7d.json` |
| Last 14 days | `data/meta-snapshot.last_14d.json` |
| Last 90 days | `data/meta-snapshot.last_90d.json` |

The default range keeps the original bare filename, so `npm run sync`,
`/api/sync`, the Render cron trigger and any `META_SNAPSHOT_PATH` disk path
keep working unchanged. Non-default ranges are written as siblings next to it.

**The cron only warms the default range.** The first view of any other range
after its TTL expires triggers a live refresh (~20-40s) for that range. Each
range is then cached independently for `META_CACHE_TTL_MINUTES`, so the
worst case is one refresh per range per TTL rather than one per page view.

Only rolling-day presets are offered. Calendar presets (`this_month`,
`last_month`) are deliberately excluded: Meta resolves them in the ad account
timezone while Hyros resolves them in UTC, which shifts the spend and
appointment windows against each other at every month boundary. Adding a preset
to `DATE_RANGE_OPTIONS` in `src/lib/date-range.ts` **requires** adding the
matching entry to `HYROS_PRESET_DAYS` in `src/lib/hyros.ts`, or Hyros silently
keeps querying 30 days.

Freshness settings:

- `AUTO_REFRESH_MINUTES=30` controls the browser refresh button/timer.
- `META_CACHE_TTL_MINUTES=35` controls how long the server treats a snapshot
  file as fresh.
- `SYNC_INTERVAL_HOURS=6` is the Render cron cadence.

Run `npm run sync` to refresh the local cache manually without opening the browser.
Run `npm run trigger-sync` from a scheduler/cron service to call the hosted
`/api/sync` endpoint through `CPL_SYNC_URL`.

The refresh controls sit on the bucket-tab row, opposite the Winners /
Watch / Cut / Too Early to Call tabs: a "Data as of HH:MM" stamp, an "auto every
30m" label, and a manual **Refresh** button. A refresh takes roughly 20-30 seconds and refreshes
the range currently selected, not always the default.

`/api/meta/refresh` enforces its own session and admin check, rather than
relying only on the middleware path prefix. `/api/sync` validates
`SYNC_TRIGGER_SECRET` in-route because a scheduler calls it.

Two things constrain how short this interval can safely be:

- **Meta refresh is still expensive.** A cache refresh is a full live re-query -
  roughly 16-20 Graph calls across both accounts, taking 21-43 seconds measured. A
  1-minute interval was tested on 2026-08-11 and tripped Meta's rate limit after two
  cycles.
- **The data does not move that fast.** Meta's own insights lag by minutes, and these
  are 30-day rollups. Polling every few minutes would multiply API load to show
  numbers that are effectively identical.

**15 minutes is the practical floor.** Below that, move from the local JSON cache to
a real scheduled sync/datastore rather than shortening the interval.

A hidden tab never polls - the timer checks `document.visibilityState` on each tick, so
a dashboard left open overnight goes quiet instead of querying Meta until morning.

Client-side polling plus the local JSON cache is still a stopgap. Hosted V1 adds a
server-side sync endpoint and Render cron trigger, but a database-backed datastore
would still be the stronger long-term production shape.

## Dashboard layout

The default view is a performance dashboard and nothing else: filters, the
three bucket tabs, the attribution note, and the table. Build and attribution
telemetry lives in a **Diagnostics** section at the bottom, collapsed by
default and server-rendered with no client JS.

Diagnostics holds the coverage counts (approved accounts, spend, rows with
previews, rows with appointment data), the attribution mechanics (ranking
metric, appointment source, custom conversions, lead action type), the reason
Meta cannot supply appointments, and - for admins - the link to System Checks.
Total spend for the selected range is promoted out of Diagnostics into the page
header, since it is the one number a media buyer actually wants there.

"Rows with appointment data" counts rows a provider **answered** for, including
confirmed zeros. It is coverage, not success.

### System Checks is lazy

`/phase1` runs a full live provider spike: `/api/meta/spike` bypasses the
snapshot cache entirely and re-queries Meta directly - roughly 16-20 Graph
calls, 20-40 seconds, against a rate limit these accounts have already tripped
once.

It used to fire on every page load. It now sits behind a collapsed section and
fetches only when opened; collapsing and re-opening reuses the result already
in state. Admin gating via `middleware.ts` and `CPL_ADMIN_EMAILS` is unchanged.

`/phase1` is also absent from the top nav - the single in-app entry point is
the Diagnostics panel, so the link always appears next to the note about its
cost. `middleware.ts` still guards the route itself, so removing the nav item
changes discoverability only, not access.

**Note on `CPL_ADMIN_EMAILS`:** when it is empty, `isAdminEmail` returns `true`
for every allowed-domain user (`src/lib/auth-access.ts`). Leaving it unset in a
hosted environment therefore makes every signed-in company user an admin, who
then sees the Diagnostics admin link, the Refresh button, and `/funnels`,
`/settings` and `/phase1`. Populate it in production.

## Lead counting

Meta reports one lead under several aliases (`lead`, `onsite_web_lead`,
`offsite_conversion.fb_pixel_lead`, `offsite_lead_add_*`). The app previously summed
every action type containing "lead", which inflated lead counts by **~4.01x** and
understated CPL by the same factor - account-wide CPL read $13.11 when the true figure
was $52.54. Leads are now read from a single exact action type per row, recorded in
`leadActionType` for auditability.

Leads are **not** a ranking key. They are shown for context alongside the
appointment metrics the buckets are actually decided on - see "Ranking" above.
CPL only becomes the ranking metric when no row has any appointment source at
all, and the UI labels the whole view as a proxy when that happens.

## Hosted V1 success criteria

- Token can read both approved ad accounts. Current status: pass.
- Campaigns can be filtered to Leads / appointment-scheduled scope before storage. Current status: pass.
- Spend, status, leads, CPL, appointments, CPA, and creative preview fields can be derived. Current status: pass with Hyros `qualified_calls`.
- Creatives rank on appointment volume and cost per appointment, not leads. Current status: pass, sourced from Hyros.
- Creative image/video preview or thumbnail URLs can be pulled or a fallback is documented. Current status: pass for thumbnail extraction in the sample; durability still needs manual browser/session validation. Video ads show a still only - see "Deferred".
- Preview URLs are checked for visibility outside direct ad-account access. Current status: partial.
- Campaign-name-to-funnel mapping is clean enough or Hyros fallback is recommended. Current status: partial; new observed mappings are marked `Needs review`.
- Safe sync cadence is estimated from rate limits and data volume. Current status: partial; Hosted V1 ships with a 6h Render cron trigger.

## Deferred

Scoped but deliberately not built:

- **Inline video playback.** `previewUrlFor` returns `image_url ?? thumbnail_url`
  - a still image. `video_id` is fetched in `AD_FIELDS` but unused, and
  `format` is hardcoded to `"Image"` on every live row. Playback needs
  `video_id` plumbed through, plus either `GET /{video_id}?fields=source`
  (short-lived signed URL, cannot be frozen into the snapshot) or
  `GET /{ad_id}/previews` (authenticated iframe, visibility outside ad-account
  access is the open question already flagged above). Roughly half a day plus
  validation, and one extra Graph call per video ad per refresh.
- **Pause / turn off low-performing ads from the dashboard.** Requires Meta
  write scopes (`ads_management`) that the current read-only token does not
  hold, plus a token change, an audit trail, and confirmation safeguards before
  any write reaches a live ad account.

## Session lifetime

`src/auth.ts` uses a JWT session with no explicit `maxAge`, so it inherits the
Auth.js default of 30 days. If users are re-prompted to sign in daily, the
session config is not the cause - check that `AUTH_SECRET` is actually set and
stable in the Render dashboard. It is marked `sync: false` in `render.yaml`, so
it must be set by hand; if it is missing or changes across restarts, previously
issued JWTs cannot be decrypted and everyone is bounced to `/login`.
