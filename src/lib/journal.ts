import { loadAll } from "./memory";
import { guidance, join, learningCurve, provenScore, scoreLabel, sourceStats } from "./scoring";
import { STRATEGIES } from "./strategies";
import { ASSETS } from "./tatum";
import { claimText } from "./types";

/** Everything the page shows is derived here from records recalled from Walrus Memory. */
export async function buildJournal() {
  const { records, stored, recalled, rebuiltAt } = await loadAll();
  const joined = join(records.map((r) => r.record));

  const blobOfCall = new Map<string, string>();
  const blobOfOutcome = new Map<string, string>();
  for (const r of records) {
    if (r.record.kind === "CALL") blobOfCall.set(r.record.id, r.blobId);
    if (r.record.kind === "OUTCOME") for (const id of r.record.callIds) blobOfOutcome.set(id, r.blobId);
  }

  const assets = [...new Set(joined.map((j) => j.call.asset))].sort();
  const sources = sourceStats(joined).sort((a, b) => b.weight - a.weight);
  // Answer every asset's open question at once, so switching assets needs no new request.
  const questions = Object.fromEntries(
    ASSETS.map((a) => {
      const g = guidance(joined, a);
      return [a, g.claim ? { claim: claimText(g.claim), deadline: g.claim.deadline, off: g.off, on: g.on, rankOff: g.rankOff, rankOn: g.rankOn, rows: g.rows } : null];
    }),
  );

  return {
    memory: { stored, recalled, complete: recalled >= stored, account: process.env.MEMWAL_ACCOUNT_ID ?? "", rebuiltAt },
    assets,
    questions,
    sources: sources.map((s) => {
      const score = provenScore(s);
      return { ...s, score, label: scoreLabel(score, s.resolved), rule: STRATEGIES.find((x) => x.name === s.source)?.rule ?? null };
    }),
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
