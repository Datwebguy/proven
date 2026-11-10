import { loadAll } from "./memory";
import { guidance, join, learningCurve, sourceStats } from "./scoring";
import { STRATEGIES } from "./strategies";
import { claimText } from "./types";

/** Everything the page shows is derived here from records recalled from Walrus Memory. */
export async function buildJournal(asset: string) {
  const { records, stored, recalled } = await loadAll();
  const joined = join(records.map((r) => r.record));

  const blobOfCall = new Map<string, string>();
  const blobOfOutcome = new Map<string, string>();
  for (const r of records) {
    if (r.record.kind === "CALL") blobOfCall.set(r.record.id, r.blobId);
    if (r.record.kind === "OUTCOME") for (const id of r.record.callIds) blobOfOutcome.set(id, r.blobId);
  }

  const g = guidance(joined, asset);
  const assets = [...new Set(joined.map((j) => j.call.asset))].sort();
  const sources = sourceStats(joined).sort((a, b) => b.weight - a.weight);

  return {
    memory: { stored, recalled, complete: recalled >= stored, account: process.env.MEMWAL_ACCOUNT_ID ?? "" },
    asset,
    assets,
    question: g.claim
      ? { claim: claimText(g.claim), deadline: g.claim.deadline, off: g.off, on: g.on, rankOff: g.rankOff, rankOn: g.rankOn, rows: g.rows }
      : null,
    sources: sources.map((s) => ({ ...s, rule: STRATEGIES.find((x) => x.name === s.source)?.rule ?? null })),
    curve: learningCurve(joined),
    calls: joined
      .map(({ call, outcome }) => ({
        id: call.id,
        source: call.source,
        origin: call.origin,
        asset: call.asset,
        claim: claimText(call),
        confidence: call.confidence,
        deadline: call.deadline,
        loggedAt: call.loggedAt,
        link: call.link ?? null,
        receipt: blobOfCall.get(call.id) ?? null,
        outcome: outcome
          ? { result: outcome.result, observedUsd: outcome.observedUsd, checkpoint: outcome.checkpoint ?? null, receipt: blobOfOutcome.get(call.id) ?? null }
          : null,
      }))
      .sort((a, b) => b.deadline.localeCompare(a.deadline)),
    counts: {
      calls: joined.length,
      resolved: joined.filter((j) => j.outcome).length,
      snapshots: records.filter((r) => r.record.kind === "CALIBRATION").length,
    },
  };
}
export type Journal = Awaited<ReturnType<typeof buildJournal>>;
