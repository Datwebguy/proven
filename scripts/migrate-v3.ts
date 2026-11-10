/**
 * Carry the proven-v2 journal (one record per memory) into proven-v3 (one bundle per write).
 * Each carried record keeps `receipt` = the blob where it was first written, so receipts still prove
 * when a call was made. Refuses to write unless every v2 record was recalled.
 * Usage: npx tsx scripts/migrate-v3.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { decodeAll, type Stored } from "../src/lib/codec";
import { mem, NAMESPACE, writeMany } from "../src/lib/memory";

const FROM = "proven-v2";

async function main() {
  if (NAMESPACE === FROM) throw new Error("Set MEMWAL_NAMESPACE to the new namespace first.");
  const m = mem();
  let stored = 0;
  let cursor: string | undefined;
  let more = true;
  while (more) {
    const p = await m.listMemories({ cursor, namespace: FROM });
    stored += p.memories.filter((x) => x.namespace_id === FROM).length;
    cursor = p.next_cursor ?? undefined;
    more = p.has_more;
  }

  const byBlob = new Map<string, Stored>();
  const pull = async (query: string, sort?: "recent") => {
    const { results } = await m.recall({ query, limit: 100, namespace: FROM, ...(sort ? { sort } : {}), timeoutMs: 180_000 });
    for (const r of results) {
      const [rec] = decodeAll(r.text);
      if (rec && !byBlob.has(r.blob_id)) byBlob.set(r.blob_id, { ...rec, receipt: r.blob_id });
    }
    console.log(`  "${query}"${sort ? " recent" : ""}: ${byBlob.size}/${stored}`);
  };
  const queries = ["PROVEN/2", ...["Trend Follower", "Mean Reverter", "Momentum 4h", "Perma-Bull"].map((s) => `PROVEN/2 {"kind":"CALL","source":"${s}"`), 'PROVEN/2 {"kind":"OUTCOME","callIds"', 'PROVEN/2 {"kind":"CALIBRATION"'];
  await pull("PROVEN/2", "recent");
  for (const q of queries) {
    if (byBlob.size >= stored) break;
    await pull(q);
  }
  if (byBlob.size < stored) throw new Error(`Only recalled ${byBlob.size}/${stored}; not migrating.`);

  // Group records the way they were written: calls by the time they were made, results by settlement.
  const groups = new Map<string, Stored[]>();
  for (const r of byBlob.values()) {
    const key = r.kind === "CALL" ? `calls ${r.loggedAt}` : r.kind === "OUTCOME" ? `results ${r.resolvedAt.slice(0, 16)}` : `results ${r.at.slice(0, 16)}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => a.slice(a.indexOf(" ")).localeCompare(b.slice(b.indexOf(" "))));
  console.log(`writing ${byBlob.size} records as ${ordered.length} bundles to ${NAMESPACE}`);
  for (const [key, recs] of ordered) {
    const [res] = await writeMany(recs);
    console.log(`  ${key}: ${recs.length} records -> ${res.blobId ?? res.error}`);
    if (!res.blobId) throw new Error("write failed; stopping");
  }
  console.log("done");
}

main().catch((e) => {
  console.error("migration failed:", e?.message ?? e);
  process.exit(1);
});
