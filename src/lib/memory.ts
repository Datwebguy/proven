import { MemWal } from "@mysten-incubation/memwal";
import { decode, encode } from "./codec";
import type { ProvenRecord, Recalled } from "./types";

/** Walrus Memory on Sui mainnet is the only store of record. There is no database. */
export const NAMESPACE = process.env.MEMWAL_NAMESPACE ?? "proven-v2";

let client: MemWal | null = null;
export function mem(): MemWal {
  if (client) return client;
  const key = process.env.MEMWAL_PRIVATE_KEY;
  const accountId = process.env.MEMWAL_ACCOUNT_ID;
  if (!key || !accountId) throw new Error("Memory is not configured (MEMWAL_PRIVATE_KEY, MEMWAL_ACCOUNT_ID).");
  client = MemWal.create({
    key,
    accountId,
    namespace: NAMESPACE,
    serverUrl: process.env.MEMWAL_SERVER_URL ?? "https://relayer.memory.walrus.xyz",
  });
  return client;
}

export type WriteResult = { blobId?: string; error?: string };

/** Write one record; resolves once it is stored on Walrus, with its blob ID as the receipt. */
export async function write(r: ProvenRecord): Promise<string> {
  const res = await mem().rememberAndWait(encode(r), NAMESPACE);
  invalidate();
  return res.blob_id;
}

/** Write many records, 20 per request (the relayer's bulk limit). Results are in input order. */
export async function writeMany(rs: ProvenRecord[], onProgress?: (done: number, total: number) => void): Promise<WriteResult[]> {
  const out: WriteResult[] = [];
  for (let i = 0; i < rs.length; i += 20) {
    const chunk = rs.slice(i, i + 20);
    const res = await mem().rememberBulkAndWait(
      chunk.map((r) => ({ text: encode(r), namespace: NAMESPACE })),
      { timeoutMs: 280_000, pollIntervalMs: 2000 },
    );
    for (const it of res.results) out.push(it.status === "done" && it.blob_id ? { blobId: it.blob_id } : { error: it.error ?? it.status });
    onProgress?.(out.length, rs.length);
  }
  invalidate();
  return out;
}

/** Exact number of records stored in our namespace, from the on-chain index (no decryption). */
async function countStored(m: MemWal) {
  let count = 0;
  let cursor: string | undefined;
  let more = true;
  while (more) {
    const page = await m.listMemories({ cursor, namespace: NAMESPACE });
    count += page.memories.filter((x) => x.namespace_id === NAMESPACE).length;
    cursor = page.next_cursor ?? undefined;
    more = page.has_more;
  }
  return count;
}

/**
 * Rebuild the whole journal from Walrus Memory. Recall returns at most 100 decrypted records per
 * question, so if the first pass is full we ask narrower questions until the count matches.
 */
type Loaded = { records: Recalled[]; stored: number; recalled: number; rebuiltAt: string };

/**
 * A rebuild is reused for a few seconds so that several visitors (or several requests from one page)
 * don't each decrypt the whole journal again. Every write clears it, so new calls and results show at once.
 * Walrus stays the only source of truth: the cache only ever holds a copy of the latest rebuild.
 */
const FRESH_MS = Number(process.env.REBUILD_CACHE_MS ?? 20_000);
let cached: { at: number; value: Loaded } | null = null;
let inflight: Promise<Loaded> | null = null;
export const invalidate = () => { cached = null; };

export async function loadAll(opts: { fresh?: boolean } = {}): Promise<Loaded> {
  if (opts.fresh) {
    const value = await rebuild();
    cached = { at: Date.now(), value };
    return value;
  }
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.value;
  if (inflight) return inflight;
  inflight = rebuild()
    .then((value) => { cached = { at: Date.now(), value }; return value; })
    .finally(() => { inflight = null; });
  return inflight;
}

/**
 * Rebuild the whole journal from Walrus Memory. Recall returns at most 100 decrypted records per
 * question, so when the journal is larger we ask several narrower questions in parallel and merge.
 */
async function rebuild(): Promise<Loaded> {
  const m = mem();
  const seen = new Set<string>();
  const records = new Map<string, Recalled>();

  const pull = async (query: string, sort?: "recent") => {
    const { results } = await m.recall({ query, limit: 100, namespace: NAMESPACE, ...(sort ? { sort } : {}), timeoutMs: 90_000 });
    for (const r of results) {
      seen.add(r.blob_id);
      const record = decode(r.text);
      if (record && !records.has(r.blob_id)) records.set(r.blob_id, { blobId: r.blob_id, createdAt: r.created_at, record });
    }
    return results.length;
  };

  const [stored, first] = await Promise.all([countStored(m), pull("PROVEN/2", "recent")]);
  if (seen.size < stored) {
    const narrower = first >= 100
      ? ["PROVEN/2 CALL", "PROVEN/2 OUTCOME", "PROVEN/2 CALIBRATION", "PROVEN/2 CALL strategy", "PROVEN/2 CALL person", "PROVEN/2 CALL SUI", "PROVEN/2 CALL SOL", "PROVEN/2 CALL BTC", "PROVEN/2 CALL ETH"]
      : ["PROVEN/2"];
    await Promise.all(narrower.flatMap((q) => [pull(q), pull(q, "recent")]));
  }
  return { records: [...records.values()], stored, recalled: seen.size, rebuiltAt: new Date().toISOString() };
}
