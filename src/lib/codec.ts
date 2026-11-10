import type { ProvenRecord } from "./types";

/**
 * Storage format. Each Walrus memory holds one bundle: every record from one write
 * (a single call, a whole strategy round, or a settlement's outcomes and trust snapshots).
 * Bundling keeps the journal to a handful of memories, so rebuilding it is one fast recall.
 *
 *   PROVEN/3 {"records":[{...record, "receipt"?: "<original blob id>"}, ...]}
 *
 * `receipt` is set only on records carried over from an earlier namespace; it points at the blob
 * where the record was first written, so "saved before the deadline" stays provable.
 * Single records in the older `PROVEN/2 {...}` format are still read.
 */
const V3 = "PROVEN/3 ";
const V2 = "PROVEN/2 ";
const KINDS = new Set(["CALL", "OUTCOME", "CALIBRATION"]);

export type Stored = ProvenRecord & { receipt?: string };

export const encodeBundle = (records: Stored[]): string => V3 + JSON.stringify({ records });

/** Kept for single-record writes and tests. */
export const encode = (r: ProvenRecord): string => encodeBundle([r]);

const valid = (r: unknown): r is Stored => !!r && typeof r === "object" && KINDS.has((r as { kind?: string }).kind ?? "");

/** Every well-formed record in a memory's text (empty for anything else). */
export function decodeAll(text: string): Stored[] {
  try {
    if (text.startsWith(V3)) {
      const b = JSON.parse(text.slice(V3.length));
      return Array.isArray(b?.records) ? b.records.filter(valid) : [];
    }
    if (text.startsWith(V2)) {
      const r = JSON.parse(text.slice(V2.length));
      return valid(r) ? [r] : [];
    }
  } catch {
    /* not ours */
  }
  return [];
}

/** First record of a memory, or null. */
export const decode = (text: string): ProvenRecord | null => {
  const all = decodeAll(text);
  if (!all.length) return null;
  const { receipt: _r, ...rec } = all[0];
  return rec as ProvenRecord;
};
