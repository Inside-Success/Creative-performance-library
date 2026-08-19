# Creative Performance Library - Phase 1 Lock Checklist

This file defines what is intentionally complete now, what is intentionally locked, and what unlocks only after Usman's temporary Meta access is available.

## For the team meeting - open items

Items 1 and 2 need a decision. Items 3-7 are context the team should know. Baseline
findings are from a live API spike against both approved accounts on 2026-08-11,
updated against the live snapshot of 2026-08-18.

**1. Appointment source - Hyros is now live; ratification required.**
**Update 2026-08-18: this is no longer a technical blocker.** `api.hyros.com` now
resolves, and Hyros is supplying appointments end to end. Verified in the live
snapshot refreshed 2026-08-18 12:19Z: the "Appointment attribution" check passes,
Hyros `qualified_calls` matched **67 of 300 Meta ad rows**, totalling **540
appointments**. Meta's own position is unchanged - still zero custom conversions
defined, still no action type representing a booking - so Hyros is currently the only
working source.

What remains is a business decision, not investigation:
   - **Ratify Hyros as the official appointment source.** It works today. The code
     path is `HYROS_API_KEY` plus `HYROS_APPOINTMENT_FIELD` (defaulting to
     `qualified_calls`), with `last_click` attribution.
   - **Or still create a custom conversion in Meta Events Manager** for the booking
     event, if Meta-native attribution is preferred. The likely candidate is whatever
     `offsite_conversion.fb_pixel_custom` is (~3.4k events/30d in the latest read) -
     the API only sees an unnamed aggregate, so someone must open the Inside Success
     TV pixel (`627166340065830`) and look. If this route is taken, also confirm
     whether a new custom conversion reports retroactively or only counts forward,
     since that decides whether ranking works immediately or after ~30 days.
   - Note the coverage limit either way: **67 of 300 rows carry appointments**, so
     most rows still cannot be appointment-ranked. See item 2.

**2. The dashboard no longer discloses how each row is ranked - and ranking is now
mixed.** The "Ranked by CPL proxy" banner was removed at the team's request pending
this meeting. Since Hyros came online the underlying behaviour has changed and the
disclosure question got harder: rows are no longer uniformly proxy-ranked. In the
2026-08-18 snapshot the 300 rows split three ways:
   - **61 rows ranked on real appointments** (`attributionBasis: appointment`).
   - **73 rows ranked on the lead/CPL proxy** (`lead-proxy`).
   - **166 rows with insufficient data** (`insufficient`).

So Winners and Watch/Cut now mix two different ranking bases on the same screen, with
nothing on the dashboard telling the reader which is which. Decide whether the
disclosure returns, and if so whether it should be per-row rather than a single
page-level banner.

**3. Lead counts and CPL changed - historical numbers will not match.**
Leads were previously summed across Meta's aliases for the same event, inflating
counts ~4.01x and understating CPL by the same factor (account-wide CPL read $13.11
when the true figure was $52.54). This is fixed. Any figures circulated before
2026-08-11 are wrong and should not be compared against current ones.

**4. Creative previews and delivery status were mostly broken.**
Previews resolved for almost no rows, and delivery status silently defaulted to
"Paused" for the same reason. Both now resolve for 100% of rows, and previews use the
full-resolution asset instead of Meta's fixed 64x64 thumbnail. Nothing to decide -
noted so the team knows why the dashboard looks different.

**5. Refresh cadence: 30 minutes - ACTIVATED 2026-08-11.**
Approved and switched on. `AUTO_REFRESH_MINUTES=30` is now set explicitly in
`.env.local` rather than relying on the code default. This covers the dashboard's
client-side refresh only; the server-side sync cadence in Phase 0 Decision 3 is a
separate question and is still open.

The dashboard failed live with "Application request limit reached" during testing.
The first mitigation is now complete: dashboard reads go through
`data/meta-snapshot.json` with a 35-minute cache TTL. A fresh cache prevents a
page load from querying Meta. If refresh fails, the app keeps showing the last
successful snapshot and labels it as stale.

**Correction 2026-08-18:** `META_CACHE_TTL_MINUTES` is **not** set in `.env.local`.
The 35-minute TTL is the hardcoded default in `src/config/phase0.ts` and
`src/lib/meta-cache.ts`. Behaviour is correct, but this is exactly the
relying-on-a-default situation this section warns about for `AUTO_REFRESH_MINUTES`
(which *is* set explicitly, at 30). Same applies to `HYROS_APPOINTMENT_FIELD`, which
falls back to the `qualified_calls` default rather than being declared. Both should be
written into `.env.local` explicitly so the live config is readable without grepping
the source.
   - **Auto-refresh runs every 30 minutes**, with a "Data as of HH:MM" stamp and a
     manual Refresh button on the bucket-tab row, opposite Winners / Watch-Cut /
     Needs Attribution. Previously there was no auto-refresh and no button at all.
   - **Measured 2026-08-11:** one full refresh takes **21-43 seconds** and is ~16-20
     Graph calls. A 1-minute interval was tested and **tripped Meta's rate limit after
     two cycles** - "Application request limit reached". This is not theoretical.
   - **15 minutes is the practical floor**, and every open tab runs its own timer, so
     five people with the dashboard open is five times the load. A hidden tab does not
     poll.
   - This is still a local JSON cache standing in for the real thing. Phase 0 Decision
     3 recorded "scheduled database sync", and the refresh-cadence field in the
     decision sheet was left blank. **That decision is still open**, and the right
     answer moves the interval onto one server-side sync job with a datastore.
   - `npm run sync` now writes `data/meta-snapshot.json`. `SYNC_INTERVAL_HOURS=6` and
     `phase0.sync.intervalHours` remain placeholders for a future scheduler. Do not
     quote 6 hours as the browser refresh rate - `AUTO_REFRESH_MINUTES` is the live
     setting.

**6. Ad-level reads are capped at 150 rows per account - and the cap is now binding.**
`readMetaEdge` stops at 3 pages of 50. Accounts with more active ads than that are
showing an incomplete picture, with no warning in the UI. Not yet raised, because
raising it increases API calls and item 5 is already a problem.

**Update 2026-08-18: this is no longer hypothetical.** The live snapshot holds exactly
150 rows for Inside Success TV and exactly 150 for Inside Success TV | Split Test -
300 total, both accounts pinned precisely at the ceiling. Landing on the cap exactly is
what truncation looks like; any ad beyond the first 150 per account is absent from the
dashboard, and no surface says so. This now also skews everything downstream: bucket
counts (35 winning / 72 losing / 193 not-enough-data) and the appointment-coverage
ratio in item 1 are all computed over a truncated set.

**7. The Phase 0 Decision Sheet was never signed.**
Every checkbox, signature line and final-decision field in the .docx is blank,
including "Phase 1 kickoff approved?". The code encodes the recommended defaults as
though they were ratified.

## Complete now

- Dashboard shell with three buckets:
  - Winning Creatives
  - Losing Creatives
  - Not Enough Data
- Funnel / offer filter.
- Ad account filter.
- Date range placeholder.
- Sample creative rows.
- Corrected Losing tab logic.
- Two approved Meta ad accounts:
  - Inside Success TV - `1988537858156251`
  - Inside Success TV | Split Test - `968479534887236`
- Safe Meta access probe endpoint:
  - `/api/meta/probe`
- Live Meta spike endpoint:
  - `/api/meta/spike`
- Cached live creative API endpoint:
  - `/api/creatives`
- Manual snapshot refresh endpoint:
  - `/api/meta/refresh`
- Local Meta snapshot writer:
  - `npm run sync`
- Phase 1 status endpoint:
  - `/api/phase1/status`
- Login-gate mock:
  - `/login`

## Unlocked after Meta access was provided

- Token can read both approved ad accounts.
- Lead-scope campaign filtering can run against live Meta campaign names.
- Ad-level insights can return spend and lead action data.
- Creative thumbnail / image URL extraction can run against live ads.
- Campaign-to-funnel keyword mapping can be tested against live campaign names.

## Still locked after the first live spike

- Production datastore-backed Meta sync.
- Meta-native appointment-goal field mapping. Still unavailable: Meta exposes no appointment action type and no custom conversions on these accounts. This is now bypassed rather than blocking, because appointments arrive from Hyros instead. Only needed if the team prefers Meta-native attribution.
- Campaign-name-to-funnel validation sign-off for newly observed show names.
- Ratification of Hyros as the appointment source. **Status 2026-08-18: UNBLOCKED AND LIVE.** `api.hyros.com` resolves, and Hyros is returning Facebook ad-level `qualified_calls` - 67 matched rows, 540 appointments, appointment attribution check passing. Appointment ranking has unlocked for the rows Hyros covers. What is still open is the team formally adopting it as the source of record, plus the 67/300 coverage gap.
- Final sync cadence.
- Production datastore choice.

## Locked until production readiness

- Real Google Workspace SSO.
- Dedicated Meta system-user token.
- Secret-manager storage.
- Role/group-based access controls.
- Audit logging.
- Production deployment.

## Temporary Phase 1 access rule

Usman's Meta access may be used only for local validation. Do not commit tokens, paste tokens into chat, or expose tokens in browser-side code.

Use `.env.local` only:

```bash
META_SYSTEM_USER_TOKEN=...
META_API_VERSION=v21.0
```

## Phase 1 go/no-go tests

Before moving into Phase 2, confirm:

1. The temporary token can read both approved ad accounts.
   - Current status: pass.
2. Campaigns can be filtered to Leads / appointment-scheduled scope before storage.
   - Current status: pass for lead-scope filtering in the sampled rows.
3. Spend, status, appointments, leads when available, CPA, and CPL can be derived reliably.
   - Current status: **pass as of 2026-08-18**, previously a split result. Spend, status, leads, and CPL: pass. Leads are read from one exact Meta action type per row - the previous substring match summed Meta's lead aliases and inflated counts ~4.01x while understating CPL 4x.
   - Appointments and CPA: **now pass, via Hyros.** This was recorded as "fail, and not fixable in code" while Meta was the only candidate source. Meta's limitation is unchanged - zero custom conversions, no booking action type - but Hyros now supplies appointments directly: 67 matched ad rows, 540 appointments, `qualified_calls` on `last_click`. CPA derives from these.
   - Two caveats on the pass. **Coverage:** only 67 of 300 rows carry appointments, so 73 rows still fall back to the lead/CPL proxy and 166 lack enough data to rank at all. **Truncation:** those 300 rows are themselves capped (see open item 6), so true coverage is unmeasured.
   - Events Manager remains an optional alternative route: create a custom conversion for the booking event, then set `META_APPOINTMENT_ACTION_TYPES` to the resulting `offsite_conversion.custom.<id>`. `/phase1` lists candidate action types with volumes.
   - For rows Hyros does not cover, the dashboard still ranks on cost per lead - but the proxy label is currently switched off on every surface pending open item 2.
4. Creative image/video preview or thumbnail URLs can be pulled, or a fallback is documented.
   - Current status: pass for extracting thumbnail/image URLs in the sample.
5. Preview URLs are checked for visibility outside direct ad-account access.
   - Current status: partial. URLs are extracted, but durability/visibility needs manual browser validation.
6. Campaign-name-to-funnel mapping is clean enough, or Hyros fallback is recommended.
   - Current status: partial. The mapping improved after adding observed show names, but remaining gaps need manual review.
7. Safe sync cadence is estimated from rate limits and data volume.
   - Current status: partial. Keep the 6h placeholder until full pagination volume and Meta rate headers are reviewed.

## Phase 2 unlock condition

Only begin Phase 2 once the Phase 1 spike produces a written result for each go/no-go test above.

**Status 2026-08-18.** Every test now has a written result: tests 1-4 pass, tests 5-7
partial. Test 3 was the hard blocker and it cleared when Hyros came online, so the
condition as literally written is met. Three things should still land before Phase 2 is
called open, and none of them are spike work:
   - A team decision on open items 1 and 2 (ratify the appointment source; decide the
     ranking-basis disclosure).
   - The row cap in open item 6, since every count in this document is computed over a
     truncated read.
   - A signature on the Phase 0 Decision Sheet (open item 7), which is still entirely
     blank including "Phase 1 kickoff approved?".
