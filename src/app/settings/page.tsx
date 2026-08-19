import { PageHeader } from "@/components/page-header";
import { phase0 } from "@/config/phase0";
import { thresholdSettings } from "@/lib/sample-data";

export default function SettingsPage() {
  return (
    <main className="page">
      <div className="shell">
        <PageHeader
          eyebrow="CPL Admin"
          title="Settings & Thresholds"
          subtitle="Ranking thresholds and approved Meta scope. Sign-in, editable settings, and database persistence are reserved for the final production phase."
          aside={
            <div className="sync-card">
              <span>Current mode</span>
              <strong>Live Meta read-only</strong>
            </div>
          }
        />

        <section className="settings-grid">
          {thresholdSettings.map((setting) => (
            <article className="setting-card" key={setting.label}>
              <span>{setting.label}</span>
              <strong>{setting.value}</strong>
              <p>{setting.purpose}</p>
              <small>{setting.locked}</small>
            </article>
          ))}
        </section>

        <section className="panel settings-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Approved scope</p>
              <h2>Meta ad accounts</h2>
            </div>
          </div>
          <div className="compact-list">
            {phase0.adAccounts.map((account) => (
              <div className="compact-list-row" key={account.id}>
                <div>
                  <strong>{account.name}</strong>
                  <span>{account.id}</span>
                </div>
                <span className="pill">Approved</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
