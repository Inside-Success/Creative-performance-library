"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatNumber } from "@/lib/ranking";
import type { MetaSpikeResult } from "@/lib/types";

const statusLabels = {
  not_started: "Not started",
  pass: "Pass",
  partial: "Partial",
  fail: "Fail",
} as const;

type LoadState =
  | { status: "loading"; result: null; error: null }
  | { status: "ready"; result: MetaSpikeResult; error: null }
  | { status: "error"; result: MetaSpikeResult; error: string };

function failedSpikeResult(message: string): MetaSpikeResult {
  return {
    ok: false,
    checkedAt: new Date().toISOString(),
    datePreset: "last_30d",
    checks: [
      {
        name: "Live Meta spike",
        status: "fail",
        detail: message,
      },
    ],
    accountSummaries: [],
    mappingRows: [],
    creativeRows: [],
    observedActionTypes: [],
    observedActionTotals: [],
    customConversions: [],
    appointmentSource: {
      mode: "unconfigured",
      configured: [],
      matched: [],
      rowsWithAppointments: 0,
      customConversionCount: 0,
      candidates: [],
      message:
        "The live check did not complete, so appointment attribution was not evaluated.",
    },
    notes: [
      "The provider check did not complete. Review server logs for the underlying Meta or Hyros response.",
    ],
  };
}

export function SystemChecksClient() {
  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    result: null,
    error: null,
  });

  useEffect(() => {
    let isCurrent = true;

    async function loadLiveChecks() {
      try {
        const response = await fetch("/api/meta/spike", {
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        });
        const payload = (await response.json()) as
          | MetaSpikeResult
          | { message?: string };

        if (!isCurrent) {
          return;
        }

        if (!response.ok || !("checks" in payload)) {
          const message =
            "message" in payload && payload.message
              ? payload.message
              : "Meta spike failed before Meta returned a response.";
          setLoadState({
            status: "error",
            result: failedSpikeResult(message),
            error: message,
          });
          return;
        }

        setLoadState({ status: "ready", result: payload, error: null });
      } catch (error) {
        if (!isCurrent) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Meta spike failed before Meta returned a response.";
        setLoadState({
          status: "error",
          result: failedSpikeResult(message),
          error: message,
        });
      }
    }

    void loadLiveChecks();

    return () => {
      isCurrent = false;
    };
  }, []);

  const result = loadState.result;
  const unresolvedMappings = useMemo(
    () =>
      result
        ? result.mappingRows.filter(
            (row) => row.isLeadScope && row.matchedFunnel === null,
          )
        : [],
    [result],
  );
  const totalSpend = useMemo(
    () =>
      result
        ? result.accountSummaries.reduce(
            (sum, account) => sum + account.totalSpend,
            0,
          )
        : 0,
    [result],
  );

  if (loadState.status === "loading") {
    return (
      <section className="panel settings-panel live-check-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Live network check</p>
            <h2>Running provider checks...</h2>
            <p>
              Meta and Hyros are being queried now. This page is responsive while the
              providers return the latest results.
            </p>
          </div>
          <span className="live-spinner" aria-hidden="true" />
        </div>
        <div className="phase-grid live-placeholder-grid">
          {["Meta accounts", "Campaign insights", "Hyros attribution", "Mappings"].map(
            (label) => (
              <div className="phase-card live-placeholder-card" key={label}>
                <span>{label}</span>
                <strong>Checking...</strong>
              </div>
            ),
          )}
        </div>
      </section>
    );
  }

  if (!result) {
    return null;
  }

  return (
    <>
      {loadState.status === "error" ? (
        <div className="stale-banner">
          <strong>Live check failed:</strong> {loadState.error}
        </div>
      ) : null}

      <section className="phase-grid">
        <div className="phase-card">
          <span>Window</span>
          <strong>{result.datePreset}</strong>
        </div>
        <div className="phase-card">
          <span>Checked</span>
          <strong>{new Date(result.checkedAt).toLocaleString()}</strong>
        </div>
        <div className="phase-card">
          <span>Sample spend</span>
          <strong>{formatCurrency(totalSpend)}</strong>
        </div>
        <div className="phase-card">
          <span>Open mapping gaps</span>
          <strong>{formatNumber(unresolvedMappings.length)}</strong>
        </div>
      </section>

      <section className="test-grid">
        {result.checks.map((check) => (
          <article className="test-card" key={check.name}>
            <span className={`status-chip ${check.status}`}>
              {statusLabels[check.status]}
            </span>
            <h2>{check.name}</h2>
            <p>{check.detail}</p>
          </article>
        ))}
      </section>

      <section className="panel settings-panel">
        <div className="section-heading">
          <div>
            <h2>Account Summary</h2>
            <p>Campaign, insight, creative-preview, and mapping counts.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ad Account</th>
                <th>Campaigns</th>
                <th>Lead Scope</th>
                <th>Insight Rows</th>
                <th>Spend</th>
                <th>Lead Actions</th>
                <th>Appt Actions</th>
                <th>Previews</th>
                <th>Mapped</th>
                <th>Unmapped</th>
              </tr>
            </thead>
            <tbody>
              {result.accountSummaries.map((account) => (
                <tr key={account.accountId}>
                  <td>{account.accountName}</td>
                  <td>{formatNumber(account.campaignCount)}</td>
                  <td>{formatNumber(account.leadScopeCampaignCount)}</td>
                  <td>{formatNumber(account.adInsightCount)}</td>
                  <td className="money">{formatCurrency(account.totalSpend)}</td>
                  <td>{formatNumber(account.adsWithLeads)}</td>
                  <td>{formatNumber(account.adsWithAppointments)}</td>
                  <td>{formatNumber(account.adsWithCreativePreview)}</td>
                  <td>{formatNumber(account.mappedCampaignCount)}</td>
                  <td>{formatNumber(account.unmatchedCampaignCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="notice-row">
        <div className="notice">
          <h2>Top Live Ad Rows</h2>
          {result.creativeRows.length > 0 ? (
            <ul className="plain-list">
              {result.creativeRows.slice(0, 8).map((creative) => (
                <li key={creative.adId}>
                  <strong>{creative.adName}</strong>
                  <span>
                    {creative.accountName} / {creative.campaignName} /{" "}
                    {formatCurrency(creative.spend)} spend / leads{" "}
                    {formatNumber(creative.leads)} / appointments{" "}
                    {formatNumber(creative.appointments)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-copy">No creative rows returned by the live check.</p>
          )}
        </div>

        <div className="notice">
          <h2>Mapping Gaps</h2>
          {unresolvedMappings.length > 0 ? (
            <ul className="plain-list">
              {unresolvedMappings.slice(0, 8).map((row) => (
                <li key={row.campaignId}>
                  <strong>{row.campaignName}</strong>
                  <span>{row.accountName}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-copy">
              No unmapped lead-scope campaigns in this sample window.
            </p>
          )}
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Go/no-go blocker</p>
            <h2>Appointment Attribution</h2>
            <p>{result.appointmentSource.message}</p>
          </div>
          <span
            className={`status-chip ${
              result.appointmentSource.rowsWithAppointments > 0 ? "pass" : "fail"
            }`}
          >
            {result.appointmentSource.rowsWithAppointments > 0
              ? "Resolved"
              : "Unresolved"}
          </span>
        </div>

        <div className="compact-list">
          <div className="compact-list-row">
            <div>
              <strong>Configured source</strong>
              <span>
                {result.appointmentSource.mode}
                {result.appointmentSource.configured.length > 0
                  ? ` - ${result.appointmentSource.configured.join(", ")}`
                  : " - nothing set"}
              </span>
            </div>
            <span className="pill">
              {result.appointmentSource.matched.length > 0
                ? `${result.appointmentSource.matched.length} matched`
                : "0 matched"}
            </span>
          </div>
          <div className="compact-list-row">
            <div>
              <strong>Custom conversions on approved accounts</strong>
              <span>
                A booked-appointment goal would appear here as
                offsite_conversion.custom.&lt;id&gt;
              </span>
            </div>
            <span className="pill">
              {formatNumber(result.appointmentSource.customConversionCount)}
            </span>
          </div>
        </div>

        <div className="section-heading">
          <div>
            <h2>Candidate action types</h2>
            <p>
              Conversion-like action types observed in this window, by volume. Pick the
              one that represents a booked appointment and set it as
              META_APPOINTMENT_ACTION_TYPES - ranking switches to cost per appointment
              automatically. If none of these is a booking, Meta cannot answer the
              question and Hyros becomes the source.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Action type</th>
                <th>Total in window</th>
              </tr>
            </thead>
            <tbody>
              {result.appointmentSource.candidates.map((candidate) => (
                <tr key={candidate.actionType}>
                  <td className="money">{candidate.actionType}</td>
                  <td>{formatNumber(candidate.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="notice-row">
        <div className="notice">
          <h2>Observed Meta Action Types</h2>
          <p className="muted-copy">
            These determine whether appointment metrics can be derived directly from
            Meta or need a Hyros/custom conversion fallback.
          </p>
          <div className="chip-list">
            {result.observedActionTypes.slice(0, 18).map((actionType) => (
              <span className="pill" key={actionType}>
                {actionType}
              </span>
            ))}
          </div>
        </div>

        <div className="notice">
          <h2>Hosted V1 Notes</h2>
          <ul>
            {result.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
            <li>
              Workspace SSO, Hyros appointment attribution, admin/viewer access,
              and Render cron trigger plumbing are ready for deployment.
            </li>
            <li>
              A database-backed datastore is still a later production upgrade.
            </li>
          </ul>
          <Link className="small-card-link" href="/api/meta/spike">
            Open latest live JSON
          </Link>
        </div>
      </section>
    </>
  );
}
