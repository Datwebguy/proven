import type { ProvenRecord } from "./types";

const PREFIX = "PROVEN/2 ";
const KINDS = new Set(["CALL", "OUTCOME", "CALIBRATION"]);

export const encode = (r: ProvenRecord): string => PREFIX + JSON.stringify(r);

/** Returns null for anything that is not a well-formed Proven v2 record. */
export function decode(text: string): ProvenRecord | null {
  if (!text.startsWith(PREFIX)) return null;
  try {
    const r = JSON.parse(text.slice(PREFIX.length));
    return r && KINDS.has(r.kind) ? (r as ProvenRecord) : null;
  } catch {
    return null;
  }
}
