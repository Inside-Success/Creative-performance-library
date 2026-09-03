# Creative Performance Library — Review Findings

**Date:** 2026-09-03
**Scope:** Investigation-only review of the dashboard (Bucket 1). No code was changed to produce this report.
**Branch:** none created — this report predates any implementation work.

## Files read

- `README.md`, `PHASE-1-LOCK-CHECKLIST.md`, `DEPLOYMENT.md`, `.env.example`, `render.yaml`, `package.json`
- `src/config/phase0.ts`
- `src/lib/ranking.ts`, `src/lib/meta.ts`, `src/lib/hyros.ts`, `src/lib/meta-cache.ts`, `src/lib/types.ts`, `src/lib/sample-data.ts`
- `src/app/api/creatives/route.ts`, `api/sync/route.ts`, `api/meta/refresh/route.ts`, `api/meta/probe/route.ts`, `api/meta/spike/route.ts`, `api/hyros/probe/route.ts`, `api/phase1/status/route.ts`
- `src/auth.ts`, `src/lib/auth-access.ts`, `src/middleware.ts`
- `src/app/page.tsx`, `src/components/dashboard.tsx`, `src/components/refresh-control.tsx`, `src/components/app-nav.tsx`, `src/app/phase1/page.tsx`, `src/app/phase1/system-checks-client.tsx`, `src/app/settings/page.tsx`

## Important caveat on evidence

`data/` contains only `.gitkeep`. **There is no Meta snapshot on disk**, so no live row could be inspected directly — including the ~$2,570 creative in section 4. Every finding below is traced from source code and from the verification dates recorded in `README.md`. The one place this matters materially is flagged inline in section 4, and a single `npm run sync` would resolve it.

---

## 1. The two metadata rows — where they live and what they convey

Both rows are `<section className="phase-grid">` blocks in `src/app/page.tsx` — lines 69 and 88 — rendered server-side, above the `<Dashboard>` component. Eight cards total.

### Row 1 — "Live Meta summary" (`src/app/page.tsx:69-86`)

| Card | Source | Meaning |
|---|---|---|
| Approved accounts | `phase0.adAccounts.length` | Hardcoded `2`. Never changes. |
| Last 30d spend sample | sum of `accountSummaries[].totalSpend` | Total Meta spend across both accounts in the window |
| Rows with previews | sum of `adsWithCreativePreview` | How many ad rows got a usable thumbnail URL |
| Rows with appointments | sum of `adsWithAppointments` | Count of rows where `appointments !== null` |

### Row 2 — "Attribution status" (`src/app/page.tsx:88-109`)

| Card | Source | Meaning |
|---|---|---|
| Ranking metric | `appointmentRows > 0 ? "Cost per appointment" : "Cost per lead (proxy)"` | Which metric the buckets were decided on |
| Appointment source | `appointmentSource.mode` | Raw enum string — `unconfigured`, `hyros-attribution`, `exact-action-types` |
| Custom conversions | `customConversionCount` | Currently `0` by design (see `README.md`) |
| Lead action type | `creativeRows[0].leadActionType` | The exact Meta action type leads were read from |

### Assessment

All eight cards are **build-validation telemetry, not performance metrics.** "Approved accounts: 2" and "Custom conversions: 0" are effectively constants. "Appointment source: unconfigured" leaks a raw internal enum to a business viewer. Only "Last 30d spend sample" is something a media buyer would actually look at.

**Recommendation:** move all eight into the collapsed Diagnostics area, but **promote the spend total back into the main view** — it is the one genuinely useful number in the set.

### Secondary bug found here

The "Ranking metric" card and the table header can disagree. `page.tsx:92` says "Cost per appointment" if **any** row has appointments, while `dashboard.tsx:250` independently computes `isProxyRanked` as **any** row being `lead-proxy`:

```js
const isProxyRanked = useMemo(
  () => creatives.some((creative) => creative.attributionBasis === "lead-proxy"),
  [creatives],
);
```

With a mixed snapshot both conditions are true simultaneously — the page header claims "Cost per appointment" while the table column header reads "CPL (ranking metric)". Worth fixing while reworking the ranking logic.

---

## 2. "Needs Attribution" — what it is and why it exists

It is a **relabelled `notEnoughData` bucket**. The mapping is in `src/components/dashboard.tsx:17-21`:

```js
const bucketLabels: Record<CreativeBucket, string> = {
  winning: "Winners",
  losing: "Watch / Cut",
  notEnoughData: "Needs Attribution",
};
```

A creative lands there when `classifyCreative` (`src/lib/ranking.ts:30`) cannot confidently call it a winner or a loser:

- `spend < $120` (`phase0.thresholds.minSpend`) — too little money spent to judge; or
- it has appointment data, but between 3 and 9 appointments at acceptable CPA — real traction, not yet a winner; or
- on the lead-proxy path, leads >= 3 with acceptable CPL.

### Why it exists

It is a **deliberate refusal to make a call.** Without a third bucket, every ad is forced into winner or loser, and a $40 ad with a single lead gets scaled or killed on pure noise. The bucket protects against acting on statistically meaningless rows.

### Problem with the name

"Needs Attribution" reads like *"this row has an attribution bug."* It actually means *"not enough spend or signal yet."* Those are completely different messages, and the current name sends the wrong one to a business viewer.

**Recommendation:** rename the visible tab to something like **"Too Early / Watch"**, and move the attribution mechanics (basis, source mode, matched action types) into Diagnostics.

---

## 3. "System Checks" — what it is, who it is for, and whether hiding it is safe

**Location:** `/phase1` → `src/app/phase1/page.tsx` + `src/app/phase1/system-checks-client.tsx` (412 lines).

**Behaviour:** on mount it fetches `/api/meta/spike` and renders pass/partial/fail check cards, per-account summaries, top live ad rows, campaign-to-funnel mapping gaps, an appointment-attribution panel listing candidate action types with volumes, all observed Meta action types, and Hosted V1 notes.

**Audience:** the maintainer and whoever configures Meta/Hyros. Its real job is to answer *"which action type should go in `META_APPOINTMENT_ACTION_TYPES`?"* — `README.md` explicitly points at this page for that decision.

### Is it safe to hide? Yes — and it is already half-hidden

Three independent gates already exist:

- `src/middleware.ts:18` restricts `/phase1`, `/api/meta/*`, `/api/hyros/*` and `/api/phase1/*` to admin emails
- `src/components/app-nav.tsx:9` only renders the nav link for admins
- `src/app/page.tsx:60` only renders the "System checks" card link for admins

A non-admin viewer already cannot reach it.

### An additional, stronger reason to hide it

**It is expensive.** `/api/meta/spike` calls `runMetaSpike()` directly and **bypasses the snapshot cache entirely**. Per `README.md` that is a full live re-query: roughly 16-20 Graph calls across both accounts, 21-43 seconds measured, against a Meta rate limit the README records as **already tripped once** (2026-08-11, at a 1-minute polling interval).

Every load of `/phase1` costs a full spike. Putting it behind a collapsed Diagnostics section that only fetches **when opened** is therefore a net *reduction* in Meta API load, not merely visual cleanup.

---

## 4. The ~$2,570 spend / zero-appointment creative — root cause

### How spend and appointments are actually joined

**Spend** comes from `act_<id>/insights` at `level=ad`, `date_preset=last_30d`, `action_report_time=conversion` (`src/lib/meta.ts:655`), keyed on `ad_id`.

**Appointments** follow one of two paths. With `META_APPOINTMENT_ACTION_TYPES` empty — the documented current state — `resolveAppointments` returns `appointments: null` immediately (`src/lib/meta.ts:416`):

```js
function resolveAppointments(insight: MetaInsight, spend: number) {
  const mode = appointmentSourceMode();

  if (mode === "unconfigured") {
    return { appointments: null, costPerAppointment: null, matchedTypes: [] };
  }
  ...
```

`runMetaSpike` then calls Hyros (`src/lib/meta.ts:767`), which queries `/api/v1.0/attribution` at `level=facebook_ad` with `attributionModel=last_click`, joining back on `row.id ?? row.adSourceId ?? sourceLinkAd.adSourceId` mapped to the Meta `adId`.

### Verdict: not a data-sync bug — but not a clean attribution mismatch either

Three distinct things are happening. One is a genuine defect; two are legitimate.

#### (a) REAL DEFECT — Hyros zeros are silently discarded

`src/lib/hyros.ts:264-268`:

```js
const appointments = toNumber(row[field]);

if (appointments > 0) {
  appointmentsByAdId.set(adId, appointments);
}
```

An ad that Hyros explicitly reports as `qualified_calls: 0` is **dropped from the map**. Back in `src/lib/meta.ts:770-774`:

```js
const appointments = hyros.appointmentsByAdId.get(row.adId);

if (appointments === undefined) {
  return;
}
```

The row keeps `appointments: null`.

**Consequence:** *"Hyros confirmed zero appointments"* and *"Hyros never returned this ad"* collapse into the same value. That row then falls through `classifyCreative` onto the **lead-proxy path** and is bucketed on leads — silently, despite Hyros having given a definitive, rankable answer.

**Diagnostic tell:** under the current config a live row **cannot** display a literal `0` — `formatNumber(null)` renders `"N/A"` (`src/lib/ranking.ts:17`). Therefore:

- If the Appts cell shows **N/A** → this is the bug above.
- If it genuinely shows **0** → `META_APPOINTMENT_ACTION_TYPES` has been set in the environment after all, and the row is on the Meta path with a zero-valued action type.

**This cannot be distinguished without a snapshot.** One `npm run sync` settles it.

#### (b) LEGITIMATE — window skew between the two providers

Meta uses `date_preset=last_30d`, which is evaluated in the **ad account timezone** and **excludes today**.

Hyros uses a separately computed window, `dateRangeForPreset` (`src/lib/hyros.ts:110-124`): `new Date()` minus 30 **UTC** days, and it **includes today**.

Two different 30-day windows on two different clocks. An ad that began spending recently can legitimately show Meta spend against a Hyros window that has not yet captured the booking.

#### (c) LEGITIMATE — attribution-model mismatch

Hyros runs `last_click` (`HYROS_ATTRIBUTION_MODEL=last_click`). A top-of-funnel creative that generates the click but not the *last* click before booking will correctly show spend and zero appointments.

This is real signal, not a bug — and it is precisely what a cost-per-appointment ranking is supposed to surface.

### Conclusion

The $2,570 row is most likely **(b)/(c) — legitimate**. But **(a) is masking it**, because the dashboard currently cannot say *"Hyros checked, and the answer is zero."*

**Order of operations:** fix (a) first — preserve the zero and distinguish it from "no Hyros row" — then re-read the row. Do **not** treat (b) or (c) as bugs; instead surface the window and attribution model on the row so this question does not get re-litigated.

---

## 5. The ranking conflict — resolved, not guessed

### The conflict

Two requests were made:

- **(a)** rank by cost-per-appointment
- **(b)** pull appointments **only** from Meta

**These are not both satisfiable today.** The blocker is data availability, not code.

### The evidence

`README.md` records a verification dated **2026-08-18** against both approved accounts over a 30-day window:

- **Zero custom conversions** are defined on either ad account.
- **No observed Meta action type represents a booked appointment.** The full conversion-like set is the lead family, `initiate_checkout`, `add_payment_info`, `purchase`, and `offsite_conversion.fb_pixel_custom` (~3.5k events/30d).
- `offsite_conversion.fb_pixel_custom` is Meta's catch-all bucket for custom pixel events that have no custom conversion defined, and **the API cannot break it out by name.**

The code is consistent with this: `META_APPOINTMENT_ACTION_TYPES` is empty, so `appointmentSourceMode()` returns `"unconfigured"` and appointments are `null` for every row.

### The trade-off

- **(b) alone** — Meta-only appointments — yields `appointments: null` on all 67 rows. The dashboard silently reverts to the lead proxy, which is exactly the behaviour the ranking rework is meant to eliminate. The result is **worse** ranking, not better.
- **(a) alone** — via Hyros — works **today**. The last validation matched **67 Meta ad rows and 540 qualified-call appointments**.

### Recommendation

**Implement (a). Source appointments from Hyros. Decline (b) for now.**

1. Rank on **volume + cost per appointment**, with Hyros as the appointment source.
2. **Label the source on the row.** `appointmentActionTypes` already carries `hyros:qualified_calls` — surface it so nobody mistakes it for Meta-native data.
3. **Fix the zero-dropping bug from section 4(a)** so "zero appointments" becomes a real, rankable state rather than a null. The new ranking depends on this.
4. **Keep the Meta path live and unchanged.** The moment someone creates the custom conversion in Events Manager, setting `META_APPOINTMENT_ACTION_TYPES=offsite_conversion.custom.<id>` hands control back to `resolveAppointments` with **no code change**. That is the real path to satisfying (b).

### The actual unblock is a human task, not engineering

Someone with Events Manager access opens the Inside Success TV pixel (`627166340065830`, last fired 2026-08-10) and reports what the custom events actually are. **The API cannot answer this** — it only sees the unnamed aggregate.

Also worth confirming at the same time: **does a new custom conversion report retroactively over existing pixel history, or only count forward?** That determines whether Meta-native appointment ranking works immediately or only after a ~30-day wait.

> **No Meta appointment numbers have been fabricated or estimated in this report.** Where Meta has no appointment data, that is stated as an absence.

---

## 6. Video ads — current preview behaviour vs. inline playback

### What it does today: static thumbnail only — and video ads are not even identified as video

- `previewUrlFor` (`src/lib/meta.ts:269`) returns `creative.image_url ?? creative.thumbnail_url` — a still image, nothing else.
- `CreativePreview` (`src/components/dashboard.tsx:56`) renders that as an `<img>` wrapped in `<a target="_blank">` pointing at **the same still**. Clicking gets you a larger picture, not a video.
- `video_id` **is already fetched** in `AD_FIELDS` (`src/lib/meta.ts:218`) and then **never used anywhere.** It is a dead field.
- `format` is hardcoded to `"Image"` for every live row (`src/lib/meta.ts:539`), even though the type permits `"Video"`. Only `sample-data.ts` contains real `"Video"` values — and the live table renders **no format column at all**.
- For a video ad, `image_url` is typically absent, so these fall back to `thumbnail_url`. The code's own comment at `src/lib/meta.ts:264` notes that Graph always renders `thumbnail_url` at **64x64** regardless of the `thumbnail_width`/`thumbnail_height` params — far too small to judge a creative on.

### What inline playback would take

1. **Plumb `video_id` through** `MetaSpikeCreativeRow` and `CreativeMetric` (currently dropped at the mapping step), and set `format: video_id ? "Video" : "Image"`.
2. **Fetch the playable source.** Two options:
   - `GET /{video_id}?fields=source,picture,permalink_url` — returns a direct MP4 in `source`. **Caveat:** `source` is a short-lived signed URL, so it must be fetched at render time or refreshed — it cannot be frozen into the 6-hour snapshot. Also requires the token to hold video read access on the ad account.
   - `GET /{ad_id}/previews?ad_format=DESKTOP_FEED_STANDARD` — returns an iframe of Meta's own renderer. More faithful, but it is an authenticated iframe whose visibility outside direct ad-account access is **exactly** the item `README.md` lists as **"partial"** under Hosted V1 success criteria. Needs real browser validation.
3. **UI:** replace `CreativePreview` with a click-to-play `<video poster={thumbnail}>` or a lightbox, retaining the existing `onError` fallback to initials.
4. **Cost:** adds one Graph call per video ad per refresh. At ~67 rows that is a meaningful increase on a refresh already at 16-20 calls and 21-43 seconds, against a tripped rate limit. Would want batching, or a separate lazily-fetched endpoint, rather than folding it into the snapshot sync.

**Rough size:** about half a day for option 1 with a lightbox, plus unknown validation time for the URL-durability question the README already flags as unresolved.

---

## 7. Two additional findings (not requested)

### `/api/meta/refresh` has no in-route authorization

`src/app/api/meta/refresh/route.ts` performs **no auth check of its own**. It is protected only by `src/middleware.ts:24` matching the `/api/meta/` prefix and routing unauthenticated callers to `unauthorized()`.

It is therefore covered **today**, but the route has zero defence if that matcher ever changes. Compare `/api/sync`, which validates `SYNC_TRIGGER_SECRET` **in-route** and is explicitly listed as a public path in `isPublicPath`. Worth hardening while working in the auth code.

### The daily SSO re-prompt is probably not a session-length problem

`src/auth.ts:21-23` sets:

```js
session: {
  strategy: "jwt",
},
```

with **no `maxAge`** — so it inherits the Auth.js default of **30 days**. The session config therefore does **not** explain a daily re-prompt.

**More likely cause: `AUTH_SECRET`.** `render.yaml` marks it `sync: false`, meaning it must be set by hand in the Render dashboard. If it was never set, or differs across restarts of the **free-plan** web service, then yesterday's JWT cannot be decrypted and every user is bounced to `/login`.

**Open question that determines the fix:** *is `AUTH_SECRET` actually set in the Render dashboard?* If yes, this is a two-line `maxAge`/`updateAge` config change. If no, it is an environment fix and the config change alone will not help.

An explicit `maxAge`/`updateAge` is worth setting either way. **The domain restriction should not be weakened** in the process.

---

## Summary of recommendations

| # | Recommendation | Type |
|---|---|---|
| 1 | Move the eight metadata cards into Diagnostics; promote "Last 30d spend" back to the main view | Cleanup |
| 2 | Reconcile the "Ranking metric" card with the table's `isProxyRanked` — they can currently disagree | Bug |
| 3 | Rename the "Needs Attribution" tab to "Too Early / Watch"; move attribution mechanics to Diagnostics | Clarity |
| 4 | Hide `/phase1` behind collapsed Diagnostics that fetch only on open — reduces Meta API load | Cleanup + perf |
| 5 | **Fix `hyros.ts:266`** — preserve explicit zeros, distinguish them from "no Hyros row" | **Bug (blocking)** |
| 6 | Surface the Hyros attribution window and model on the row to stop re-litigating (b)/(c) | Clarity |
| 7 | Rank by volume + cost per appointment, sourced from **Hyros**; keep leads as a visible column only | Feature |
| 8 | Decline "appointments from Meta only" — the data does not exist for these accounts | **Decision** |
| 9 | Keep the Meta action-type path live so a future custom conversion needs no code change | Architecture |
| 10 | Human task: open pixel `627166340065830` in Events Manager and report the custom event names | **Unblock** |
| 11 | Add in-route authorization to `/api/meta/refresh` | Hardening |
| 12 | Verify `AUTH_SECRET` is set in Render; then set an explicit session `maxAge`/`updateAge` | Auth |

### Blocking questions before implementation

1. **Confirm the section 5 recommendation** — Hyros-backed cost-per-appointment ranking, declining Meta-only appointments.
2. **Is `AUTH_SECRET` set in the Render dashboard?** This determines the shape of the SSO fix.
