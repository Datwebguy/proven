import { config } from "dotenv";
config({ path: ".env.local" });
import { mem, NAMESPACE } from "../src/lib/memory";

async function main() {
  const m = mem();
  console.log("health:", JSON.stringify(await m.health()).slice(0, 160));
  const t0 = Date.now();
  const r = await m.rememberAndWait("PROVEN/1 SMOKE " + JSON.stringify({ kind: "SMOKE", at: new Date().toISOString() }), NAMESPACE);
  console.log("remember ->", { blob_id: r.blob_id, namespace: r.namespace, ms: Date.now() - t0 });
  const rec = await m.recall({ query: "PROVEN/1 SMOKE", limit: 3, namespace: NAMESPACE, sort: "recent" });
  console.log("recall ->", rec.total, rec.results.map((x) => ({ blob: x.blob_id, text: x.text.slice(0, 60) })));
}
main().catch((e) => { console.error("FAIL:", e?.name, e?.message, e?.status ?? "", "cause:", e?.cause?.code, e?.cause?.message, e?.cause?.hostname); process.exit(1); });
