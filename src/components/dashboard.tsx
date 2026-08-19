"use client";

import { useMemo, useState } from "react";
import { RefreshControl } from "@/components/refresh-control";
import { phase0 } from "@/config/phase0";
import { funnels } from "@/lib/sample-data";
import { formatCurrency, formatNumber, sortCreativesForBucket } from "@/lib/ranking";
import type {
  CreativeBucket,
  CreativeMetric,
  CreativeStatus,
  MetaSnapshotHealth,
} from "@/lib/types";

const pageSize = 12;

const bucketLabels: Record<CreativeBucket, string> = {
  winning: "Winners",
  losing: "Watch / Cut",
  notEnoughData: "Needs Attribution",
};

const bucketHelpByBasis: Record<"appointment" | "proxy", Record<CreativeBucket, string>> = {
  appointment: {
    winning: "Winners ranked by lowest cost per appointment.",
    losing: "Ads with meaningful spend and no appointments, or low volume at high CPA.",
    notEnoughData: "Rows below the minimum spend threshold or without enough signal to call.",
  },
  proxy: {
    winning:
      "Ranked by lowest cost per LEAD, not cost per appointment. A cheap lead is not a booked appointment - treat this order as provisional.",
    losing:
      "High-spend ads with no leads, very low lead volume, or weak lead efficiency. Judged on leads, not appointments.",
    notEnoughData:
      "Rows below the minimum spend threshold or without enough lead signal to call.",
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

function CreativeTable({
  bucket,
  creatives,
  dataMode,
  page,
  isProxyRanked,
}: {
  bucket: CreativeBucket;
  creatives: CreativeMetric[];
  dataMode: "sample" | "live";
  page: number;
  isProxyRanked: boolean;
}) {
  const sorted = sortCreativesForBucket(bucket, creatives);
  const start = (page - 1) * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

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
            <th>Leads</th>
            <th title={isProxyRanked ? "Ranking metric while appointments are unavailable." : undefined}>
              CPL{isProxyRanked ? " (ranking metric)" : ""}
            </th>
            <th>Appts</th>
            <th>Cost / Appt</th>
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
              <td
                className={`money ${
                  !isProxyRanked
                    ? ""
                    : bucket === "winning"
                      ? "good"
                      : bucket === "losing"
                        ? "bad"
                        : "neutral"
                }`}
              >
                {formatCurrency(creative.costPerLead)}
              </td>
              <td className="money">{formatNumber(creative.appointments)}</td>
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
}: {
  creatives: CreativeMetric[];
  dataMode?: "sample" | "live";
  /** ISO timestamp of the Meta read backing these rows. */
  checkedAt?: string | null;
  autoRefreshMinutes?: number;
  dataHealth?: MetaSnapshotHealth;
  canRefresh?: boolean;
}) {
  const [bucket, setBucket] = useState<CreativeBucket>("winning");
  const [funnel, setFunnel] = useState("All Offers");
  const [account, setAccount] = useState("All Accounts");
  const [status, setStatus] = useState<CreativeStatus | "All">("All");
  const [page, setPage] = useState(1);

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
    () => sortCreativesForBucket(bucket, filteredCreatives),
    [bucket, filteredCreatives],
  );

  // A single row ranked on the proxy is enough to make the whole view provisional.
  const isProxyRanked = useMemo(
    () => creatives.some((creative) => creative.attributionBasis === "lead-proxy"),
    [creatives],
  );
  const basisKey = isProxyRanked ? "proxy" : "appointment";
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
      </div>

      <div className="filters">
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
        />
      </div>

      <div className="bucket-note">
        <strong>{bucketLabels[bucket]}:</strong> {bucketHelpByBasis[basisKey][bucket]}{" "}
        Showing {formatNumber(activeBucketRows.length)} rows.
      </div>

      <CreativeTable
        bucket={bucket}
        creatives={filteredCreatives}
        dataMode={dataMode}
        page={page}
        isProxyRanked={isProxyRanked}
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
