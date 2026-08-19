import Link from "next/link";
import { auth } from "@/auth";
import { Dashboard } from "@/components/dashboard";
import { PageHeader } from "@/components/page-header";
import { phase0 } from "@/config/phase0";
import { isAdminEmail } from "@/lib/auth-access";
import { getMetaSnapshot } from "@/lib/meta-cache";
import { formatCurrency, formatNumber } from "@/lib/ranking";

export const dynamic = "force-dynamic";

async function getLiveDashboard() {
  const { snapshot, health } = await getMetaSnapshot();

  return {
    ok: snapshot !== null,
    spike: snapshot?.spike ?? null,
    creatives: snapshot?.creatives ?? [],
    refreshedAt: snapshot?.refreshedAt ?? null,
    health,
    error: health.refreshError ?? null,
  };
}

export default async function Home() {
  const session = await auth();
  const isAdmin = isAdminEmail(session?.user?.email);
  const live = await getLiveDashboard();
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

  return (
    <main className="page">
      <div className="shell">
        <PageHeader
          eyebrow="Inside Success TV - Live Meta Dashboard"
          title="Creative Performance Library"
          subtitle="Live Meta ad performance across the approved Inside Success TV accounts. Appointment attribution remains flagged until the exact custom conversion or Hyros source is confirmed."
          aside={
            <div className="sync-card">
              <span>Live source</span>
              <strong>
                {live.ok
                  ? live.health.isStale
                    ? "Cached snapshot"
                    : "Cached live data"
                  : "Meta needs attention"}
              </strong>
              {isAdmin ? (
                <Link className="small-card-link" href="/phase1">
                  System checks
                </Link>
              ) : null}
            </div>
          }
        />

        <section className="phase-grid" aria-label="Live Meta summary">
          <div className="phase-card">
            <span>Approved accounts</span>
            <strong>{formatNumber(phase0.adAccounts.length)}</strong>
          </div>
          <div className="phase-card">
            <span>Last 30d spend sample</span>
            <strong>{formatCurrency(totalSpend)}</strong>
          </div>
          <div className="phase-card">
            <span>Rows with previews</span>
            <strong>{formatNumber(previewRows)}</strong>
          </div>
          <div className="phase-card">
            <span>Rows with appointments</span>
            <strong>{formatNumber(appointmentRows)}</strong>
          </div>
        </section>

        <section className="phase-grid" aria-label="Attribution status">
          <div className="phase-card">
            <span>Ranking metric</span>
            <strong>
              {appointmentRows > 0 ? "Cost per appointment" : "Cost per lead (proxy)"}
            </strong>
          </div>
          <div className="phase-card">
            <span>Appointment source</span>
            <strong>{live.spike?.appointmentSource.mode ?? "unknown"}</strong>
          </div>
          <div className="phase-card">
            <span>Custom conversions</span>
            <strong>
              {formatNumber(live.spike?.appointmentSource.customConversionCount ?? 0)}
            </strong>
          </div>
          <div className="phase-card">
            <span>Lead action type</span>
            <strong>{live.spike?.creativeRows[0]?.leadActionType ?? "none"}</strong>
          </div>
        </section>

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
            />
          </>
        ) : (
          <section className="panel">
            <div className="empty-state">
              Live Meta data could not be loaded and no cache exists: {live.error}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
