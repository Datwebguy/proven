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
    const stated = call.confidence / 100;
    const side = Math.max(stated, 1 - stated);
    const n = st.resolved;
    const blended = Math.min(0.99, Math.max(0.5, (n * st.hitRate + K * side) / (n + K)));
    return { source: call.source, callId: call.id, stated, adjusted: stated >= 0.5 ? blended : 1 - blended, weight: st.weight };
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
