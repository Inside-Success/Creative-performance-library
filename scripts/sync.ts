import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadLocalEnv();

  const [{ phase0 }, { refreshMetaSnapshot }] = await Promise.all([
    import("../src/config/phase0"),
    import("../src/lib/meta-cache"),
  ]);

  console.log("Creative Performance Library Meta snapshot sync");
  console.log(`Strategy: ${phase0.sync.strategy}`);
  console.log(`Target cadence: every ${phase0.sync.intervalHours} hours`);

  const snapshot = await refreshMetaSnapshot();

  console.log(`Snapshot refreshed: ${snapshot.refreshedAt}`);
  console.log(`Rows cached: ${snapshot.creatives.length}`);
  console.log(`Date preset: ${snapshot.datePreset}`);
  console.log("Output: data/meta-snapshot.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
