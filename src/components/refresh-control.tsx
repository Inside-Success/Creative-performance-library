"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { MetaSnapshotHealth } from "@/lib/types";

/**
 * Freshness stamp, manual refresh, and the auto-refresh timer for the live
 * Meta read.
 *
 * "Auto refresh" here means this tab re-running the query on an interval.
 * That has a real cost: every open tab polls independently, and each poll is a
 * full provider re-query against rate limits this project has already tripped.
 *
 * Two guards keep that honest:
 *   - the interval is measured in minutes, never seconds;
 *   - a hidden tab never polls, so a dashboard left open overnight goes quiet
 *     instead of querying Meta until morning.
 *
 * The hosted app also supports a scheduled server-side sync route, so local
 * auto-refresh should stay admin-only.
 */
export function RefreshControl({
  checkedAt,
  autoRefreshMinutes = 0,
  dataHealth,
  canRefresh = false,
}: {
  checkedAt?: string | null;
  /** Minutes between automatic refreshes. 0 or less disables auto-refresh. */
  autoRefreshMinutes?: number;
  dataHealth?: MetaSnapshotHealth;
  canRefresh?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [stamp, setStamp] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(
    dataHealth?.refreshError ?? null,
  );

  // The interval callback closes over stale state, so mirror it into a ref to
  // avoid stacking a second refresh on top of one still in flight.
  const pendingRef = useRef(isPending);

  useEffect(() => {
    pendingRef.current = isPending || isRefreshing;
  }, [isPending, isRefreshing]);

  // Formatted on the client only. The server and the browser can sit in
  // different timezones/locales, and a mismatch here would break hydration.
  useEffect(() => {
    if (!checkedAt) {
      setStamp(null);
      return;
    }

    setStamp(
      new Date(checkedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  }, [checkedAt]);

  useEffect(() => {
    setRefreshError(dataHealth?.refreshError ?? null);
  }, [dataHealth?.refreshError]);

  const refresh = useCallback(async () => {
    if (!canRefresh) {
      return;
    }

    if (pendingRef.current) {
      return;
    }

    setRefreshError(null);
    setIsRefreshing(true);
    pendingRef.current = true;

    try {
      const response = await fetch("/api/meta/refresh", {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(payload?.message ?? `Refresh failed with ${response.status}.`);
      }

      startTransition(() => router.refresh());
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Refresh failed.");
    } finally {
      setIsRefreshing(false);
      pendingRef.current = false;
    }
  }, [canRefresh, router]);

  const busy = isPending || isRefreshing;

  useEffect(() => {
    if (!canRefresh || !Number.isFinite(autoRefreshMinutes) || autoRefreshMinutes <= 0) {
      return;
    }

    const intervalMs = autoRefreshMinutes * 60_000;
    const timer = window.setInterval(() => {
      // A backgrounded tab must not keep querying Meta.
      if (document.visibilityState !== "visible") {
        return;
      }

      refresh();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [autoRefreshMinutes, canRefresh, refresh]);

  return (
    <div className="refresh-control">
      <span className="refresh-stamp">
        {busy ? "Refreshing..." : stamp ? `Data as of ${stamp}` : "Not loaded"}
        {dataHealth?.isStale ? <em className="refresh-stale">stale cache</em> : null}
        {autoRefreshMinutes > 0 ? (
          <em className="refresh-auto">auto every {autoRefreshMinutes}m</em>
        ) : null}
      </span>
      <button
        type="button"
        className="button secondary-button refresh-button"
        onClick={refresh}
        disabled={busy || !canRefresh}
        title={
          !canRefresh
            ? "Only CPL admins can manually refresh provider data."
            : autoRefreshMinutes > 0
              ? `Re-query Meta now. Also refreshes automatically every ${autoRefreshMinutes} minutes while this tab is visible.`
              : "Re-query Meta now. No automatic refresh is configured."
        }
        aria-label={
          canRefresh
            ? "Refresh Meta data"
            : "Only CPL admins can refresh Meta data"
        }
      >
        <span aria-hidden="true" className={busy ? "spinning" : undefined}>
          &#8635;
        </span>
        {busy ? "Refreshing" : "Refresh"}
      </button>
      {!canRefresh ? (
        <span role="status" className="refresh-note">
          Admin refresh only
        </span>
      ) : null}
      {refreshError ? (
        <span role="status" className="refresh-error">
          Refresh failed: {refreshError}
        </span>
      ) : null}
    </div>
  );
}
