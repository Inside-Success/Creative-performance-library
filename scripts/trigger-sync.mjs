const syncUrl = process.env.CPL_SYNC_URL?.trim();
const syncSecret = process.env.SYNC_TRIGGER_SECRET?.trim();

if (!syncUrl) {
  throw new Error("CPL_SYNC_URL is not set.");
}

if (!syncSecret) {
  throw new Error("SYNC_TRIGGER_SECRET is not set.");
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 240_000);

try {
  const response = await fetch(syncUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${syncSecret}`,
    },
    signal: controller.signal,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload?.message ?? `CPL sync trigger failed with ${response.status}.`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        refreshedAt: payload?.refreshedAt,
        checkedAt: payload?.checkedAt,
        rows: payload?.rows,
      },
      null,
      2,
    ),
  );
} finally {
  clearTimeout(timeout);
}
