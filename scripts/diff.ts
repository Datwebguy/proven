import { config } from "dotenv";
config({ path: ".env.local" });
import { mem, NAMESPACE } from "../src/lib/memory";

async function main() {
  const m = mem();
  const listed = new Map<string, { status: string; created: string; size: number }>();
  let cursor: string | undefined, more = true;
  while (more) {
    const p = await m.listMemories({ cursor, namespace: NAMESPACE });
    for (const x of p.memories) if (x.namespace_id === NAMESPACE) listed.set(x.blob_id, { status: x.status, created: x.created_at, size: x.size });
    cursor = p.next_cursor ?? undefined;
    more = p.has_more;
  }
  const t = Date.now();
  const r = await m.recall({ query: "PROVEN/1", limit: 100, namespace: NAMESPACE, sort: "recent", timeoutMs: 90_000 });
  console.log("listed", listed.size, "recalled", r.results.length, "unique", new Set(r.results.map((x) => x.blob_id)).size, `${((Date.now() - t) / 1000).toFixed(1)}s`);
  const got = new Set(r.results.map((x) => x.blob_id));
  for (const [b, v] of listed) if (!got.has(b)) console.log("missing:", b, v);
  const statuses: Record<string, number> = {};
  for (const v of listed.values()) statuses[v.status] = (statuses[v.status] ?? 0) + 1;
  console.log("statuses", statuses);
}
main();
