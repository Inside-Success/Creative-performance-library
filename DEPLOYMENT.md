# CPL Deployment Checklist

## Current status

- The app is a Next.js Node web service, not a static site.
- Local validation passes with `npm run typecheck` and `npm run build`.
- GitHub can receive the repo now as long as `.env.local` stays untracked.
- Render can host this later as a Node web service using `render.yaml`.

## Before pushing to GitHub

- Confirm `.env.local` is not tracked.
- Confirm `data/meta-snapshot.json` is not tracked.
- Commit `.env.example`, `render.yaml`, `.nvmrc`, and application source.
- Do not commit Meta tokens, Hyros keys, local snapshots, `.next`, or `node_modules`.

## Render service

Use the included `render.yaml` blueprint, or create a Web Service manually:

```text
Runtime: Node
Build Command: npm ci && npm run build
Start Command: npm start
```

Set these environment variables in Render:

```text
META_SYSTEM_USER_TOKEN
META_API_VERSION
META_APPOINTMENT_ACTION_TYPES
HYROS_API_KEY
HYROS_BASE_URL
HYROS_ATTRIBUTION_MODEL
HYROS_APPOINTMENT_FIELD
AUTO_REFRESH_MINUTES
META_CACHE_TTL_MINUTES
META_SNAPSHOT_PATH
SYNC_INTERVAL_HOURS
SYNC_TRIGGER_SECRET
CPL_SYNC_URL
ALLOWED_EMAIL_DOMAIN
CPL_ADMIN_EMAILS
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
AUTH_SECRET
```

Recommended starting values:

```text
META_API_VERSION=v21.0
META_APPOINTMENT_ACTION_TYPES=
HYROS_BASE_URL=https://api.hyros.com/v1
HYROS_ATTRIBUTION_MODEL=last_click
HYROS_APPOINTMENT_FIELD=qualified_calls
AUTO_REFRESH_MINUTES=30
META_CACHE_TTL_MINUTES=35
META_SNAPSHOT_PATH=
SYNC_INTERVAL_HOURS=6
SYNC_TRIGGER_SECRET=<shared secret for /api/sync>
CPL_SYNC_URL=https://<render-app>.onrender.com/api/sync
ALLOWED_EMAIL_DOMAIN=insidesuccess.com
CPL_ADMIN_EMAILS=<comma-separated admin emails>
GOOGLE_CLIENT_ID=<Google OAuth client ID>
GOOGLE_CLIENT_SECRET=<Google OAuth client secret>
AUTH_SECRET=<32+ character random secret>
```

## Post-deploy checks

- Open `/api/meta/probe` and confirm both approved Meta accounts pass.
- Open `/api/hyros/probe` and confirm Hyros is reachable and the key is accepted.
- Open `/api/meta/refresh` from the dashboard Refresh button and confirm the snapshot refreshes.
- Open `/phase1` and confirm appointment attribution status.
- Open `/` and verify thumbnails, filters, ranking buckets, and stale-data messaging.
- Open `/login`, sign in with an `@insidesuccess.com` Google account, and confirm `/` loads.
- Confirm an unsigned browser session redirects `/` to `/login` and receives `401` from `/api/creatives`.
- Confirm a non-admin Workspace user can view `/` but cannot access `/settings`, `/funnels`, `/phase1`, or provider probe/refresh APIs.
- Trigger the `creative-performance-library-sync` cron job manually and confirm it calls `/api/sync` successfully.

## Known production gaps

- Add the final Render callback URL in Google Cloud after Render gives the app URL: `https://<render-app>.onrender.com/api/auth/callback/google`.
- `data/meta-snapshot.json` is the local file cache. On Render, leave `META_SNAPSHOT_PATH` empty for a hosted demo, or set it to a persistent disk path such as `/var/data/meta-snapshot.json` on a paid service.
- Hyros appointment ranking depends on Hyros returning Facebook ad-level attribution for the sampled Meta ad IDs.
- The app still needs a production Meta system-user token, not a temporary personal token.
