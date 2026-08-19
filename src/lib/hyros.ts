import type { MetaSpikeCreativeRow } from "@/lib/types";

type HyrosAttributionRow = {
  id?: string | number;
  adSourceId?: string | number;
  calls?: string | number | null;
  qualified_calls?: string | number | null;
  unique_calls?: string | number | null;
  canceled_calls?: string | number | null;
  [key: string]: unknown;
};

type HyrosAttributionResponse = {
  result?: HyrosAttributionRow[] | Record<string, HyrosAttributionRow>;
  message?: string | string[];
};

export type HyrosAppointmentSummary = {
  enabled: boolean;
  field: string;
  rowsMatched: number;
  totalAppointments: number;
  message: string;
};

export type HyrosAppointmentResult = {
  appointmentsByAdId: Map<string, number>;
  summary: HyrosAppointmentSummary;
};

export type HyrosProbeResult = {
  ok: boolean;
  configured: boolean;
  status?: number;
  message: string;
};

const attributionFields = [
  "name",
  "calls",
  "qualified_calls",
  "unique_calls",
  "canceled_calls",
];

function hyrosApiKey() {
  return process.env.HYROS_API_KEY?.trim();
}

function hyrosBaseUrl() {
  return (process.env.HYROS_BASE_URL ?? "https://api.hyros.com/v1").replace(/\/$/, "");
}

function hyrosAppointmentField() {
  return (process.env.HYROS_APPOINTMENT_FIELD ?? "qualified_calls").trim();
}

function hyrosAttributionModel() {
  return (process.env.HYROS_ATTRIBUTION_MODEL ?? "last_click").trim();
}

export async function probeHyrosAccess(): Promise<HyrosProbeResult> {
  const key = hyrosApiKey();

  if (!key) {
    return {
      ok: false,
      configured: false,
      message: "HYROS_API_KEY is not configured.",
    };
  }

  try {
    const response = await fetch(`${hyrosBaseUrl()}/api/v1.0/user-info`, {
      headers: {
        Accept: "application/json",
        "API-Key": key,
      },
      cache: "no-store",
    });

    return {
      ok: response.ok,
      configured: true,
      status: response.status,
      message: response.ok
        ? "Hyros API key is configured and the API is reachable."
        : `Hyros API returned ${response.status}.`,
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      message: `Hyros network request failed: ${describeFetchError(error)}`,
    };
  }
}

function toNumber(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/,/g, ""))
        : Number.NaN;

  return Number.isFinite(parsed) ? parsed : 0;
}

function dateRangeForPreset(datePreset: string) {
  const end = new Date();
  const start = new Date(end);

  if (datePreset === "last_7d") {
    start.setUTCDate(start.getUTCDate() - 7);
  } else {
    start.setUTCDate(start.getUTCDate() - 30);
  }

  return {
    startDate: formatHyrosDate(start),
    endDate: formatHyrosDate(end),
  };
}

function formatHyrosDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function rowAdId(row: HyrosAttributionRow) {
  const source =
    row.id ??
    row.adSourceId ??
    (typeof row.sourceLinkAd === "object" && row.sourceLinkAd !== null
      ? (row.sourceLinkAd as { adSourceId?: string | number }).adSourceId
      : undefined);

  return source === undefined || source === null ? null : String(source);
}

function normalizeRows(result: HyrosAttributionResponse["result"]) {
  if (Array.isArray(result)) {
    return result;
  }

  if (result && typeof result === "object") {
    return Object.entries(result).map(([id, row]) => ({
      id,
      ...row,
    }));
  }

  return [];
}

async function readHyrosAttribution(adIds: string[], datePreset: string) {
  const key = hyrosApiKey();

  if (!key) {
    return [] as HyrosAttributionRow[];
  }

  const { startDate, endDate } = dateRangeForPreset(datePreset);
  const url = new URL(`${hyrosBaseUrl()}/api/v1.0/attribution`);

  url.searchParams.set("attributionModel", hyrosAttributionModel());
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("endDate", endDate);
  url.searchParams.set("level", "facebook_ad");
  url.searchParams.set("fields", attributionFields.join(","));
  url.searchParams.set("ids", adIds.join(","));
  url.searchParams.set("currency", "usd");
  url.searchParams.set("sourceConfiguration", "only_paid");

  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "API-Key": key,
      },
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(`Hyros network request failed: ${describeFetchError(error)}`);
  }

  const payload = (await response.json()) as HyrosAttributionResponse;

  if (!response.ok) {
    const message = Array.isArray(payload.message)
      ? payload.message.join(", ")
      : payload.message;

    throw new Error(message ?? `Hyros attribution request failed with ${response.status}.`);
  }

  return normalizeRows(payload.result);
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

export async function getHyrosAppointmentsForCreatives(
  rows: MetaSpikeCreativeRow[],
  datePreset: string,
): Promise<HyrosAppointmentResult> {
  const key = hyrosApiKey();
  const field = hyrosAppointmentField();

  if (!key) {
    return {
      appointmentsByAdId: new Map(),
      summary: {
        enabled: false,
        field,
        rowsMatched: 0,
        totalAppointments: 0,
        message: "HYROS_API_KEY is not configured.",
      },
    };
  }

  const adIds = Array.from(new Set(rows.map((row) => row.adId).filter(Boolean)));
  const appointmentsByAdId = new Map<string, number>();

  for (const ids of chunk(adIds, 50)) {
    const attributionRows = await readHyrosAttribution(ids, datePreset);

    attributionRows.forEach((row) => {
      const adId = rowAdId(row);

      if (!adId) {
        return;
      }

      const appointments = toNumber(row[field]);

      if (appointments > 0) {
        appointmentsByAdId.set(adId, appointments);
      }
    });
  }

  const totalAppointments = Array.from(appointmentsByAdId.values()).reduce(
    (sum, value) => sum + value,
    0,
  );

  return {
    appointmentsByAdId,
    summary: {
      enabled: true,
      field,
      rowsMatched: appointmentsByAdId.size,
      totalAppointments,
      message:
        appointmentsByAdId.size > 0
          ? `Hyros ${field} matched ${appointmentsByAdId.size} Meta ad row(s).`
          : `Hyros returned no ${field} values for the sampled Meta ad rows.`,
    },
  };
}
