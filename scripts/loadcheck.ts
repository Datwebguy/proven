import { config } from "dotenv";
config({ path: ".env.local" });
import { loadAll } from "../src/lib/memory";

async function main() {
  const t = Date.now();
  const r = await loadAll();
  const kinds: Record<string, number> = {};
  for (const x of r.records) kinds[x.record.kind] = (kinds[x.record.kind] ?? 0) + 1;
  console.log("onchain", r.onchainCount, "recalledTotal", r.recalledTotal, "decoded", r.records.length, JSON.stringify(kinds), `${((Date.now() - t) / 1000).toFixed(1)}s`);
}
main();
