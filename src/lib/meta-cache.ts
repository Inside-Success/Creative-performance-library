import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_DATE_PRESET, resolveDatePreset } from "@/lib/date-range";
import { metaSpikeRowsToCreatives, runMetaSpike } from "@/lib/meta";
import type {
  MetaDashboardSnapshot,
  MetaSnapshotHealth,
  MetaSnapshotRead,
} from "@/lib/types";

const snapshotVersion = 1;

/**
 * One in-flight refresh PER DATE PRESET. A single shared promise would have
 * made a `last_7d` request return the `last_30d` snapshot whenever the two
 * overlapped.
 */
const refreshInFlight = new Map<string, Promise<MetaDashboardSnapshot>>();

function cacheTtlMinutes() {
  const value = Number(process.env.META_CACHE_TTL_MINUTES ?? 35);
  return Number.isFinite(value) && value > 0 ? value : 35;
}

/**
 * Each date range gets its own snapshot file, so switching range does not
 * evict the range you were just looking at.
 *
 * The default preset keeps the original bare filename
 * (`data/meta-snapshot.json`, or whatever `META_SNAPSHOT_PATH` points at) so
 * existing deployments, the Render disk path and `npm run sync` keep working
 * unchanged. Other presets get a suffixed sibling next to it.
 */
function cacheFile(datePreset: string) {
  const base = process.env.META_SNAPSHOT_PATH
    ? path.resolve(process.env.META_SNAPSHOT_PATH)
    : path.join(process.cwd(), "data", "meta-snapshot.json");

  if (datePreset === DEFAULT_DATE_PRESET) {
    return base;
  }

  const extension = path.extname(base);
  const withoutExtension = extension ? base.slice(0, -extension.length) : base;

  return `${withoutExtension}.${datePreset}${extension || ".json"}`;
}

function ageMinutes(refreshedAt: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(refreshedAt).getTime()) / 60_000));
}

function health(input: {
  source: MetaSnapshotHealth["source"];
  cacheStatus: MetaSnapshotHealth["cacheStatus"];
  refreshedAt?: string;
  message: string;
  refreshError?: string;
}): MetaSnapshotHealth {
  const age = input.refreshedAt ? ageMinutes(input.refreshedAt) : null;

  return {
    source: input.source,
    cacheStatus: input.cacheStatus,
    isStale:
      input.cacheStatus === "stale" || input.cacheStatus === "refresh-failed",
    ageMinutes: age,
    message: input.message,
    refreshError: input.refreshError,
  };
}

async function readSnapshotFile(datePreset: string) {
  try {
    const raw = await readFile(cacheFile(datePreset), "utf8");
    const parsed = JSON.parse(raw) as MetaDashboardSnapshot;

    if (parsed.version !== snapshotVersion || !parsed.spike || !parsed.creatives) {
      return null;
    }

    // A snapshot written for a different range must never be served as this
    // one - it would show 90 days of spend under a "Last 7 days" label.
    if (parsed.datePreset && parsed.datePreset !== datePreset) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function writeSnapshotFile(snapshot: MetaDashboardSnapshot) {
  const file = cacheFile(snapshot.datePreset);

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

export async function refreshMetaSnapshot(requestedPreset = DEFAULT_DATE_PRESET) {
  const datePreset = resolveDatePreset(requestedPreset);
  const existing = refreshInFlight.get(datePreset);

  if (existing) {
    return existing;
  }

  const pending = (async () => {
    const spike = await runMetaSpike(datePreset);
    const snapshot = {
      version: snapshotVersion,
      refreshedAt: new Date().toISOString(),
      datePreset,
      spike,
      creatives: metaSpikeRowsToCreatives(spike.creativeRows),
    } satisfies MetaDashboardSnapshot;

    await writeSnapshotFile(snapshot);
    return snapshot;
  })();

  refreshInFlight.set(datePreset, pending);

  try {
    return await pending;
  } finally {
    refreshInFlight.delete(datePreset);
  }
}

export async function getMetaSnapshot(
  options: { forceRefresh?: boolean; datePreset?: string } = {},
) {
  const datePreset = resolveDatePreset(options.datePreset);
  const cached = await readSnapshotFile(datePreset);
  const ttl = cacheTtlMinutes();
  const cachedAge = cached ? ageMinutes(cached.refreshedAt) : null;
  const isFresh = cachedAge !== null && cachedAge <= ttl;

  if (cached && isFresh && !options.forceRefresh) {
    return {
      snapshot: cached,
      health: health({
        source: "cache",
        cacheStatus: "fresh",
        refreshedAt: cached.refreshedAt,
        message: `Serving cached Meta data refreshed ${cachedAge} minute(s) ago.`,
      }),
    } satisfies MetaSnapshotRead;
  }

  try {
    const refreshed = await refreshMetaSnapshot(datePreset);

    return {
      snapshot: refreshed,
      health: health({
        source: "live",
        cacheStatus: "fresh",
        refreshedAt: refreshed.refreshedAt,
        message: "Meta data refreshed successfully.",
      }),
    } satisfies MetaSnapshotRead;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Meta refresh failed before Meta returned a response.";

    if (cached) {
      return {
        snapshot: cached,
        health: health({
          source: "cache",
          cacheStatus: "refresh-failed",
          refreshedAt: cached.refreshedAt,
          message: "Showing the last successful Meta snapshot because refresh failed.",
          refreshError: message,
        }),
      } satisfies MetaSnapshotRead;
    }

    return {
      snapshot: null,
      health: health({
        source: "live",
        cacheStatus: "missing",
        message,
        refreshError: message,
      }),
    } satisfies MetaSnapshotRead;
  }
}
