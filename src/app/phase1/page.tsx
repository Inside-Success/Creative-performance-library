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
          subtitle="Live provider checks across the two approved ad accounts. The page opens immediately, then waits here while Meta and Hyros return the latest network results."
          aside={
            <div className="sync-card">
              <span>Meta spike</span>
              <strong>Running live checks</strong>
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
