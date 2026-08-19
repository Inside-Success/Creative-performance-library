import { PageHeader } from "@/components/page-header";
import { funnelMappings } from "@/lib/sample-data";

export default function FunnelMappingPage() {
  return (
    <main className="page">
      <div className="shell">
        <PageHeader
          eyebrow="CPL Admin"
          title="Funnel Mapping"
          subtitle="Campaign-name keywords map live Meta ads into shows/funnels. Newly observed names are marked for review until the team confirms the naming rule."
          aside={
            <div className="sync-card">
              <span>Mapping source</span>
              <strong>Meta campaign names first</strong>
            </div>
          }
        />

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Lookup table mock</p>
              <h2>Keyword to funnel rules</h2>
            </div>
            <button className="button" type="button" disabled>
              Add keyword later
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th>Mapped Funnel</th>
                  <th>Owner</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {funnelMappings.map((mapping) => (
                  <tr key={mapping.keyword}>
                    <td className="money">{mapping.keyword}</td>
                    <td>
                      <span className="pill">{mapping.funnel}</span>
                    </td>
                    <td>{mapping.owner}</td>
                    <td>
                      <span
                        className={`pill ${
                          mapping.status === "Needs review" ? "paused" : ""
                        }`}
                      >
                        <span className="status-dot" />
                        {mapping.status}
                      </span>
                    </td>
                    <td>{mapping.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="notice-row">
          <div className="notice">
            <h2>What this protects</h2>
            <ul>
              <li>Account and funnel filters stay independent.</li>
              <li>New funnels require an intentional keyword rule.</li>
              <li>Ambiguous campaigns get logged instead of silently misassigned.</li>
            </ul>
          </div>
          <div className="notice">
            <h2>Still reserved for later</h2>
            <ul>
              <li>Editable mapping controls.</li>
              <li>Final naming convention exception approval.</li>
              <li>Hyros fallback decision.</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
