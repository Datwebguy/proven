import type { ProvenRecord } from "./types";

const PREFIX = "PROVEN/1 ";

export const encode = (r: ProvenRecord): string => PREFIX + JSON.stringify(r);

export function decode(text: string): ProvenRecord | null {
  if (!text.startsWith(PREFIX)) return null;
  try {
    const r = JSON.parse(text.slice(PREFIX.length));
    return r && typeof r.kind === "string" ? (r as ProvenRecord) : null;
  } catch {
    return null;
  }
}
