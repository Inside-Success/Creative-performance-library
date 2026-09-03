"use client";

import { useMemo, useState } from "react";
import { DateRangeSelect } from "@/components/date-range-select";
import { RefreshControl } from "@/components/refresh-control";
import { phase0 } from "@/config/phase0";
import { dateRangeLabel } from "@/lib/date-range";
import { funnels } from "@/lib/sample-data";
import { formatCurrency, formatNumber, sortCreativesForBucket } from "@/lib/ranking";
import type {
  AttributionContext,
  CreativeBucket,
  CreativeMetric,
  CreativeStatus,
  MetaSnapshotHealth,
  RankingMode,
} from "@/lib/types";

const pageSize = 12;

const bucketLabels: Record<CreativeBucket, string> = {
  winning: "Winners",
  losing: "Watch / Cut",
  // Renamed from "Needs Attribution", which read as "this row has an
  // attribution bug". The bucket actually means "not enough spend or signal
  // to call yet". Avoids reusing "Watch" from the losing label above. The
  // `notEnoughData` key is unchanged.
  notEnoughData: "Too Early to Call",
};

const bucketHelpByMode: Record<RankingMode, Record<CreativeBucket, string>> = {
  appointment: {
    winning: `Enough appointments to be real (${phase0.thresholds.winnerAppointmentThreshold}+) AND cost per appointment at or under $${phase0.thresholds.targetCpaBenchmark}. Ordered cheapest booking first.`,
    losing: `Spent over $${phase0.thresholds.minSpend} and booked nothing, or booked at a cost per appointment above $${phase0.thresholds.targetCpaBenchmark}. High volume at a bad cost lands here too.`,
    notEnoughData: `Under $${phase0.thresholds.minSpend} spend, or booking at an acceptable cost but not yet at ${phase0.thresholds.winnerAppointmentThreshold} appointments. Not a verdict - just not enough yet.`,
  },
  "lead-proxy": {
    winning:
      "Ranked by lowest cost per LEAD, not cost per appointment - no appointment source resolved for any row. A cheap lead is not a booked appointment; treat this order as provisional.",
    losing:
      "High-spend ads with no leads, very low lead volume, or weak lead efficiency. Judged on leads, not appointments.",
    notEnoughData:
      "Below the minimum spend threshold, or without enough lead signal to call.",
  },
};

const statusLabels: Record<CreativeStatus | "All", string> = {
  All: "All statuses",
  Delivering: "Delivering",
  Paused: "Paused",
  Deleted: "Deleted",
};

function previewInitials(text: string) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function CreativePreview({ creative }: { creative: CreativeMetric }) {
  const [failed, setFailed] = useState(false);

  if (creative.previewUrl && !failed) {
    return (
      <a
        href={creative.previewUrl}
        target="_blank"
        rel="noreferrer"
        title="Open full-size creative"
      >
        <img
          className="thumb thumb-image"
          src={creative.previewUrl}
          alt={`Creative preview for ${creative.title}`}
          onError={() => setFailed(true)}
        />
      </a>
    );
  }

  return (
    <div className="thumb thumb-empty">
      <strong>{previewInitials(creative.title)}</strong>
      <span>No Meta preview</span>
    </div>
  );
}

/**
 * Names the provider behind a row's appointment number, so a Hyros-attributed
 * count is never read as a Meta-native one.
 */
function AppointmentSourceBadge({
  creative,
  attribution,
}: {
  creative: CreativeMetric;
  attribution: AttributionContext;
}) {
  if (creative.appointments === null) {
    return (
      <span
        className="src-badge src-none"
        title="No appointment source answered for this ad, so it is ranked on the lead proxy. This is NOT the same as a confirmed zero."
      >
        no source
      </span>
    );
  }

  if (creative.appointmentSource === "hyros") {
    return (
      <span
        className="src-badge src-hyros"
        title={`${creative.appointmentSourceDetail ?? "hyros"} - ${attribution.hyrosAttributionModel ?? "last_click"} attribution, ${attribution.hyrosWindowStart ?? "?"} to ${attribution.hyrosWindowEnd ?? "?"} UTC. Not a Meta-reported number.`}
      >
        Hyros
      </span>
    );
  }

  if (creative.appointmentSource === "meta") {
    return (
      <span
        className="src-badge src-meta"
        title={`Meta action type ${creative.appointmentSourceDetail ?? "(configured)"}.`}
      >
        Meta
      </span>
    );
  }

  return null;
}

function CreativeTable({
  bucket,
  creatives,
  dataMode,
  page,
  rankingMode,
  attribution,
}: {
  bucket: CreativeBucket;
  creatives: CreativeMetric[];
  dataMode: "sample" | "live";
  page: number;
  rankingMode: RankingMode;
  attribution: AttributionContext;
}) {
  const sorted = sortCreativesForBucket(bucket, creatives, rankingMode);
  const start = (page - 1) * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);
  const isProxyRanked = rankingMode === "lead-proxy";

  if (pageRows.length === 0) {
    return (
      <div className="empty-state">
        No creatives match this bucket and filter combination.
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Creative</th>
            <th>Funnel</th>
            <th>Ad Account</th>
            <th>Delivery</th>
            <th>Spend</th>
            <th title="Shown for context. Leads are not the ranking key.">Leads</th>
            <th
              title={
                isProxyRanked
                  ? "Ranking metric while no appointment source has resolved."
                  : "Context only - the ranking runs on cost per appointment."
              }
            >
              CPL{isProxyRanked ? " (ranking metric)" : ""}
            </th>
            <th title="Appointment volume - one of the two ranking axes.">Appts</th>
            <th
              title={
                isProxyRanked
                  ? "No appointment source resolved for these rows."
                  : "Ranking metric: appointment volume, then cost per appointment."
              }
            >
              Cost / Appt{isProxyRanked ? "" : " (ranking metric)"}
            </th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((creative, index) => (
            <tr key={creative.id}>
              <td>
                <span className="rank">{start + index + 1}</span>
              </td>
              <td>
                <div className="creative">
                  <CreativePreview creative={creative} />
                  <div>
                    <div className="ad-title">{creative.title}</div>
                    <div className="ad-link">
                      {creative.previewUrl ? "Meta thumbnail" : "Preview unavailable"} -{" "}
                      {dataMode === "live" ? "live Meta row" : "sample row"}
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <span className="pill">{creative.funnel}</span>
              </td>
              <td>{creative.adAccount}</td>
              <td>
                <span
                  className={`pill ${creative.status === "Paused" ? "paused" : ""}`}
                  title={
                    creative.status === "Delivering"
                      ? "Meta says this ad is active or eligible to deliver."
                      : "Meta says this ad is currently paused, archived, inactive, or not eligible to deliver."
                  }
                >
                  <span className="status-dot" />
                  {creative.status}
                </span>
              </td>
              <td className="money">{formatCurrency(creative.spend)}</td>
              <td>{formatNumber(creative.leads)}</td>
              <td className={`money ${isProxyRanked ? (bucket === "winning" ? "good" : bucket === "losing" ? "bad" : "neutral") : ""}`}>
                {formatCurrency(creative.costPerLead)}
              </td>
              <td className="money">
                <span className="appt-cell">
                  {formatNumber(creative.appointments)}
                  <AppointmentSourceBadge
                    creative={creative}
                    attribution={attribution}
                  />
                </span>
              </td>
              <td
                className={`money ${
                  isProxyRanked
                    ? "neutral"
                    : bucket === "winning"
                      ? "good"
                      : bucket === "losing"
                        ? "bad"
                        : "neutral"
                }`}
              >
                {formatCurrency(creative.costPerAppointment)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Dashboard({
  creatives,
  dataMode = "sample",
  checkedAt,
  autoRefreshMinutes = 0,
  dataHealth,
  canRefresh = false,
  rankingMode = "appointment",
  proxyRowCount = 0,
  attribution,
  datePreset,
}: {
  creatives: CreativeMetric[];
  dataMode?: "sample" | "live";
  /** ISO timestamp of the Meta read backing these rows. */
  checkedAt?: string | null;
  autoRefreshMinutes?: number;
  dataHealth?: MetaSnapshotHealth;
  canRefresh?: boolean;
  /**
   * The metric the whole view ranks on. Passed in from `resolveRankingMode`
   * rather than re-derived here - deriving it independently is what let the
   * page header and this table's column header disagree.
   */
  rankingMode?: RankingMode;
  /** Rows with no appointment source, still ordered on the lead proxy. */
  proxyRowCount?: number;
  attribution?: AttributionContext;
  datePreset?: string;
}) {
  const [bucket, setBucket] = useState<CreativeBucket>("winning");
  const [funnel, setFunnel] = useState("All Offers");
  const [account, setAccount] = useState("All Accounts");
  const [status, setStatus] = useState<CreativeStatus | "All">("All");
  const [page, setPage] = useState(1);

  const resolvedAttribution: AttributionContext = attribution ?? {
    metaDatePreset: datePreset ?? "last_30d",
    appointmentSource: "unconfigured",
  };

  const filteredCreatives = useMemo(() => {
    return creatives.filter((creative) => {
      const funnelMatch = funnel === "All Offers" || creative.funnel === funnel;
      const accountMatch = account === "All Accounts" || creative.adAccount === account;
      const statusMatch = status === "All" || creative.status === status;

      return funnelMatch && accountMatch && statusMatch;
    });
  }, [account, creatives, funnel, status]);

  const bucketCounts = useMemo(() => {
    return {
      winning: filteredCreatives.filter((creative) => creative.bucket === "winning")
        .length,
      losing: filteredCreatives.filter((creative) => creative.bucket === "losing").length,
      notEnoughData: filteredCreatives.filter(
        (creative) => creative.bucket === "notEnoughData",
      ).length,
    } satisfies Record<CreativeBucket, number>;
  }, [filteredCreatives]);

  const activeBucketRows = useMemo(
    () => sortCreativesForBucket(bucket, filteredCreatives, rankingMode),
    [bucket, filteredCreatives, rankingMode],
  );

  const pageCount = Math.max(1, Math.ceil(activeBucketRows.length / pageSize));
  const pageNumbers = useMemo(
    () => Array.from({ length: pageCount }, (_, index) => index + 1),
    [pageCount],
  );
  const statusCounts = useMemo(() => {
    return {
      Delivering: creatives.filter((creative) => creative.status === "Delivering").length,
      Paused: creatives.filter((creative) => creative.status === "Paused").length,
      Deleted: creatives.filter((creative) => creative.status === "Deleted").length,
    } satisfies Record<CreativeStatus, number>;
  }, [creatives]);

  function resetFilters() {
    setFunnel("All Offers");
    setAccount("All Accounts");
    setStatus("All");
    setBucket("winning");
    setPage(1);
  }

  function goToPage(nextPage: number) {
    setPage(Math.min(Math.max(nextPage, 1), pageCount));
  }

  return (
    <section className="panel">
      <div className="dashboard-mode">
        <span className={`status-chip ${dataMode === "live" ? "pass" : "partial"}`}>
          {dataMode === "live" ? "Live Meta data" : "Sample dashboard data"}
        </span>
        <span className="status-chip neutral">
          {rankingMode === "appointment"
            ? "Ranked on cost per appointment"
            : "Ranked on cost per lead (proxy)"}
        </span>
      </div>

      <div className="filters">
        {datePreset ? <DateRangeSelect value={datePreset} /> : null}
        <div className="field">
          <label htmlFor="funnel">Funnel / Offer</label>
          <select
            id="funnel"
            value={funnel}
            onChange={(event) => {
              setFunnel(event.target.value);
              setPage(1);
            }}
          >
            {funnels.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="account">Ad Account</label>
          <select
            id="account"
            value={account}
            onChange={(event) => {
              setAccount(event.target.value);
              setPage(1);
            }}
          >
            <option>All Accounts</option>
            {phase0.adAccounts.map((item) => (
              <option key={item.id}>{item.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="status">Delivery Status</label>
          <select
            id="status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as CreativeStatus | "All");
              setPage(1);
            }}
          >
            {(Object.keys(statusLabels) as Array<CreativeStatus | "All">).map((item) => (
              <option key={item} value={item}>
                {statusLabels[item]}
              </option>
            ))}
          </select>
        </div>
        <button className="button secondary-button" onClick={resetFilters}>
          Clear
        </button>
      </div>

      <div className="dashboard-stats">
        <div>
          <span>Delivering</span>
          <strong>{formatNumber(statusCounts.Delivering)}</strong>
        </div>
        <div>
          <span>Paused</span>
          <strong>{formatNumber(statusCounts.Paused)}</strong>
        </div>
        <div>
          <span>Deleted / Archived</span>
          <strong>{formatNumber(statusCounts.Deleted)}</strong>
        </div>
      </div>

      <div className="tabs-row">
        <div className="tabs" aria-label="Creative buckets">
          {(Object.keys(bucketLabels) as CreativeBucket[]).map((item) => (
            <button
              key={item}
              className={`tab ${bucket === item ? "active" : ""}`}
              onClick={() => {
                setBucket(item);
                setPage(1);
              }}
            >
              {bucketLabels[item]} ({bucketCounts[item]})
            </button>
          ))}
        </div>
        <RefreshControl
          checkedAt={checkedAt}
          autoRefreshMinutes={autoRefreshMinutes}
          dataHealth={dataHealth}
          canRefresh={canRefresh}
          datePreset={datePreset}
        />
      </div>

      <div className="bucket-note">
        <strong>{bucketLabels[bucket]}:</strong> {bucketHelpByMode[rankingMode][bucket]}{" "}
        Showing {formatNumber(activeBucketRows.length)} rows.
      </div>

      {/*
        Standing answer to "why does this ad have spend but no appointments?".
        Meta's spend window and Hyros's appointment window are NOT the same
        window, and last-click attribution routes a booking to the last ad
        clicked - so a top-of-funnel ad can legitimately show spend and zero
        appointments. Stated here so it stops being re-investigated.
      */}
      <div className="attribution-note">
        <div>
          <strong>Spend</strong> is Meta, {dateRangeLabel(resolvedAttribution.metaDatePreset)}
          {" "}(ad account timezone, excludes today).
        </div>
        {resolvedAttribution.hyrosField ? (
          <div>
            <strong>Appointments</strong> are Hyros{" "}
            <code>{resolvedAttribution.hyrosField}</code>,{" "}
            {resolvedAttribution.hyrosAttributionModel ?? "last_click"} attribution,{" "}
            {resolvedAttribution.hyrosWindowStart ?? "?"} to{" "}
            {resolvedAttribution.hyrosWindowEnd ?? "?"} UTC (includes today).{" "}
            <em>
              The two windows differ, and last-click credits the booking to the
              last ad clicked - so spend with zero appointments can be correct
              rather than a bug.
            </em>
          </div>
        ) : (
          <div>
            <strong>Appointments</strong> have no resolved source. Meta cannot
            supply them for these accounts (verified 2026-08-18: zero custom
            conversions, no booking action type), so rows fall back to the lead
            proxy.
          </div>
        )}
        {proxyRowCount > 0 && rankingMode === "appointment" ? (
          <div className="attribution-warn">
            {formatNumber(proxyRowCount)} row(s) had no appointment source and
            are ordered on the lead proxy. A confirmed zero is ranked; an
            unanswered row is not the same thing.
          </div>
        ) : null}
      </div>

      <CreativeTable
        bucket={bucket}
        creatives={filteredCreatives}
        dataMode={dataMode}
        page={page}
        rankingMode={rankingMode}
        attribution={resolvedAttribution}
      />

      <div className="pagination">
        <button
          className="button secondary-button"
          disabled={page === 1}
          onClick={() => goToPage(page - 1)}
        >
          Previous
        </button>
        <div className="page-jump" aria-label="Jump to page">
          {pageNumbers.map((pageNumber) => (
            <button
              key={pageNumber}
              className={`page-button ${page === pageNumber ? "active" : ""}`}
              aria-current={page === pageNumber ? "page" : undefined}
              onClick={() => goToPage(pageNumber)}
            >
              {pageNumber}
            </button>
          ))}
        </div>
        <span>
          Page {page} of {pageCount} - {formatNumber(activeBucketRows.length)} rows
        </span>
        <button
          className="button secondary-button"
          disabled={page === pageCount}
          onClick={() => goToPage(page + 1)}
        >
          Next
        </button>
        <button
          className="button secondary-button"
          disabled={page === pageCount}
          onClick={() => goToPage(pageCount)}
        >
          Last
        </button>
      </div>
    </section>
  );
}
