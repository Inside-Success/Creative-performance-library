import { phase0 } from "@/config/phase0";
import { getHyrosAppointmentsForCreatives } from "@/lib/hyros";
import { funnelMappings } from "@/lib/sample-data";
import { classifyCreative } from "@/lib/ranking";
import type {
  AppointmentSourceStatus,
  CreativeMetric,
  CreativeStatus,
  MetaActionTotal,
  MetaCustomConversionSummary,
  MetaSpikeAccountSummary,
  MetaSpikeCheck,
  MetaSpikeCreativeRow,
  MetaSpikeMappingRow,
  MetaSpikeResult,
} from "@/lib/types";

type MetaGraphResponse<T> = {
  data?: T[];
  paging?: {
    next?: string;
  };
  error?: {
    message: string;
    type?: string;
    code?: number;
    fbtrace_id?: string;
  };
};

type MetaAction = {
  action_type: string;
  value: string;
};

type MetaCampaign = {
  id: string;
  name: string;
  objective?: string;
  status?: string;
  effective_status?: string;
};

type MetaInsight = {
  account_id?: string;
  account_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id: string;
  ad_name?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  actions?: MetaAction[];
  cost_per_action_type?: MetaAction[];
  date_start?: string;
  date_stop?: string;
};

type MetaCustomConversion = {
  id: string;
  name: string;
  custom_event_type?: string;
};

type MetaAd = {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  campaign_id?: string;
  adset_id?: string;
  creative?: {
    id?: string;
    name?: string;
    title?: string;
    body?: string;
    thumbnail_url?: string;
    image_url?: string;
    video_id?: string;
    effective_object_story_id?: string;
  };
};

export type MetaAccountProbe = {
  accountId: string;
  accountName: string;
  ok: boolean;
  message: string;
  sampleCampaignCount?: number;
};

function metaBaseUrl() {
  const version = process.env.META_API_VERSION ?? "v21.0";
  return `https://graph.facebook.com/${version}`;
}

function getToken() {
  return process.env.META_SYSTEM_USER_TOKEN;
}

function requireToken() {
  const token = getToken();

  if (!token) {
    throw new Error("META_SYSTEM_USER_TOKEN is not set in the local environment.");
  }

  return token;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function describeFetchError(error: unknown) {
  if (!(error instanceof Error)) {
    return "unknown error";
  }

  const cause =
    error.cause && typeof error.cause === "object"
      ? (error.cause as { code?: string; message?: string; hostname?: string })
      : null;

  if (cause?.code || cause?.message) {
    return [cause.code, cause.message, cause.hostname ? `host=${cause.hostname}` : ""]
      .filter(Boolean)
      .join(" - ");
  }

  return error.message;
}

function isRetryableMetaResponse(response: Response, payload: MetaGraphResponse<unknown>) {
  const message = payload.error?.message?.toLowerCase() ?? "";
  const code = payload.error?.code;

  return (
    [429, 500, 502, 503, 504].includes(response.status) ||
    code === 4 ||
    code === 17 ||
    code === 32 ||
    message.includes("request limit") ||
    message.includes("rate limit") ||
    message.includes("too many calls")
  );
}

async function readMetaEdge<T>(
  path: string,
  params: Record<string, string>,
  options: { maxPages?: number } = {},
) {
  const token = requireToken();
  const rows: T[] = [];
  const maxPages = options.maxPages ?? 3;
  let pagesRead = 0;
  let nextUrl: string | null = `${metaBaseUrl()}/${path}`;
  const initialUrl = new URL(nextUrl);

  Object.entries(params).forEach(([key, value]) => {
    initialUrl.searchParams.set(key, value);
  });
  initialUrl.searchParams.set("access_token", token);
  nextUrl = initialUrl.toString();

  while (nextUrl && pagesRead < maxPages) {
    let payload: MetaGraphResponse<T> | null = null;
    let response: Response | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await fetch(nextUrl, {
          headers: {
            Accept: "application/json",
          },
          cache: "no-store",
        });
      } catch (error) {
        throw new Error(`Meta network request failed: ${describeFetchError(error)}`);
      }

      payload = (await response.json()) as MetaGraphResponse<T>;

      if (response.ok && !payload.error) {
        break;
      }

      if (attempt < 2 && isRetryableMetaResponse(response, payload)) {
        await sleep(1_250 * 2 ** attempt);
      } else {
        break;
      }
    }

    if (!response || !payload) {
      throw new Error("Meta request failed before Meta returned a response.");
    }

    if (!response.ok || payload.error) {
      throw new Error(payload.error?.message ?? `Meta request failed with ${response.status}.`);
    }

    rows.push(...(payload.data ?? []));
    nextUrl = payload.paging?.next ?? null;
    pagesRead += 1;
  }

  return rows;
}

const AD_FIELDS =
  "id,name,status,effective_status,campaign_id,adset_id,creative{id,name,title,body,thumbnail_url,image_url,video_id,effective_object_story_id}";

/**
 * Reads exactly the ads that insights returned, using the ads edge with an
 * `id IN (...)` filter.
 *
 * Previously this paged `act_<id>/ads` unfiltered, which returns every ad in
 * the account in its own order - so the first 150 ads almost never overlapped
 * the 150 rows insights returned. Most rows found no ad record and lost both
 * the creative preview and the real delivery status (which then silently
 * defaulted to "Paused").
 *
 * Verified against Graph: the `?ids=` batch endpoint returns an empty body for
 * ad objects, so the filtering form is the one that works.
 */
async function readAdsByIds(accountId: string, adIds: string[]) {
  const uniqueIds = Array.from(new Set(adIds.filter(Boolean)));
  const ads: MetaAd[] = [];
  const chunkSize = 50;

  for (let index = 0; index < uniqueIds.length; index += chunkSize) {
    const chunk = uniqueIds.slice(index, index + chunkSize);
    const filtering = JSON.stringify([
      { field: "id", operator: "IN", value: chunk },
    ]);

    try {
      const rows = await readMetaEdge<MetaAd>(
        `act_${accountId}/ads`,
        { fields: AD_FIELDS, filtering, limit: String(chunkSize) },
        { maxPages: 1 },
      );

      ads.push(...rows);
    } catch {
      // One bad chunk must not cost every other row its preview.
      continue;
    }
  }

  return ads;
}

/**
 * Picks the best available creative image.
 *
 * `thumbnail_url` is always rendered at 64x64 - the thumbnail_width /
 * thumbnail_height params are accepted by Graph but ignored - so it is far too
 * small to judge a creative on. `image_url` carries the full-resolution asset
 * and is preferred whenever present.
 */
function previewUrlFor(ad: MetaAd | undefined) {
  return ad?.creative?.image_url ?? ad?.creative?.thumbnail_url ?? null;
}

function toNumber(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Meta reports the same conversion under several aliases. For a single lead,
 * `lead`, `onsite_web_lead`, `offsite_conversion.fb_pixel_lead` and
 * `offsite_lead_add_*` all carry the same value. Summing every action_type that
 * merely *contains* "lead" therefore multiplies the true count (measured at
 * ~4x on these accounts) and divides CPL by the same factor.
 *
 * `lead` is Meta's already-deduplicated total, so we take the first action type
 * present in priority order and never add aliases together.
 */
const LEAD_ACTION_TYPES = [
  "lead",
  "onsite_web_lead",
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.lead_grouped",
  "onsite_conversion.lead",
];

/** Engagement actions that can never represent an appointment. */
const NON_CONVERSION_ACTION_TYPES = new Set([
  "comment",
  "like",
  "link_click",
  "photo_view",
  "post",
  "post_engagement",
  "post_interaction_gross",
  "post_interaction_net",
  "post_reaction",
  "post_uncomment",
  "page_engagement",
  "video_view",
  "landing_page_view",
  "omni_landing_page_view",
]);

/** Engagement families reported under the onsite_conversion.* namespace. */
const NON_CONVERSION_ACTION_PREFIXES = [
  "onsite_conversion.post_",
  "onsite_conversion.messaging_",
  "onsite_conversion.total_messaging",
];

/**
 * Whether an action type could plausibly be a booked appointment, so the
 * /phase1 candidate list stays short enough to act on. Meta files post likes,
 * saves and message replies under onsite_conversion.*, and those outrank real
 * conversions by volume if they are not filtered out.
 */
function isAppointmentCandidate(actionType: string) {
  if (NON_CONVERSION_ACTION_TYPES.has(actionType)) {
    return false;
  }

  return !NON_CONVERSION_ACTION_PREFIXES.some((prefix) => actionType.startsWith(prefix));
}

/**
 * Returns the first action type present from `types`, in priority order.
 * Never sums across aliases. Returns null when none are present.
 */
function firstActionValue(actions: MetaAction[] | undefined, types: string[]) {
  for (const type of types) {
    const match = actions?.find((action) => action.action_type === type);

    if (match) {
      return { value: toNumber(match.value), actionType: type };
    }
  }

  return null;
}

/**
 * Sums explicitly configured action types. Safe to sum here because the
 * operator chose these exact values, rather than them being matched by
 * substring.
 */
function sumActionValues(actions: MetaAction[] | undefined, types: string[]) {
  const matches = actions?.filter((action) => types.includes(action.action_type)) ?? [];

  if (matches.length === 0) {
    return null;
  }

  return {
    value: matches.reduce((sum, action) => sum + toNumber(action.value), 0),
    actionTypes: matches.map((action) => action.action_type),
  };
}

/** Exact Meta action types that represent a booked appointment. */
function appointmentActionTypes() {
  return (process.env.META_APPOINTMENT_ACTION_TYPES ?? "")
    .split(",")
    .map((type) => type.trim())
    .filter(Boolean);
}

/**
 * Legacy substring fallback, used only when no exact types are configured.
 * Kept for compatibility, but it is a heuristic and is reported as such.
 */
function appointmentActionKeywords() {
  return (process.env.META_APPOINTMENT_ACTION_KEYWORDS ?? "")
    .split(",")
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);
}

function appointmentSourceMode() {
  if (appointmentActionTypes().length > 0) {
    return "exact-action-types" as const;
  }

  if (appointmentActionKeywords().length > 0) {
    return "keyword-heuristic" as const;
  }

  return "unconfigured" as const;
}

function hyrosEnabled() {
  return Boolean(process.env.HYROS_API_KEY?.trim());
}

/**
 * Resolves appointments for one insight row. Returns null appointments when no
 * source is configured or nothing matched — callers must then fall back to the
 * lead proxy *and say so*, rather than silently substituting the metric.
 */
function resolveAppointments(insight: MetaInsight, spend: number) {
  const mode = appointmentSourceMode();

  if (mode === "unconfigured") {
    return { appointments: null, costPerAppointment: null, matchedTypes: [] as string[] };
  }

  const exactTypes =
    mode === "exact-action-types"
      ? appointmentActionTypes()
      : // Resolve the keyword heuristic down to the concrete action types it hits,
        // so the matched types are auditable instead of implicit.
        Array.from(
          new Set(
            (insight.actions ?? [])
              .map((action) => action.action_type)
              .filter((actionType) =>
                appointmentActionKeywords().some((keyword) =>
                  actionType.toLowerCase().includes(keyword),
                ),
              ),
          ),
        );

  if (exactTypes.length === 0) {
    return { appointments: null, costPerAppointment: null, matchedTypes: [] as string[] };
  }

  const matched = sumActionValues(insight.actions, exactTypes);

  if (!matched) {
    return { appointments: null, costPerAppointment: null, matchedTypes: [] as string[] };
  }

  const reportedCost = firstActionValue(insight.cost_per_action_type, exactTypes);
  const costPerAppointment =
    reportedCost?.value ?? (matched.value > 0 ? spend / matched.value : null);

  return {
    appointments: matched.value,
    costPerAppointment,
    matchedTypes: matched.actionTypes,
  };
}

function isLeadScopeCampaign(campaign: MetaCampaign) {
  const text = `${campaign.name} ${campaign.objective ?? ""}`.toLowerCase();

  return [
    "lead",
    "leads",
    "appointment",
    "schedule",
    "scheduled",
    "casting",
    "outcome_leads",
  ].some((keyword) => text.includes(keyword));
}

function matchFunnelFromCampaignName(campaignName: string) {
  const normalized = campaignName.toLowerCase();
  const matches = funnelMappings.filter((mapping) =>
    normalized.includes(mapping.keyword.toLowerCase()),
  );

  return {
    matchedFunnel: matches.length === 1 ? matches[0].funnel : null,
    matchedKeywords: matches.map((match) => match.keyword),
  };
}

function mapCampaignToFunnel(campaign: MetaCampaign, accountName: string) {
  const match = matchFunnelFromCampaignName(campaign.name);

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    accountName,
    objective: campaign.objective,
    matchedFunnel: match.matchedFunnel,
    matchedKeywords: match.matchedKeywords,
    isLeadScope: isLeadScopeCampaign(campaign),
  } satisfies MetaSpikeMappingRow;
}

function mapMetaStatus(status: string | undefined): CreativeStatus {
  if (!status) {
    return "Paused";
  }

  if (status === "ACTIVE") {
    return "Delivering";
  }

  if (status === "DELETED" || status === "ARCHIVED") {
    return "Deleted";
  }

  return "Paused";
}

function previewTextFor(row: MetaSpikeCreativeRow) {
  const source = row.adName || row.campaignName;
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join(" ");
}

export function metaSpikeRowsToCreatives(rows: MetaSpikeCreativeRow[]) {
  return rows.map((row, index) => {
    const { bucket, basis } = classifyCreative({
      spend: row.spend,
      appointments: row.appointments,
      costPerAppointment: row.costPerAppointment,
      leads: row.leads,
      costPerLead: row.costPerLead,
    });

    return {
      id: row.adId,
      rank: index + 1,
      title: row.adName,
      format: "Image",
      version: "Live",
      previewText: previewTextFor(row),
      funnel: row.funnel ?? "Unmapped / Review",
      adAccount: row.accountName,
      status: mapMetaStatus(row.adStatus),
      spend: row.spend,
      leads: row.leads,
      costPerLead: row.costPerLead,
      appointments: row.appointments,
      costPerAppointment: row.costPerAppointment,
      bucket,
      attributionBasis: basis,
      previewUrl: row.previewUrl ?? undefined,
      loserTier:
        bucket === "losing" && row.appointments === 0
          ? "zeroAppointments"
          : bucket === "losing"
            ? "lowVolumeHighCost"
            : undefined,
    } satisfies CreativeMetric;
  });
}

export async function probeMetaAccount(accountId: string, accountName: string) {
  const token = getToken();

  if (!token) {
    return {
      accountId,
      accountName,
      ok: false,
      message: "META_SYSTEM_USER_TOKEN is not set in the local environment.",
    } satisfies MetaAccountProbe;
  }

  const url = new URL(`${metaBaseUrl()}/act_${accountId}/campaigns`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "5");
  url.searchParams.set("fields", "id,name,objective,status,effective_status");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as MetaGraphResponse<{
    id: string;
    name: string;
  }>;

  if (!response.ok || payload.error) {
    return {
      accountId,
      accountName,
      ok: false,
      message: payload.error?.message ?? `Meta request failed with ${response.status}.`,
    } satisfies MetaAccountProbe;
  }

  return {
    accountId,
    accountName,
    ok: true,
    message: "Token can read campaigns for this account.",
    sampleCampaignCount: payload.data?.length ?? 0,
  } satisfies MetaAccountProbe;
}

export async function runMetaAccessProbe() {
  return Promise.all(
    phase0.adAccounts.map((account) => probeMetaAccount(account.id, account.name)),
  );
}

/**
 * Custom conversions are where a "Booked appointment" goal would live. Failure
 * to read them must not kill the spike — it is a diagnostic, not a dependency.
 */
async function readCustomConversions(accountId: string, accountName: string) {
  try {
    const rows = await readMetaEdge<MetaCustomConversion>(
      `act_${accountId}/customconversions`,
      { fields: "id,name,custom_event_type", limit: "100" },
      { maxPages: 1 },
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      customEventType: row.custom_event_type,
      accountName,
    })) satisfies MetaCustomConversionSummary[];
  } catch {
    return [] as MetaCustomConversionSummary[];
  }
}

export async function runMetaSpike(datePreset = "last_30d") {
  const accountSummaries: MetaSpikeAccountSummary[] = [];
  const mappingRows: MetaSpikeMappingRow[] = [];
  const creativeRows: MetaSpikeCreativeRow[] = [];
  const observedActionTypes = new Set<string>();
  const actionTotals = new Map<string, number>();
  const customConversions: MetaCustomConversionSummary[] = [];

  for (const account of phase0.adAccounts) {
    const [campaigns, insights] = await Promise.all([
      readMetaEdge<MetaCampaign>(`act_${account.id}/campaigns`, {
        fields: "id,name,objective,status,effective_status",
        limit: "50",
      }),
      readMetaEdge<MetaInsight>(`act_${account.id}/insights`, {
        fields:
          "account_id,account_name,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,impressions,clicks,spend,actions,cost_per_action_type,date_start,date_stop",
        level: "ad",
        date_preset: datePreset,
        action_report_time: "conversion",
        limit: "50",
      }),
    ]);

    // Must run after insights: we fetch exactly the ads insights returned.
    const ads = await readAdsByIds(
      account.id,
      insights.map((insight) => insight.ad_id),
    );

    customConversions.push(...(await readCustomConversions(account.id, account.name)));

    const adsById = new Map(ads.map((ad) => [ad.id, ad]));
    const campaignsById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
    const accountMappings = campaigns.map((campaign) =>
      mapCampaignToFunnel(campaign, account.name),
    );
    const leadScopeMappings = accountMappings.filter((row) => row.isLeadScope);
    const unmatchedLeadScopeMappings = leadScopeMappings.filter(
      (row) => row.matchedFunnel === null,
    );

    mappingRows.push(...accountMappings);

    const accountCreativeRows = insights.map((insight) => {
      insight.actions?.forEach((action) => {
        observedActionTypes.add(action.action_type);
        actionTotals.set(
          action.action_type,
          (actionTotals.get(action.action_type) ?? 0) + toNumber(action.value),
        );
      });
      insight.cost_per_action_type?.forEach((action) =>
        observedActionTypes.add(`cost:${action.action_type}`),
      );

      const ad = adsById.get(insight.ad_id);
      const campaign =
        (insight.campaign_id ? campaignsById.get(insight.campaign_id) : undefined) ??
        undefined;
      const mapping = accountMappings.find(
        (row) => row.campaignId === insight.campaign_id,
      );
      const campaignName = insight.campaign_name ?? campaign?.name ?? "Unknown campaign";
      const nameMatch = mapping?.matchedFunnel
        ? {
            matchedFunnel: mapping.matchedFunnel,
            matchedKeywords: mapping.matchedKeywords,
          }
        : matchFunnelFromCampaignName(campaignName);
      const spend = toNumber(insight.spend);

      const leadMatch = firstActionValue(insight.actions, LEAD_ACTION_TYPES);
      const leads = leadMatch?.value ?? null;
      const reportedCostPerLead = firstActionValue(
        insight.cost_per_action_type,
        LEAD_ACTION_TYPES,
      );
      const costPerLead =
        leads !== null && leads > 0 ? spend / leads : (reportedCostPerLead?.value ?? null);

      const appointment = resolveAppointments(insight, spend);

      return {
        adId: insight.ad_id,
        adName: insight.ad_name ?? ad?.name ?? "Untitled ad",
        accountName: account.name,
        campaignId: insight.campaign_id ?? null,
        campaignName,
        funnel: nameMatch.matchedFunnel,
        adStatus: ad?.effective_status ?? ad?.status,
        spend,
        leads,
        appointments: appointment.appointments,
        costPerLead,
        costPerAppointment: appointment.costPerAppointment,
        previewUrl: previewUrlFor(ad),
        creativeId: ad?.creative?.id ?? null,
        leadActionType: leadMatch?.actionType ?? null,
        appointmentActionTypes: appointment.matchedTypes,
      } satisfies MetaSpikeCreativeRow;
    });

    creativeRows.push(...accountCreativeRows);

    accountSummaries.push({
      accountId: account.id,
      accountName: account.name,
      campaignCount: campaigns.length,
      leadScopeCampaignCount: leadScopeMappings.length,
      adInsightCount: insights.length,
      adsWithSpend: accountCreativeRows.filter((row) => row.spend > 0).length,
      totalSpend: accountCreativeRows.reduce((sum, row) => sum + row.spend, 0),
      adsWithLeads: accountCreativeRows.filter((row) => row.leads !== null).length,
      adsWithAppointments: accountCreativeRows.filter(
        (row) => row.appointments !== null,
      ).length,
      adsWithCreativePreview: accountCreativeRows.filter((row) => row.previewUrl !== null)
        .length,
      mappedCampaignCount: leadScopeMappings.length - unmatchedLeadScopeMappings.length,
      unmatchedCampaignCount: unmatchedLeadScopeMappings.length,
    });
  }

  let hyrosSummary:
    | Awaited<ReturnType<typeof getHyrosAppointmentsForCreatives>>["summary"]
    | null = null;

  if (hyrosEnabled() && appointmentSourceMode() === "unconfigured") {
    try {
      const hyros = await getHyrosAppointmentsForCreatives(creativeRows, datePreset);

      hyrosSummary = hyros.summary;
      creativeRows.forEach((row) => {
        const appointments = hyros.appointmentsByAdId.get(row.adId);

        if (appointments === undefined) {
          return;
        }

        row.appointments = appointments;
        row.costPerAppointment = appointments > 0 ? row.spend / appointments : null;
        row.appointmentActionTypes = [`hyros:${hyros.summary.field}`];
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Hyros attribution failed before Hyros returned a response.";

      hyrosSummary = {
        enabled: true,
        field: process.env.HYROS_APPOINTMENT_FIELD ?? "qualified_calls",
        rowsMatched: 0,
        totalAppointments: 0,
        message,
      };
    }
  }

  accountSummaries.forEach((summary) => {
    const accountRows = creativeRows.filter((row) => row.accountName === summary.accountName);

    summary.adsWithAppointments = accountRows.filter(
      (row) => row.appointments !== null,
    ).length;
  });

  const totalLeadScopeCampaigns = accountSummaries.reduce(
    (sum, account) => sum + account.leadScopeCampaignCount,
    0,
  );
  const totalMappedCampaigns = accountSummaries.reduce(
    (sum, account) => sum + account.mappedCampaignCount,
    0,
  );
  const totalAdsWithSpend = accountSummaries.reduce(
    (sum, account) => sum + account.adsWithSpend,
    0,
  );
  const totalAdsWithLeads = accountSummaries.reduce(
    (sum, account) => sum + account.adsWithLeads,
    0,
  );
  const totalAdsWithAppointments = accountSummaries.reduce(
    (sum, account) => sum + account.adsWithAppointments,
    0,
  );
  const totalAdsWithPreview = accountSummaries.reduce(
    (sum, account) => sum + account.adsWithCreativePreview,
    0,
  );

  const observedActionTotals = Array.from(actionTotals.entries())
    .map(([actionType, total]) => ({ actionType, total }) satisfies MetaActionTotal)
    .sort((a, b) => b.total - a.total);

  // Everything that could plausibly be a booked appointment, so the team can
  // pick the right action type instead of guessing at keywords.
  const appointmentCandidates = observedActionTotals.filter(
    (row) => isAppointmentCandidate(row.actionType) && row.total > 0,
  );

  const configuredAppointmentSource = appointmentActionTypes();
  const appointmentMode =
    hyrosSummary?.enabled
      ? ("hyros-attribution" as const)
      : appointmentSourceMode();
  const matchedAppointmentTypes = Array.from(
    new Set(creativeRows.flatMap((row) => row.appointmentActionTypes)),
  ).sort();

  const appointmentSource: AppointmentSourceStatus = {
    mode: appointmentMode,
    configured:
      appointmentMode === "exact-action-types"
        ? configuredAppointmentSource
        : appointmentMode === "hyros-attribution"
          ? hyrosSummary?.field
            ? [`hyros:${hyrosSummary.field}`]
            : []
        : appointmentActionKeywords(),
    matched: matchedAppointmentTypes,
    rowsWithAppointments: totalAdsWithAppointments,
    customConversionCount: customConversions.length,
    hyrosRowsMatched: hyrosSummary?.rowsMatched,
    hyrosAppointmentField: hyrosSummary?.field,
    candidates: appointmentCandidates.slice(0, 20),
    message:
      appointmentMode === "hyros-attribution"
        ? hyrosSummary && hyrosSummary.rowsMatched > 0
          ? hyrosSummary.message
          : `Hyros is configured, but appointments did not resolve. ${hyrosSummary?.message ?? "No Hyros appointment rows matched."} Rows fall back to the lead/CPL proxy.`
          : appointmentMode === "unconfigured"
            ? "No appointment source is configured. Set META_APPOINTMENT_ACTION_TYPES to the exact Meta action type(s), or supply appointments from Hyros. Until then every row is ranked on the lead/CPL proxy."
            : matchedAppointmentTypes.length > 0
              ? `Appointments resolved from ${matchedAppointmentTypes.join(", ")}.`
              : `Configured appointment source (${appointmentMode}) matched no action type in this window. Rows fall back to the lead/CPL proxy. Pick a value from the candidate list below.`,
  };

  const checks: MetaSpikeCheck[] = [
    {
      name: "Ad account access",
      status: accountSummaries.length === phase0.adAccounts.length ? "pass" : "fail",
      detail: `Read ${accountSummaries.length}/${phase0.adAccounts.length} approved ad accounts.`,
    },
    {
      name: "Campaign objective filtering",
      status: totalLeadScopeCampaigns > 0 ? "pass" : "partial",
      detail: `Found ${totalLeadScopeCampaigns} campaigns matching lead, appointment, schedule, casting, or OUTCOME_LEADS signals.`,
    },
    {
      name: "Insights metrics",
      status:
        totalAdsWithSpend > 0 && totalAdsWithLeads > 0
          ? totalAdsWithAppointments > 0
            ? "pass"
            : "partial"
          : "fail",
      detail: `Read ${totalAdsWithSpend} ads with spend, ${totalAdsWithLeads} with lead actions, and ${totalAdsWithAppointments} with appointment actions. Leads are read from one exact action type per row (no alias summing).`,
    },
    {
      name: "Appointment attribution",
      status: totalAdsWithAppointments > 0 ? "pass" : "fail",
      detail: `${appointmentSource.message} ${customConversions.length} custom conversion(s) are defined on the approved accounts.`,
    },
    {
      name: "Creative previews",
      status: totalAdsWithPreview > 0 ? "pass" : "partial",
      detail: `Found thumbnail or image URLs for ${totalAdsWithPreview}/${creativeRows.length} ad insight rows.`,
    },
    {
      name: "Preview URL durability",
      status: totalAdsWithPreview > 0 ? "partial" : "not_started",
      detail:
        "Preview URLs can be extracted; browser/session durability still needs a manual visibility check outside Meta account access.",
    },
    {
      name: "Funnel mapping",
      status:
        totalLeadScopeCampaigns > 0 && totalMappedCampaigns === totalLeadScopeCampaigns
          ? "pass"
          : totalMappedCampaigns > 0
            ? "partial"
            : "fail",
      detail: `Mapped ${totalMappedCampaigns}/${totalLeadScopeCampaigns} lead-scope campaigns using Phase 0 keyword rules.`,
    },
    {
      name: "Hyros need",
      status:
        appointmentMode === "hyros-attribution" && totalAdsWithAppointments > 0
          ? "pass"
          : hyrosSummary?.enabled
            ? "fail"
            : totalAdsWithAppointments === 0
              ? "fail"
              : "partial",
      detail:
        appointmentMode === "hyros-attribution" && totalAdsWithAppointments > 0
          ? `Hyros is supplying appointments from ${hyrosSummary?.field}.`
          : hyrosSummary?.enabled
            ? `Hyros is configured but did not supply appointment rows: ${hyrosSummary.message}`
            : totalAdsWithAppointments === 0
          ? `Meta cannot supply appointments for these accounts: ${customConversions.length} custom conversions are defined and no observed action type represents a booking. Either create a custom conversion in Events Manager for the booking event, or make Hyros the appointment source.`
          : "Appointments are resolving from Meta; Hyros can stay a fallback.",
    },
    {
      name: "Sync cadence",
      status: creativeRows.length <= 200 ? "partial" : "partial",
      detail: `The sampled read completed with ${creativeRows.length} ad-level rows. Keep the 6h placeholder until pagination volume and rate headers are reviewed.`,
    },
  ];

  return {
    ok: checks.every((check) => check.status === "pass" || check.status === "partial"),
    checkedAt: new Date().toISOString(),
    datePreset,
    checks,
    accountSummaries,
    mappingRows,
    creativeRows: creativeRows.sort((a, b) => b.spend - a.spend),
    observedActionTypes: Array.from(observedActionTypes).sort(),
    observedActionTotals,
    customConversions,
    appointmentSource,
    notes: [
      "System checks read the approved providers live; the dashboard serves the latest snapshot cache.",
      appointmentSource.message,
      "Leads are read from a single exact Meta action type per row. Meta reports the same lead under several aliases, so summing them inflated counts ~4x and understated CPL by the same factor.",
      "Only the two approved Phase 0 ad accounts are queried.",
    ],
  } satisfies MetaSpikeResult;
}
