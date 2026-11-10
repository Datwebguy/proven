import { config } from "dotenv";
config({ path: ".env.local" });
import { mem, NAMESPACE } from "../src/lib/memory";

async function main() {
  const m = mem();
  for (const [label, p] of [
    ["limit100 relevance", { query: "PROVEN/1 CALL", limit: 100, sort: undefined }],
    ["limit100 recent", { query: "PROVEN/1 OUTCOME", limit: 100, sort: "recent" as const }],
    ["limit30 relevance", { query: "PROVEN/1 CALIBRATION", limit: 30, sort: undefined }],
  ] as const) {
    const t = Date.now();
    try {
      const r = await m.recall({ query: p.query, limit: p.limit, namespace: NAMESPACE, ...(p.sort ? { sort: p.sort } : {}), timeoutMs: 120_000 });
      const kinds: Record<string, number> = {};
      for (const x of r.results) { const k = /"kind":"(\w+)"/.exec(x.text)?.[1] ?? "?"; kinds[k] = (kinds[k] ?? 0) + 1; }
      console.log(label, "->", r.results.length, JSON.stringify(kinds), `${((Date.now() - t) / 1000).toFixed(1)}s`);
    } catch (e) {
      console.log(label, "ERR", (e as Error).message, `${((Date.now() - t) / 1000).toFixed(1)}s`);
    }
  }
}
main();
