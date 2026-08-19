import { phase0 } from "@/config/phase0";
import type { CreativeBucket, CreativeMetric, RankingBasis } from "./types";

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

/**
 * Returns both the bucket and the metric it was decided on. Callers must carry
 * `basis` through to the UI: when no appointment source is configured the
 * result is a lead/CPL proxy, not the Phase 0 appointment ranking, and it must
 * not be displayed as though it were.
 */
export function classifyCreative(input: {
  spend: number;
  appointments: number | null;
  costPerAppointment: number | null;
  leads?: number | null;
  costPerLead?: number | null;
}): { bucket: CreativeBucket; basis: RankingBasis } {
  const { minSpend, winnerAppointmentThreshold } = phase0.thresholds;
  const [lowMin, lowMax] = phase0.thresholds.lowVolumeAppointmentBand;

  if (input.spend < minSpend) {
    return { bucket: "notEnoughData", basis: "insufficient" };
  }

  // --- Phase 0 spec path: real appointment data is available -----------------
  if (input.appointments !== null) {
    if (input.appointments >= winnerAppointmentThreshold) {
      return { bucket: "winning", basis: "appointment" };
    }

    if (input.appointments === 0) {
      return { bucket: "losing", basis: "appointment" };
    }

    const isLowVolume = input.appointments >= lowMin && input.appointments <= lowMax;
    const isHighCost =
      input.costPerAppointment !== null &&
      input.costPerAppointment > phase0.thresholds.targetCpaBenchmark;

    if (isLowVolume && isHighCost) {
      return { bucket: "losing", basis: "appointment" };
    }

    return { bucket: "notEnoughData", basis: "appointment" };
  }

  // --- Proxy path: no appointment source resolved, rank on leads/CPL ---------
  if (input.leads === null || input.leads === undefined || input.leads === 0) {
    return { bucket: "losing", basis: "lead-proxy" };
  }

  if (input.leads >= winnerAppointmentThreshold) {
    return { bucket: "winning", basis: "lead-proxy" };
  }

  const isLowLeadVolume = input.leads >= lowMin && input.leads <= lowMax;
  const isHighCpl =
    input.costPerLead !== null &&
    input.costPerLead !== undefined &&
    input.costPerLead > phase0.thresholds.targetCpaBenchmark;

  if (isLowLeadVolume || isHighCpl) {
    return { bucket: "losing", basis: "lead-proxy" };
  }

  return { bucket: "notEnoughData", basis: "lead-proxy" };
}

export function sortCreativesForBucket(
  bucket: CreativeMetric["bucket"],
  creatives: CreativeMetric[],
) {
  const filtered = creatives.filter((creative) => creative.bucket === bucket);

  if (bucket === "winning") {
    return filtered.sort(
      (a, b) =>
        (a.costPerAppointment ?? a.costPerLead ?? Number.POSITIVE_INFINITY) -
        (b.costPerAppointment ?? b.costPerLead ?? Number.POSITIVE_INFINITY),
    );
  }

  if (bucket === "losing") {
    return filtered.sort((a, b) => {
      const tierWeight = {
        zeroAppointments: 0,
        lowVolumeHighCost: 1,
        highCpa: 2,
        undefined: 3,
      } as const;
      const aTier = tierWeight[a.loserTier ?? "undefined"];
      const bTier = tierWeight[b.loserTier ?? "undefined"];

      if (aTier !== bTier) {
        return aTier - bTier;
      }

      if (a.appointments === 0 && b.appointments === 0) {
        return b.spend - a.spend;
      }

      return b.spend - a.spend;
    });
  }

  return filtered.sort((a, b) => b.spend - a.spend);
}
