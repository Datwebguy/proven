import { loadAll } from "./memory";
import { join, provenScore, reliability, scoreLabel, sourceStats } from "./scoring";
import { strategyByName } from "./strategies";
import { claimText } from "./types";

/** One source's public record, rebuilt from Walrus Memory. Null if the source has never made a call. */
export async function getRecord(name: string) {
  const { records } = await loadAll();
  const joined = join(records.map((r) => r.record));
  const all = sourceStats(joined).sort((a, b) => b.weight - a.weight);
  const idx = all.findIndex((s) => s.source.toLowerCase() === name.toLowerCase());
  if (idx < 0) return null;
  const st = all[idx];

  const blobOfCall = new Map<string, string>();
  for (const r of records) if (r.record.kind === "CALL") blobOfCall.set(r.record.id, r.blobId);

  const mine = joined.filter((j) => j.call.source === st.source).sort((a, b) => b.call.deadline.localeCompare(a.call.deadline));
  const done = mine.filter((j) => j.outcome);
  const score = provenScore(st);
  return {
    source: st.source,
    origin: st.origin,
    rule: strategyByName(st.source)?.rule ?? null,
    rank: idx + 1,
    of: all.length,
    trust: st.weight,
    score,
    label: scoreLabel(score, st.resolved),
    resolved: st.resolved,
    hitRate: st.hitRate,
    avgConfidence: st.avgConfidence,
    reliability: reliability(done.map((j) => ({ confidence: j.call.confidence, result: j.outcome!.result }))),
    calls: mine.slice(0, 40).map((j) => ({
      id: j.call.id,
      claim: claimText(j.call),
      confidence: j.call.confidence,
      deadline: j.call.deadline,
      link: j.call.link ?? null,
      receipt: blobOfCall.get(j.call.id) ?? null,
      right: j.outcome ? j.outcome.result === (j.call.confidence >= 50) : null,
    })),
  };
}
export type Record = NonNullable<Awaited<ReturnType<typeof getRecord>>>;
