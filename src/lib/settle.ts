import { loadAll, writeMany } from "./memory";
import { claimKey, isDue, resolveGroup } from "./resolve";
import { join, sourceStats } from "./scoring";
import type { CallRecord, ProvenRecord } from "./types";

/**
 * Settle every call whose deadline has passed: decide each claim from Tatum's price at the deadline,
 * then write the outcomes and fresh trust snapshots back to memory. Safe to run repeatedly:
 * calls that already have an outcome in memory are skipped.
 */
export async function settleDue(limitGroups = 8) {
  const { records } = await loadAll();
  const before = join(records.map((r) => r.record));
  const due = before.filter((j) => !j.outcome && isDue(j.call));

  const groups = new Map<string, CallRecord[]>();
  for (const { call } of due) groups.set(claimKey(call), [...(groups.get(claimKey(call)) ?? []), call]);
  const batch = [...groups.values()].slice(0, limitGroups);
  if (!batch.length) return { settled: 0, outcomes: [], receipts: [], beforeStats: sourceStats(before), afterStats: sourceStats(before) };

  const outcomes = [];
  for (const g of batch) outcomes.push(await resolveGroup(g));

  const after = join([...records.map((r) => r.record), ...outcomes]);
  const touched = new Set(batch.flat().map((c) => c.source));
  const now = new Date().toISOString();
  const snapshots: ProvenRecord[] = sourceStats(after)
    .filter((s) => touched.has(s.source))
    .map((s) => ({ kind: "CALIBRATION", source: s.source, resolved: s.resolved, brier: +s.brier.toFixed(4), weight: +s.weight.toFixed(4), at: now }));

  const toWrite: ProvenRecord[] = [...outcomes, ...snapshots];
  const res = await writeMany(toWrite);
  return {
    settled: batch.reduce((n, g) => n + g.length, 0),
    outcomes: outcomes.map((o, i) => ({ ...o, claim: batch[i][0], blobId: res[i].blobId, error: res[i].error })),
    receipts: res.map((r, i) => ({ kind: toWrite[i].kind, ...r })),
    beforeStats: sourceStats(before),
    afterStats: sourceStats(after),
  };
}
