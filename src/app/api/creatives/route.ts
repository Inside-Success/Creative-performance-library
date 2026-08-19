import { NextResponse } from "next/server";
import { phase0 } from "@/config/phase0";
import { getMetaSnapshot } from "@/lib/meta-cache";
import { sortCreativesForBucket } from "@/lib/ranking";
import type { CreativeBucket } from "@/lib/types";

const buckets = new Set<CreativeBucket>(["winning", "losing", "notEnoughData"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bucketParam = searchParams.get("bucket") as CreativeBucket | null;
  const funnel = searchParams.get("funnel") ?? "All Offers";
  const account = searchParams.get("account") ?? "All Accounts";
  const bucket = bucketParam && buckets.has(bucketParam) ? bucketParam : "notEnoughData";

  try {
    const { snapshot, health } = await getMetaSnapshot();

    if (!snapshot) {
      throw new Error(health.refreshError ?? "No Meta snapshot is available.");
    }

    const creatives = snapshot.creatives;
    const filtered = creatives.filter((creative) => {
      const funnelMatch = funnel === "All Offers" || creative.funnel === funnel;
      const accountMatch = account === "All Accounts" || creative.adAccount === account;

      return funnelMatch && accountMatch;
    });

    return NextResponse.json({
      source: "live-meta",
      cache: health,
      generatedAt: new Date().toISOString(),
      checkedAt: snapshot.spike.checkedAt,
      refreshedAt: snapshot.refreshedAt,
      datePreset: snapshot.datePreset,
      config: {
        adAccounts: phase0.adAccounts,
        thresholds: phase0.thresholds,
      },
      activeBucket: bucket,
      creatives: sortCreativesForBucket(bucket, filtered),
      counts: {
        winning: filtered.filter((creative) => creative.bucket === "winning").length,
        losing: filtered.filter((creative) => creative.bucket === "losing").length,
        notEnoughData: filtered.filter(
          (creative) => creative.bucket === "notEnoughData",
        ).length,
      },
      caveats: [
        "Appointment attribution is pending until the exact Meta custom action or Hyros source is confirmed.",
        "Rows are queried from the approved Phase 0 Meta ad accounts only.",
      ],
    });
  } catch (error) {
    return NextResponse.json(
      {
        source: "live-meta",
        ok: false,
        generatedAt: new Date().toISOString(),
        message:
          error instanceof Error
            ? error.message
            : "Live creative API failed before Meta returned a response.",
      },
      { status: 502 },
    );
  }
}
