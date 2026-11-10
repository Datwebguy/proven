import { MemWal } from "@mysten-incubation/memwal";
import { decodeAll, encodeBundle, type Stored } from "./codec";
import type { ProvenRecord, Recalled } from "./types";

/** Walrus Memory on Sui mainnet is the only store of record. There is no database. */
export const NAMESPACE = process.env.MEMWAL_NAMESPACE ?? "proven-v3";

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
  const res = await mem().rememberAndWait(encodeBundle([r]), NAMESPACE);
  invalidate();
  return res.blob_id;
}

/**
 * Write many records as one bundle (one Walrus memory), so a round or a settlement is a single
 * memory. Very large batches are split into bundles of 60. Results are in input order; records in
 * the same bundle share its blob ID as their receipt.
 */
export async function writeMany(rs: Stored[], onProgress?: (done: number, total: number) => void): Promise<WriteResult[]> {
  const out: WriteResult[] = [];
  for (let i = 0; i < rs.length; i += 60) {
    const chunk = rs.slice(i, i + 60);
    try {
      const res = await mem().rememberAndWait(encodeBundle(chunk), NAMESPACE);
      chunk.forEach(() => out.push({ blobId: res.blob_id }));
    } catch (e) {
      chunk.forEach(() => out.push({ error: (e as Error).message }));
    }
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
 * Rebuild the whole journal from Walrus Memory. Each memory is a bundle of records, so the journal
 * is a handful of memories and one recall returns them all. If the namespace ever holds more than
 * one recall can return, a second pass by relevance picks up the rest.
 */
async function rebuild(): Promise<Loaded> {
  const m = mem();
  const seen = new Set<string>();
  const records: Recalled[] = [];

  const pull = async (sort?: "recent") => {
    const { results } = await m.recall({ query: "PROVEN/3 records", limit: 100, namespace: NAMESPACE, ...(sort ? { sort } : {}), timeoutMs: 90_000 });
    for (const r of results) {
      if (seen.has(r.blob_id)) continue;
      seen.add(r.blob_id);
      for (const { receipt, ...record } of decodeAll(r.text)) {
        records.push({ blobId: receipt ?? r.blob_id, createdAt: r.created_at, record: record as ProvenRecord });
      }
    }
  };

  const [stored] = await Promise.all([countStored(m), pull("recent")]);
  if (seen.size < stored) await pull();
  return { records, stored, recalled: seen.size, rebuiltAt: new Date().toISOString() };
}
