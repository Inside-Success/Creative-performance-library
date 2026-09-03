import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SystemChecksClient } from "./system-checks-client";

export const dynamic = "force-dynamic";

export default function Phase1Page() {
  return (
    <main className="page">
      <div className="shell">
        <PageHeader
          eyebrow="Technical Validation"
          title="System Checks"
          subtitle="Live provider checks across the two approved ad accounts. Nothing is queried until you expand the section below - the check bypasses the snapshot cache and re-queries Meta directly."
          aside={
            <div className="sync-card">
              <span>Meta spike</span>
              <strong>Idle until opened</strong>
              <Link className="small-card-link" href="/api/meta/spike">
                View live JSON
              </Link>
            </div>
          }
        />

        <SystemChecksClient />
      </div>
    </main>
  );
}
