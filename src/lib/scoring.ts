import type { CallRecord, OutcomeRecord, ProvenRecord } from "./types";

/**
 * Pure scoring. Everything here is a function of the records recalled from memory:
 * same records in, same ranking out. Nothing is cached and nothing is set by hand.
 */

/** Prior strength: a source with no history is treated like K coin-flip calls. */
export const K = 3;
const COIN_BRIER = 0.25;

export type Joined = { call: CallRecord; outcome?: OutcomeRecord };

export function join(records: ProvenRecord[]): Joined[] {
  const calls = new Map<string, CallRecord>();
  const outcomeOf = new Map<string, OutcomeRecord>();
  for (const r of records) {
    if (r.kind === "CALL") calls.set(r.id, r);
    if (r.kind === "OUTCOME") {
      for (const id of r.callIds) {
        const prev = outcomeOf.get(id);
        if (!prev || prev.resolvedAt <= r.resolvedAt) outcomeOf.set(id, r);
      }
    }
  }
  return [...calls.values()].map((call) => ({ call, outcome: outcomeOf.get(call.id) }));
}

const brierOf = (conf: number, truth: boolean) => (conf / 100 - (truth ? 1 : 0)) ** 2;
const sideOf = (conf: number) => Math.max(conf, 100 - conf) / 100;
const hit = (j: Joined) => (j.call.confidence >= 50) === j.outcome!.result;

export type SourceStats = {
  source: string;
  origin: CallRecord["origin"];
  resolved: number;
  open: number;
  brier: number;         // mean Brier over resolved calls (0 best, 1 worst)
  hitRate: number;       // share of resolved calls where the side they picked happened
  avgConfidence: number; // average confidence in the side they picked
  weight: number;        // trust: normalized, sums to 1 across sources
};

export function sourceStats(joined: Joined[]): SourceStats[] {
  const by = new Map<string, Joined[]>();
  for (const j of joined) by.set(j.call.source, [...(by.get(j.call.source) ?? []), j]);

  const raw = [...by.entries()].map(([source, js]) => {
    const done = js.filter((j) => j.outcome);
    const n = done.length;
    const brier = n ? done.reduce((s, j) => s + brierOf(j.call.confidence, j.outcome!.result), 0) / n : COIN_BRIER;
    return {
      source,
      origin: js[0].call.origin,
      resolved: n,
      open: js.length - n,
      brier,
      postBrier: (n * brier + K * COIN_BRIER) / (n + K),
      hitRate: n ? done.filter(hit).length / n : 0,
      avgConfidence: n ? done.reduce((s, j) => s + sideOf(j.call.confidence), 0) / n : 0,
    };
  });
  // Skill = improvement over a coin flip. A small floor keeps every source in play.
  const skill = raw.map((r) => Math.max(COIN_BRIER - r.postBrier, 0) + 0.005);
  const total = skill.reduce((a, b) => a + b, 0);
  return raw.map(({ postBrier: _p, ...r }, i) => ({ ...r, weight: skill[i] / total }));
}

/**
 * "How confident should I be?" Blend a stated confidence with how often this source is actually right.
 * With no history the stated number stands; the more results, the more the record outweighs the words.
 * Returns the corrected probability that the claim is true.
 */
export function adjustConfidence(record: { resolved: number; hitRate: number }, statedPct: number): number {
  const stated = statedPct / 100;
  const side = Math.max(stated, 1 - stated);
  const n = record.resolved;
  const blended = Math.min(0.99, Math.max(0.5, (n * record.hitRate + K * side) / (n + K)));
  return stated >= 0.5 ? blended : 1 - blended;
}

/** When a source says roughly X% sure, how often is it right? Buckets by stated confidence in the chosen side. */
export function reliability(calls: { confidence: number; result: boolean }[]) {
  const buckets = [
    { lo: 50, hi: 60, label: "50–59%" },
    { lo: 60, hi: 70, label: "60–69%" },
    { lo: 70, hi: 80, label: "70–79%" },
    { lo: 80, hi: 90, label: "80–89%" },
    { lo: 90, hi: 101, label: "90–99%" },
  ].map((b) => ({ ...b, n: 0, hits: 0, claimed: 0 }));
  for (const c of calls) {
    const side = Math.max(c.confidence, 100 - c.confidence);
    const b = buckets.find((x) => side >= x.lo && side < x.hi);
    if (!b) continue;
    b.n++;
    b.claimed += side / 100;
    if ((c.confidence >= 50) === c.result) b.hits++;
  }
  return buckets.filter((b) => b.n).map((b) => ({ label: b.label, n: b.n, claimed: b.claimed / b.n, actual: b.hits / b.n }));
}

/**
 * Proven score, 0-100: one number per source, like a credit score.
 * 50 = coin-flip quality. It uses the same small-sample caution as trust (K coin-flip calls up front),
 * so a short lucky streak cannot reach the top. 100 would be always right and always sure.
 */
export function provenScore(s: { resolved: number; brier: number }): number {
  const post = (s.resolved * s.brier + K * COIN_BRIER) / (s.resolved + K);
  return Math.round(Math.max(0, Math.min(100, 100 * (1 - 2 * post))));
}

export function scoreLabel(score: number, resolved: number): string {
  if (resolved < 3) return "Building a record";
  if (score >= 65) return "Strong";
  if (score >= 55) return "Good";
  if (score >= 51) return "Slight edge";
  if (score >= 45) return "Coin flip";
  return "Poor";
}

export type Opinion = { source: string; callId: string; stated: number; adjusted: number; weight: number };

/**
 * Answer "how likely is this asset's open claim, and whom should I trust?" two ways.
 * Without memory: every source counts the same, stated confidence at face value.
 * With memory: trust from track record, and each stated confidence blended with how often that
 * source is actually right (more history => more weight on the record than on the claim).
 */
export function guidance(joined: Joined[], asset: string) {
  const stats = sourceStats(joined);
  const open = joined.filter((j) => !j.outcome && j.call.asset === asset);

  // Group open calls by claim; answer for the claim most sources are talking about.
  const groups = new Map<string, Joined[]>();
  for (const j of open) {
    const k = `${j.call.check.type}|${j.call.check.usd}|${j.call.deadline}`;
    groups.set(k, [...(groups.get(k) ?? []), j]);
  }
  const focus = [...groups.values()].sort((a, b) => b.length - a.length || a[0].call.deadline.localeCompare(b[0].call.deadline))[0] ?? [];

  const rows: Opinion[] = focus.map(({ call }) => {
    const st = stats.find((s) => s.source === call.source)!;
    return { source: call.source, callId: call.id, stated: call.confidence / 100, adjusted: adjustConfidence(st, call.confidence), weight: st.weight };
  });

  const off = rows.length ? rows.reduce((s, r) => s + r.stated, 0) / rows.length : 0.5;
  const wsum = rows.reduce((s, r) => s + r.weight, 0) || 1;
  const on = rows.length ? rows.reduce((s, r) => s + r.adjusted * r.weight, 0) / wsum : 0.5;
  return {
    claim: focus[0]?.call ?? null,
    rows,
    off,
    on,
    rankOff: [...rows].sort((a, b) => b.stated - a.stated).map((r) => r.source),
    rankOn: [...rows].sort((a, b) => b.weight - a.weight).map((r) => r.source),
  };
}

/** Trust per source after each resolved deadline, oldest first: how the trust was learned. */
export function learningCurve(joined: Joined[]) {
  const resolved = joined.filter((j) => j.outcome);
  const steps = [...new Set(resolved.map((j) => j.call.deadline))].sort();
  const sources = [...new Set(joined.map((j) => j.call.source))];
  const points = [{ at: "", weights: Object.fromEntries(sources.map((s) => [s, 1 / sources.length])) as Record<string, number> }];
  for (const d of steps) {
    const upTo = joined.map((j) => (j.outcome && j.call.deadline <= d ? j : { call: j.call }));
    points.push({ at: d, weights: Object.fromEntries(sourceStats(upTo).map((s) => [s.source, s.weight])) });
  }
  return { sources, points };
}
