import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { metaSpikeRowsToCreatives, runMetaSpike } from "@/lib/meta";
import type {
  MetaDashboardSnapshot,
  MetaSnapshotHealth,
  MetaSnapshotRead,
} from "@/lib/types";

const snapshotVersion = 1;

let refreshInFlight: Promise<MetaDashboardSnapshot> | null = null;

function cacheTtlMinutes() {
  const value = Number(process.env.META_CACHE_TTL_MINUTES ?? 35);
  return Number.isFinite(value) && value > 0 ? value : 35;
}

function cacheFile() {
  return process.env.META_SNAPSHOT_PATH
    ? path.resolve(process.env.META_SNAPSHOT_PATH)
    : path.join(process.cwd(), "data", "meta-snapshot.json");
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

async function readSnapshotFile() {
  try {
    const raw = await readFile(cacheFile(), "utf8");
    const parsed = JSON.parse(raw) as MetaDashboardSnapshot;

    if (parsed.version !== snapshotVersion || !parsed.spike || !parsed.creatives) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function writeSnapshotFile(snapshot: MetaDashboardSnapshot) {
  const file = cacheFile();

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

export async function refreshMetaSnapshot(datePreset = "last_30d") {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
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

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function getMetaSnapshot(options: { forceRefresh?: boolean } = {}) {
  const cached = await readSnapshotFile();
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
    const refreshed = await refreshMetaSnapshot(cached?.datePreset ?? "last_30d");

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
