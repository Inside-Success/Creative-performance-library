"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DATE_RANGE_OPTIONS, DATE_RANGE_PARAM } from "@/lib/date-range";

/**
 * Date range for the whole dashboard.
 *
 * The range cannot be applied client-side: rows arrive pre-aggregated over a
 * window, so changing it means asking the server for a different snapshot.
 * The selection therefore lives in the URL and the server re-reads the cache
 * for that preset.
 *
 * Each preset has its OWN snapshot file, so switching back and forth reads
 * cache rather than re-querying Meta. The first view of an uncached preset
 * does cost a full live refresh (~20-40s), which is why the control shows a
 * pending state instead of looking broken.
 *
 * Reads the current value from a prop rather than `useSearchParams` so the
 * component needs no Suspense boundary.
 */
export function DateRangeSelect({ value }: { value: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="field">
      <label htmlFor="date-range">Date range</label>
      <select
        id="date-range"
        value={value}
        disabled={isPending}
        onChange={(event) => {
          const next = event.target.value;

          startTransition(() => {
            router.push(`/?${DATE_RANGE_PARAM}=${encodeURIComponent(next)}`);
          });
        }}
      >
        {DATE_RANGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {isPending ? (
        <span role="status" className="field-note">
          Loading range...
        </span>
      ) : null}
    </div>
  );
}
