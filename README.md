# Creative Performance Library

Inside Success TV internal dashboard for identifying winning, losing, and not-enough-data creatives across the two approved Meta ad accounts.

## Current phase

Phase 1 - Technical Validation & Meta API Spike.

The app currently includes:

- Live Meta dashboard backed by a local snapshot cache.
- Corrected Phase 0 decisions captured in `src/config/phase0.ts`.
- Ranking helpers for Winners, Losers, and Not Enough Data.
- Meta access probe endpoint at `/api/meta/probe`.
- Meta Phase 1 spike endpoint at `/api/meta/spike`.
- Cached live creative data endpoint at `/api/creatives`.
- Manual Meta snapshot refresh endpoint at `/api/meta/refresh`.
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

## Data freshness

The dashboard reads `data/meta-snapshot.json` first. If the snapshot is fresh, the
page loads from cache instead of re-querying Meta. If the snapshot is stale or missing,
the server attempts a refresh. If that refresh fails but a previous snapshot exists,
the app keeps showing the last successful data and labels it as stale instead of
blanking the dashboard.

Set `META_SNAPSHOT_PATH` to move this cache to another location, such as a Render
persistent disk path (`/var/data/meta-snapshot.json`). Leave it unset for local
development.

Freshness settings:

- `AUTO_REFRESH_MINUTES=30` controls the browser refresh button/timer.
- `META_CACHE_TTL_MINUTES=35` controls how long the server treats
  `data/meta-snapshot.json` as fresh.
- `SYNC_INTERVAL_HOURS=6` is the Render cron cadence.

Run `npm run sync` to refresh the local cache manually without opening the browser.
Run `npm run trigger-sync` from a scheduler/cron service to call the hosted
`/api/sync` endpoint through `CPL_SYNC_URL`.

The refresh controls sit on the bucket-tab row, opposite Winners / Watch-Cut / Needs
Attribution: a "Data as of HH:MM" stamp, an "auto every 30m" label, and a manual
**Refresh** button. A refresh takes roughly 20-30 seconds.

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

## Lead counting

Meta reports one lead under several aliases (`lead`, `onsite_web_lead`,
`offsite_conversion.fb_pixel_lead`, `offsite_lead_add_*`). The app previously summed
every action type containing "lead", which inflated lead counts by **~4.01x** and
understated CPL by the same factor - account-wide CPL read $13.11 when the true figure
was $52.54. Leads are now read from a single exact action type per row, recorded in
`leadActionType` for auditability.

## Hosted V1 success criteria

- Token can read both approved ad accounts. Current status: pass.
- Campaigns can be filtered to Leads / appointment-scheduled scope before storage. Current status: pass.
- Spend, status, leads, CPL, appointments, CPA, and creative preview fields can be derived. Current status: pass with Hyros `qualified_calls`.
- Creative image/video preview or thumbnail URLs can be pulled or a fallback is documented. Current status: pass for thumbnail extraction in the sample; durability still needs manual browser/session validation.
- Preview URLs are checked for visibility outside direct ad-account access. Current status: partial.
- Campaign-name-to-funnel mapping is clean enough or Hyros fallback is recommended. Current status: partial; new observed mappings are marked `Needs review`.
- Safe sync cadence is estimated from rate limits and data volume. Current status: partial; Hosted V1 ships with a 6h Render cron trigger.
