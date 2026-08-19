export const phase0 = {
  metaAuth: {
    mode: "temporary-user-token-for-spike",
    productionTarget: "dedicated-system-user",
    tokenEnvVar: "META_SYSTEM_USER_TOKEN",
  },
  access: {
    mode: process.env.ACCESS_MODE ?? "sso-domain",
    allowedEmailDomain: process.env.ALLOWED_EMAIL_DOMAIN ?? "insidesuccess.com",
  },
  sync: {
    strategy: "scheduled-db-sync-with-cached-dashboard-reads",
    /** Used by the Render cron trigger and local sync scripts. */
    intervalHours: Number(process.env.SYNC_INTERVAL_HOURS ?? 6),
    manualRefresh: "admin-only-fallback",
    /**
     * Minutes between automatic dashboard refreshes. Unlike intervalHours this
     * is live behaviour. Kept deliberately long: each refresh is a full live
     * Meta re-query per open tab, against a rate limit already tripped once.
     * Do not drop below 15 without a caching layer in front of Meta.
     */
    autoRefreshMinutes: Number(process.env.AUTO_REFRESH_MINUTES ?? 30),
    cacheTtlMinutes: Number(process.env.META_CACHE_TTL_MINUTES ?? 35),
  },
  segmentation: {
    primary: "meta-campaign-name-keyword-lookup",
    fallback: "hyros-if-meta-mapping-is-messy",
  },
  adAccounts: [
    {
      id: "1988537858156251",
      name: "Inside Success TV",
    },
    {
      id: "968479534887236",
      name: "Inside Success TV | Split Test",
    },
  ],
  thresholds: {
    minSpend: 120,
    winnerAppointmentThreshold: 10,
    lowVolumeAppointmentBand: [1, 2],
    targetCpaBenchmark: 80,
  },
} as const;

export type Phase0Config = typeof phase0;
