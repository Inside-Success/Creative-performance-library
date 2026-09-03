import Link from "next/link";
import { auth } from "@/auth";
import { Dashboard } from "@/components/dashboard";
import { PageHeader } from "@/components/page-header";
import { phase0 } from "@/config/phase0";
import { isAdminEmail } from "@/lib/auth-access";
import {
  DATE_RANGE_PARAM,
  dateRangeLabel,
  resolveDatePreset,
} from "@/lib/date-range";
import { getMetaSnapshot } from "@/lib/meta-cache";
import {
  countProxyRows,
  formatCurrency,
  formatNumber,
  resolveRankingMode,
} from "@/lib/ranking";
import type { AttributionContext } from "@/lib/types";

export const dynamic = "force-dynamic";

async function getLiveDashboard(datePreset: string) {
  const { snapshot, health } = await getMetaSnapshot({ datePreset });

  return {
    ok: snapshot !== null,
    spike: snapshot?.spike ?? null,
    creatives: snapshot?.creatives ?? [],
    refreshedAt: snapshot?.refreshedAt ?? null,
    datePreset: snapshot?.datePreset ?? datePreset,
    health,
    error: health.refreshError ?? null,
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rangeParam = params[DATE_RANGE_PARAM];
  const datePreset = resolveDatePreset(
    Array.isArray(rangeParam) ? rangeParam[0] : rangeParam,
  );

  const session = await auth();
  const isAdmin = isAdminEmail(session?.user?.email);
  const live = await getLiveDashboard(datePreset);

  const totalSpend =
    live.spike?.accountSummaries.reduce((sum, account) => sum + account.totalSpend, 0) ??
    0;
  const appointmentRows =
    live.spike?.accountSummaries.reduce(
      (sum, account) => sum + account.adsWithAppointments,
      0,
    ) ?? 0;
  const previewRows =
    live.spike?.accountSummaries.reduce(
      (sum, account) => sum + account.adsWithCreativePreview,
      0,
    ) ?? 0;

  // SINGLE source of truth for the ranking metric. The table header reads the
  // same value via the `rankingMode` prop, so the two can no longer contradict
  // each other the way the old independent derivations did.
  const rankingMode = resolveRankingMode(live.creatives);
  const proxyRowCount = countProxyRows(live.creatives);

  const source = live.spike?.appointmentSource;
  const attribution: AttributionContext = {
    metaDatePreset: live.datePreset,
    appointmentSource: source?.mode ?? "unconfigured",
    hyrosField: source?.hyrosAppointmentField,
    hyrosAttributionModel: source?.hyrosAttributionModel,
    hyrosWindowStart: source?.hyrosWindowStart,
    hyrosWindowEnd: source?.hyrosWindowEnd,
  };

  return (
    <main className="page">
      <div className="shell">
        <PageHeader
          eyebrow="Inside Success TV - Live Meta Dashboard"
          title="Creative Performance Library"
          subtitle="Live Meta ad performance across the approved Inside Success TV accounts, ranked on appointment volume and cost per appointment."
          aside={
            <div className="sync-card">
              <span>{dateRangeLabel(live.datePreset)} spend</span>
              <strong>{formatCurrency(totalSpend)}</strong>
              <span className="sync-card-note">
                {live.ok
                  ? live.health.isStale
                    ? "Cached snapshot (stale)"
                    : "Cached live data"
                  : "Meta needs attention"}
              </span>
            </div>
          }
        />

        {live.ok ? (
          <>
            {live.health.isStale ? (
              <div className="stale-banner">
                <strong>Showing stale data.</strong> {live.health.message}
                {live.health.refreshError ? ` Last refresh error: ${live.health.refreshError}` : ""}
              </div>
            ) : null}
            <Dashboard
              creatives={live.creatives}
              dataMode="live"
              checkedAt={live.refreshedAt}
              autoRefreshMinutes={phase0.sync.autoRefreshMinutes}
              dataHealth={live.health}
              canRefresh={isAdmin}
              rankingMode={rankingMode}
              proxyRowCount={proxyRowCount}
              attribution={attribution}
              datePreset={live.datePreset}
            />
          </>
        ) : (
          <section className="panel">
            <div className="empty-state">
              Live Meta data could not be loaded and no cache exists: {live.error}
            </div>
          </section>
        )}

        {/*
          Everything below is build/attribution telemetry, not performance.
          Collapsed by default so the default view is a clean performance
          dashboard. Native <details> keeps it server-rendered with no JS.
        */}
        <details className="diagnostics">
          <summary className="diagnostics-summary">
            <span>Diagnostics</span>
            <em>Data coverage, attribution mechanics, and system checks</em>
          </summary>

          <div className="diagnostics-body">
            <section className="phase-grid" aria-label="Data coverage">
              <div className="phase-card">
                <span>Approved accounts</span>
                <strong>{formatNumber(phase0.adAccounts.length)}</strong>
              </div>
              <div className="phase-card">
                <span>{dateRangeLabel(live.datePreset)} spend</span>
                <strong>{formatCurrency(totalSpend)}</strong>
              </div>
              <div className="phase-card">
                <span>Rows with previews</span>
                <strong>{formatNumber(previewRows)}</strong>
              </div>
              <div className="phase-card">
                <span>Rows with appointment data</span>
                <strong>{formatNumber(appointmentRows)}</strong>
                <small>
                  Rows a provider answered for, including confirmed zeros.
                </small>
              </div>
            </section>

            <section className="phase-grid" aria-label="Attribution mechanics">
              <div className="phase-card">
                <span>Ranking metric</span>
                <strong>
                  {rankingMode === "appointment"
                    ? "Cost per appointment"
                    : "Cost per lead (proxy)"}
                </strong>
                <small>
                  {proxyRowCount > 0
                    ? `${formatNumber(proxyRowCount)} row(s) still on the lead proxy.`
                    : "Every row ranked on its own appointment data."}
                </small>
              </div>
              <div className="phase-card">
                <span>Appointment source</span>
                <strong>{attribution.appointmentSource}</strong>
                {attribution.hyrosField ? (
                  <small>{`hyros:${attribution.hyrosField}`}</small>
                ) : null}
              </div>
              <div className="phase-card">
                <span>Custom conversions</span>
                <strong>{formatNumber(source?.customConversionCount ?? 0)}</strong>
                <small>
                  Zero on both accounts as of the 2026-08-18 verification.
                </small>
              </div>
              <div className="phase-card">
                <span>Lead action type</span>
                <strong>{live.spike?.creativeRows[0]?.leadActionType ?? "none"}</strong>
                <small>Leads are a displayed column, not the ranking key.</small>
              </div>
            </section>

            {source ? (
              <div className="diagnostics-note">
                <strong>Attribution basis.</strong> {source.message}
                {source.matched.length > 0 ? (
                  <> Matched action type(s): <code>{source.matched.join(", ")}</code>.</>
                ) : null}
              </div>
            ) : null}

            <div className="diagnostics-note">
              <strong>Why Meta cannot supply appointments.</strong> Verified
              2026-08-18 against both approved accounts: zero custom conversions
              are defined and no observed Meta action type represents a booked
              appointment. Appointments therefore come from Hyros. If a custom
              conversion is created in Events Manager, set{" "}
              <code>META_APPOINTMENT_ACTION_TYPES</code> to the exact{" "}
              <code>offsite_conversion.custom.&lt;id&gt;</code> string and the
              source switches with no code change.
            </div>

            {isAdmin ? (
              <div className="diagnostics-actions">
                <Link className="button secondary-button" href="/phase1">
                  Open System Checks
                </Link>
                <span className="diagnostics-hint">
                  Runs a full live Meta spike (~16-20 Graph calls, 20-40s) and
                  bypasses the snapshot cache. It no longer runs on page load -
                  you have to start it.
                </span>
              </div>
            ) : null}
          </div>
        </details>
      </div>
    </main>
  );
}
