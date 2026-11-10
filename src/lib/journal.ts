import { loadAll } from "./memory";
import { guidance, join, learningCurve, reliability, sourceStats } from "./scoring";
import type { Recalled } from "./types";

/** Everything the UI shows is derived here, from records recalled from Walrus on every request. */
export async function buildJournal(topic: string) {
  const { records, onchainCount, recalledTotal } = await loadAll();
  const joined = join(records.map((r) => r.record));
  const blobOf = new Map<string, Recalled>();
  for (const r of records) {
    if (r.record.kind === "CALL") blobOf.set("c:" + r.record.id, r);
    if (r.record.kind === "OUTCOME") blobOf.set("o:" + r.record.callId, r);
  }
  const topics = [...new Set(joined.map((j) => j.call.topic))];
  const g = guidance(joined, topic);
  const rows = g.rows.map((r) => ({ ...r, blobId: blobOf.get("c:" + r.callId)?.blobId }));
  return {
    onchainCount,
    recalledCount: recalledTotal,
    topic,
    topics,
    sources: sourceStats(joined),
    guidance: { off: g.off, on: g.on, rankOff: g.rankOff, rankOn: g.rankOn, rows },
    curve: learningCurve(joined),
    reliability: Object.fromEntries(
      [...new Set(joined.map((j) => j.call.source))].map((s) => [s, reliability(joined, s)]),
    ),
    calls: joined.map((j) => ({
      id: j.call.id,
      source: j.call.source,
      topic: j.call.topic,
      claim: j.call.claim,
      confidence: j.call.confidence,
      deadline: j.call.deadline,
      sample: !!j.call.sample,
      callBlob: blobOf.get("c:" + j.call.id)?.blobId,
      outcome: j.outcome
        ? { result: j.outcome.result, observed: j.outcome.observed, evidence: j.outcome.evidence, blob: blobOf.get("o:" + j.call.id)?.blobId }
        : null,
    })),
    calibrations: records.filter((r) => r.record.kind === "CALIBRATION").length,
    kinds: { call: joined.length, outcome: joined.filter((j) => j.outcome).length },
  };
}
export type Journal = Awaited<ReturnType<typeof buildJournal>>;
