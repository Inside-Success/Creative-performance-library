import { phase0 } from "@/config/phase0";
import type {
  CreativeBucket,
  CreativeMetric,
  LoserTier,
  RankingBasis,
  RankingMode,
} from "./types";

export function formatCurrency(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

export function formatNumber(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US").format(value);
}

export type Classification = {
  bucket: CreativeBucket;
  basis: RankingBasis;
  loserTier?: LoserTier;
};

/**
 * Buckets one creative on APPOINTMENT VOLUME AND COST PER APPOINTMENT - the
 * original brief's metric. Leads are not a ranking key; they remain a
 * displayed column only.
 *
 * Two axes, both required for a win:
 *   - volume: at least `winnerAppointmentThreshold` appointments, so the
 *     result is not a coin flip;
 *   - efficiency: cost per appointment at or under `targetCpaBenchmark`.
 *
 * High volume at a bad CPA is NOT a winner - it is the most expensive way to
 * lose money, so it drops to Watch / Cut as `highCpa`.
 *
 * Returns the metric it decided on. Callers must carry `basis` through to the
 * UI: when no appointment source resolved the result is a lead/CPL proxy, not
 * the appointment ranking, and must not be displayed as though it were.
 */
export function classifyCreative(input: {
  spend: number;
  appointments: number | null;
  costPerAppointment: number | null;
  leads?: number | null;
  costPerLead?: number | null;
}): Classification {
  const { minSpend, winnerAppointmentThreshold, targetCpaBenchmark } =
    phase0.thresholds;
  const [lowMin, lowMax] = phase0.thresholds.lowVolumeAppointmentBand;

  if (input.spend < minSpend) {
    return { bucket: "notEnoughData", basis: "insufficient" };
  }

  // --- Spec path: an appointment source answered for this row ----------------
  // Note `appointments === 0` reaches here only because a provider explicitly
  // scored it zero. An unanswered row is null and falls to the proxy below.
  if (input.appointments !== null) {
    if (input.appointments === 0) {
      return { bucket: "losing", basis: "appointment", loserTier: "zeroAppointments" };
    }

    const isExpensive =
      input.costPerAppointment !== null &&
      input.costPerAppointment > targetCpaBenchmark;

    if (input.appointments >= winnerAppointmentThreshold) {
      return isExpensive
        ? { bucket: "losing", basis: "appointment", loserTier: "highCpa" }
        : { bucket: "winning", basis: "appointment" };
    }

    const isLowVolume = input.appointments >= lowMin && input.appointments <= lowMax;

    if (isLowVolume && isExpensive) {
      return {
        bucket: "losing",
        basis: "appointment",
        loserTier: "lowVolumeHighCost",
      };
    }

    return { bucket: "notEnoughData", basis: "appointment" };
  }

  // --- Proxy path: no appointment source resolved, rank on leads/CPL ---------
  // Reached only when NO provider covered the row. Every result here is
  // provisional and is labelled as such in the UI.
  if (input.leads === null || input.leads === undefined || input.leads === 0) {
    return { bucket: "losing", basis: "lead-proxy", loserTier: "zeroAppointments" };
  }

  if (input.leads >= winnerAppointmentThreshold) {
    return { bucket: "winning", basis: "lead-proxy" };
  }

  const isLowLeadVolume = input.leads >= lowMin && input.leads <= lowMax;
  const isHighCpl =
    input.costPerLead !== null &&
    input.costPerLead !== undefined &&
    input.costPerLead > targetCpaBenchmark;

  if (isLowLeadVolume || isHighCpl) {
    return {
      bucket: "losing",
      basis: "lead-proxy",
      loserTier: isHighCpl ? "highCpa" : "lowVolumeHighCost",
    };
  }

  return { bucket: "notEnoughData", basis: "lead-proxy" };
}

/**
 * THE single source of truth for which metric the view is ranked on.
 *
 * Both the page header card and the table column header must read this. They
 * previously derived it independently - the header from "any row has
 * appointments", the table from "any row is a lead proxy" - and a mixed
 * snapshot made both true at once, so the page claimed "cost per appointment"
 * while the column header said "CPL (ranking metric)".
 *
 * The rule: if any row carries a real appointment count, the view is an
 * appointment ranking. Otherwise every row fell back to the proxy.
 */
export function resolveRankingMode(creatives: CreativeMetric[]): RankingMode {
  return creatives.some((creative) => creative.appointments !== null)
    ? "appointment"
    : "lead-proxy";
}

/**
 * How many rows are still on the proxy while the view as a whole ranks on
 * appointments. Non-zero means the ordering mixes two metrics and the UI
 * should say so rather than implying a single clean ranking.
 */
export function countProxyRows(creatives: CreativeMetric[]) {
  return creatives.filter((creative) => creative.appointments === null).length;
}

/**
 * The cost the bucket is ordered on. In appointment mode that is cost per
 * appointment and nothing else - falling back to CPL here is what previously
 * let a cheap-lead row outrank a genuinely cheap booking. A row with no cost
 * yet sorts last rather than first.
 */
function rankingCost(creative: CreativeMetric, mode: RankingMode) {
  const cost =
    mode === "appointment" ? creative.costPerAppointment : creative.costPerLead;

  return cost ?? Number.POSITIVE_INFINITY;
}

/** Volume on the ranking metric, used to break cost ties. */
function rankingVolume(creative: CreativeMetric, mode: RankingMode) {
  const volume = mode === "appointment" ? creative.appointments : creative.leads;

  return volume ?? 0;
}

export function sortCreativesForBucket(
  bucket: CreativeMetric["bucket"],
  creatives: CreativeMetric[],
  mode: RankingMode = resolveRankingMode(creatives),
) {
  const filtered = creatives.filter((creative) => creative.bucket === bucket);

  if (bucket === "winning") {
    // Cheapest booking first; on a tie the one that produced more of them.
    return filtered.sort((a, b) => {
      const costDelta = rankingCost(a, mode) - rankingCost(b, mode);

      if (costDelta !== 0) {
        return costDelta;
      }

      return rankingVolume(b, mode) - rankingVolume(a, mode);
    });
  }

  if (bucket === "losing") {
    // Worst kind of loser first, then by how much money it is burning.
    return filtered.sort((a, b) => {
      const tierWeight = {
        zeroAppointments: 0,
        highCpa: 1,
        lowVolumeHighCost: 2,
        undefined: 3,
      } as const;
      const aTier = tierWeight[a.loserTier ?? "undefined"];
      const bTier = tierWeight[b.loserTier ?? "undefined"];

      if (aTier !== bTier) {
        return aTier - bTier;
      }

      return b.spend - a.spend;
    });
  }

  return filtered.sort((a, b) => b.spend - a.spend);
}
