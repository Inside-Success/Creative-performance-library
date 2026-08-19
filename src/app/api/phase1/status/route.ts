import { NextResponse } from "next/server";
import { phase0 } from "@/config/phase0";

export async function GET() {
  return NextResponse.json({
    phase: "Hosted V1 - System Checks",
    appState: "workspace-sso-and-hyros-attribution-ready",
    liveMetaData: true,
    realGoogleSso: true,
    safeToDemoWithSampleData: true,
    decisions: phase0,
    unlockOrder: [
      "Temporary Meta token added to local .env.local",
      "Run /api/meta/probe against both approved ad accounts",
      "Run /api/meta/spike for campaign, insights, creative, and mapping validation",
      "Validate campaign objective and appointment-goal filtering",
      "Validate creative preview/thumbnail extraction",
      "Validate campaign-name-to-funnel mapping",
      "Confirm Hyros qualified calls as the appointment source",
      "Wire Google Workspace SSO before production access",
      "Configure Render cron to call /api/sync after deployment",
    ],
  });
}
