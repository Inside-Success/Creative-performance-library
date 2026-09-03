export type CreativeStatus = "Delivering" | "Paused" | "Deleted";

export type CreativeBucket = "winning" | "losing" | "notEnoughData";

/**
 * Which metric a row was actually ranked on. `appointment` is the Phase 0 spec
 * metric; `lead-proxy` means no appointment source resolved and leads/CPL stood
 * in for it. Rows must never present a proxy result as if it were the real one.
 */
export type RankingBasis = "appointment" | "lead-proxy" | "insufficient";

/**
 * The metric the WHOLE view is ranked on. Derived in exactly one place
 * (`resolveRankingMode` in ./ranking) and passed down, so the page header and
 * the table column header can never disagree about it.
 */
export type RankingMode = "appointment" | "lead-proxy";

/** Which provider supplied a row's appointment count, if any. */
export type AppointmentSource = "meta" | "hyros" | "none";

export type LoserTier = "zeroAppointments" | "lowVolumeHighCost" | "highCpa";

/**
 * Provider windows behind a snapshot. Meta and Hyros do NOT share a window:
 * Meta's preset resolves in the ad account timezone and excludes today, Hyros
 * is queried in UTC and includes today. Surfaced so "spend but no
 * appointments" can be read correctly instead of re-investigated.
 */
export type AttributionContext = {
  metaDatePreset: string;
  appointmentSource: AppointmentSourceMode;
  hyrosField?: string;
  hyrosAttributionModel?: string;
  hyrosWindowStart?: string;
  hyrosWindowEnd?: string;
};

export type AppointmentSourceMode =
  | "exact-action-types"
  | "keyword-heuristic"
  | "hyros-attribution"
  | "unconfigured";

export type MetaActionTotal = {
  actionType: string;
  total: number;
};

export type MetaCustomConversionSummary = {
  id: string;
  name: string;
  customEventType?: string;
  accountName: string;
};

export type AppointmentSourceStatus = {
  mode: AppointmentSourceMode;
  configured: string[];
  matched: string[];
  rowsWithAppointments: number;
  customConversionCount: number;
  hyrosRowsMatched?: number;
  hyrosRowsWithAppointments?: number;
  hyrosAppointmentField?: string;
  hyrosAttributionModel?: string;
  hyrosWindowStart?: string;
  hyrosWindowEnd?: string;
  candidates: MetaActionTotal[];
  message: string;
};

export type CreativeMetric = {
  id: string;
  rank: number;
  title: string;
  format: "Image" | "Video";
  version: string;
  previewText: string;
  funnel: string;
  adAccount: string;
  status: CreativeStatus;
  spend: number;
  leads: number | null;
  costPerLead: number | null;
  appointments: number | null;
  costPerAppointment: number | null;
  bucket: CreativeBucket;
  attributionBasis: RankingBasis;
  /**
   * Which provider the `appointments` value came from. `hyros` must stay
   * visible in the UI so Hyros-attributed numbers are never read as
   * Meta-native ones. Optional so fixture rows stay valid.
   */
  appointmentSource?: AppointmentSource;
  /** Exact source label for the row, e.g. `hyros:qualified_calls`. */
  appointmentSourceDetail?: string;
  previewUrl?: string;
  loserTier?: LoserTier;
};

export type MetaSpikeCheck = {
  name: string;
  status: "not_started" | "pass" | "partial" | "fail";
  detail: string;
};

export type MetaSpikeAccountSummary = {
  accountId: string;
  accountName: string;
  campaignCount: number;
  leadScopeCampaignCount: number;
  adInsightCount: number;
  adsWithSpend: number;
  totalSpend: number;
  adsWithLeads: number;
  adsWithAppointments: number;
  adsWithCreativePreview: number;
  mappedCampaignCount: number;
  unmatchedCampaignCount: number;
};

export type MetaSpikeMappingRow = {
  campaignId: string;
  campaignName: string;
  accountName: string;
  objective?: string;
  matchedFunnel: string | null;
  matchedKeywords: string[];
  isLeadScope: boolean;
};

export type MetaSpikeCreativeRow = {
  adId: string;
  adName: string;
  accountName: string;
  campaignId: string | null;
  campaignName: string;
  funnel: string | null;
  adStatus?: string;
  spend: number;
  leads: number | null;
  appointments: number | null;
  costPerLead: number | null;
  costPerAppointment: number | null;
  previewUrl: string | null;
  creativeId: string | null;
  /** The exact Meta action_type leads were read from, for auditability. */
  leadActionType: string | null;
  /** Which configured appointment action types actually appeared on this row. */
  appointmentActionTypes: string[];
  /**
   * Which provider answered for appointments on this row. `none` means no
   * provider covered it - distinct from a provider answering zero, which is
   * `appointments: 0` with a real source.
   */
  appointmentSource: AppointmentSource;
};

export type MetaSpikeResult = {
  ok: boolean;
  checkedAt: string;
  datePreset: string;
  checks: MetaSpikeCheck[];
  accountSummaries: MetaSpikeAccountSummary[];
  mappingRows: MetaSpikeMappingRow[];
  creativeRows: MetaSpikeCreativeRow[];
  observedActionTypes: string[];
  observedActionTotals: MetaActionTotal[];
  customConversions: MetaCustomConversionSummary[];
  appointmentSource: AppointmentSourceStatus;
  notes: string[];
};

export type MetaDashboardSnapshot = {
  version: 1;
  refreshedAt: string;
  datePreset: string;
  spike: MetaSpikeResult;
  creatives: CreativeMetric[];
};

export type DateRangeOption = {
  value: string;
  label: string;
};

export type MetaSnapshotHealth = {
  source: "cache" | "live";
  cacheStatus: "fresh" | "stale" | "missing" | "refresh-failed";
  isStale: boolean;
  ageMinutes: number | null;
  message: string;
  refreshError?: string;
};

export type MetaSnapshotRead = {
  snapshot: MetaDashboardSnapshot | null;
  health: MetaSnapshotHealth;
};
