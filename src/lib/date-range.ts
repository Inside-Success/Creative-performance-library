import type { DateRangeOption } from "@/lib/types";

/**
 * Date ranges the dashboard may request.
 *
 * Deliberately limited to Meta's ROLLING-DAY presets. Calendar presets
 * (`this_month`, `last_month`) are excluded because Meta resolves them in the
 * ad account timezone while Hyros would resolve them in UTC, which shifts the
 * spend window and the appointment window against each other at every month
 * boundary. Rolling presets map 1:1 onto the Hyros day arithmetic in
 * `HYROS_PRESET_DAYS`, so the two stay comparable.
 *
 * Adding a preset here REQUIRES adding the matching entry to
 * `HYROS_PRESET_DAYS` in ./hyros, or Hyros silently keeps querying 30 days.
 */
export const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  { value: "last_7d", label: "Last 7 days" },
  { value: "last_14d", label: "Last 14 days" },
  { value: "last_30d", label: "Last 30 days" },
  { value: "last_90d", label: "Last 90 days" },
];

export const DEFAULT_DATE_PRESET = "last_30d";

/** Query-string key the dashboard reads the selected range from. */
export const DATE_RANGE_PARAM = "range";

const allowed = new Set(DATE_RANGE_OPTIONS.map((option) => option.value));

/**
 * Never trust a preset off the query string - it is interpolated into a Meta
 * Graph request. Anything unrecognised falls back to the default.
 */
export function resolveDatePreset(value: string | null | undefined) {
  return value && allowed.has(value) ? value : DEFAULT_DATE_PRESET;
}

export function dateRangeLabel(value: string) {
  return (
    DATE_RANGE_OPTIONS.find((option) => option.value === value)?.label ?? value
  );
}
