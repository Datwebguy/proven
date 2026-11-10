import { MemWal } from "@mysten-incubation/memwal";
import { decode, encode } from "./codec";
import type { ProvenRecord, Recalled } from "./types";

export const NAMESPACE = process.env.MEMWAL_NAMESPACE ?? "proven-v1";

let client: MemWal | null = null;
export function mem(): MemWal {
  if (client) return client;
  const key = process.env.MEMWAL_PRIVATE_KEY, accountId = process.env.MEMWAL_ACCOUNT_ID;
  if (!key || !accountId) throw new Error("Set MEMWAL_PRIVATE_KEY and MEMWAL_ACCOUNT_ID (mainnet delegate key + account).");
  client = MemWal.create({
    key, accountId, namespace: NAMESPACE,
    serverUrl: process.env.MEMWAL_SERVER_URL ?? "https://relayer.memory.walrus.xyz",
  });
  return client;
}

/** Write one record to Walrus mainnet; resolves with the real blob id once the job is done. */
export async function write(r: ProvenRecord): Promise<{ blobId: string }> {
  const res = await mem().rememberAndWait(encode(r), NAMESPACE);
  return { blobId: res.blob_id };
}

/** Write many records (bulk, <=20 per request). Returns one result per input, in order. */
export async function writeMany(rs: ProvenRecord[], onChunk?: (done: number, total: number) => void): Promise<{ blobId?: string; error?: string }[]> {
  const out: { blobId?: string; error?: string }[] = [];
  for (let i = 0; i < rs.length; i += 20) {
    const chunk = rs.slice(i, i + 20);
    const res = await mem().rememberBulkAndWait(
      chunk.map((r) => ({ text: encode(r), namespace: NAMESPACE })),
      { timeoutMs: 280_000, pollIntervalMs: 2000 },
    );
    for (const it of res.results) out.push(it.status === "done" && it.blob_id ? { blobId: it.blob_id } : { error: it.error ?? it.status });
    onChunk?.(out.length, rs.length);
  }
  return out;
}

/**
 * Rebuild the full journal from Walrus. listMemories gives the exact count + blob ids;
 * recall (several broad queries, newest-first) returns the decrypted text. No local cache.
 */
export async function loadAll(): Promise<{ records: Recalled[]; onchainCount: number; recalledTotal: number }> {
  const m = mem();
  let count = 0, cursor: string | undefined, more = true;
  while (more) {
    const page = await m.listMemories({ cursor, namespace: NAMESPACE });
    count += page.memories.filter((x) => x.namespace_id === NAMESPACE).length;
    cursor = page.next_cursor ?? undefined;
    more = page.has_more;
  }
  const seenAll = new Set<string>();
  const seen = new Map<string, Recalled>();
  const pull = async (query: string, sort?: "recent") => {
    const { results } = await m.recall({ query, limit: 100, namespace: NAMESPACE, ...(sort ? { sort } : {}), timeoutMs: 90_000 });
    for (const r of results) {
      seenAll.add(r.blob_id);
      const record = decode(r.text);
      if (record && !seen.has(r.blob_id)) seen.set(r.blob_id, { blobId: r.blob_id, createdAt: r.created_at, record });
    }
    return results.length;
  };
  // One recall returns up to 100 decrypted memories. If that cap is hit, the journal is bigger than one
  // question can return, so widen with per-kind queries. If it came back short (a blob can be skipped
  // transiently), retry once with a different ordering.
  const first = await pull("PROVEN/1", "recent");
  if (seenAll.size < count) {
    if (first >= 100) {
      for (const q of ["PROVEN/1 CALL", "PROVEN/1 OUTCOME", "PROVEN/1 CALIBRATION"]) {
        if (seenAll.size >= count) break;
        await pull(q);
      }
    } else {
      await pull("PROVEN/1");
    }
  }
  return { records: [...seen.values()], onchainCount: count, recalledTotal: seenAll.size };
}
