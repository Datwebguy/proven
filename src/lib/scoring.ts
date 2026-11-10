import type { CallRecord, OutcomeRecord, ProvenRecord } from "./types";

/** Prior strength: a source with 0 resolved calls is treated as `K` coin-flip calls. */
export const K = 3;
const COIN_BRIER = 0.25;

export type SourceStats = {
  source: string;
  resolved: number;
  open: number;
  brier: number;        // raw mean Brier on resolved calls (NaN-safe: 0.25 when none)
  postBrier: number;    // shrunk toward coin-flip
  hitRate: number;      // raw directional hit rate
  avgConfidence: number;// avg confidence in the side they picked
  weight: number;       // normalized trust weight (sums to 1 across sources)
  sample: boolean;
};

export type Joined = { call: CallRecord; outcome?: OutcomeRecord };

/** Rebuild call<->outcome pairs purely from recalled records (latest outcome wins). */
export function join(records: ProvenRecord[]): Joined[] {
  const calls = new Map<string, CallRecord>();
  const outs = new Map<string, OutcomeRecord>();
  for (const r of records) {
    if (r.kind === "CALL") calls.set(r.id, r);
    else if (r.kind === "OUTCOME") {
      const prev = outs.get(r.callId);
      if (!prev || prev.resolvedAt <= r.resolvedAt) outs.set(r.callId, r);
    }
  }
  return [...calls.values()].map((call) => ({ call, outcome: outs.get(call.id) }));
}

const brierOf = (conf: number, truth: boolean) => {
  const p = conf / 100;
  return (p - (truth ? 1 : 0)) ** 2;
};

export function sourceStats(joined: Joined[]): SourceStats[] {
  const by = new Map<string, Joined[]>();
  for (const j of joined) {
    const a = by.get(j.call.source) ?? [];
    a.push(j);
    by.set(j.call.source, a);
  }
  const raw = [...by.entries()].map(([source, js]) => {
    const done = js.filter((j) => j.outcome);
    const n = done.length;
    const brier = n ? done.reduce((s, j) => s + brierOf(j.call.confidence, j.outcome!.result), 0) / n : COIN_BRIER;
    const hits = done.filter((j) => (j.call.confidence >= 50) === j.outcome!.result).length;
    const side = done.map((j) => Math.max(j.call.confidence, 100 - j.call.confidence) / 100);
    const postBrier = (n * brier + K * COIN_BRIER) / (n + K);
    return {
      source,
      resolved: n,
      open: js.length - n,
      brier,
      postBrier,
      hitRate: n ? hits / n : 0.5,
      avgConfidence: n ? side.reduce((a, b) => a + b, 0) / n : 0.5,
      sample: js.every((j) => j.call.sample === true),
    };
  });
  // skill = improvement over coin flip; floor at a small epsilon so nobody is zeroed out
  const skill = raw.map((r) => Math.max(COIN_BRIER - r.postBrier, 0) + 0.005);
  const total = skill.reduce((a, b) => a + b, 0);
  return raw.map((r, i) => ({ ...r, weight: skill[i] / total }));
}

export type Opinion = {
  source: string;
  stated: number;   // confidence claim is true, 0-1
  adjusted: number; // calibration-adjusted
  weight: number;
};

/**
 * Memory-off: every source counts equally, stated confidence taken at face value.
 * Memory-on: trust weights from recalled history; each source's stated confidence is pulled
 * toward its *actual* hit rate when it has been over/under-confident.
 */
export function guidance(joined: Joined[], topic: string) {
  const stats = sourceStats(joined);
  const open = joined.filter((j) => !j.outcome && j.call.topic === topic);
  const latest = new Map<string, CallRecord>();
  for (const { call } of open) {
    const p = latest.get(call.source);
    if (!p || p.loggedAt <= call.loggedAt) latest.set(call.source, call);
  }
  const rows = [...latest.values()].map((call) => {
    const st = stats.find((s) => s.source === call.source)!;
    const stated = call.confidence / 100;
    const sideConf = Math.max(stated, 1 - stated);
    // Blend what they claim with what they actually achieve; evidence (n) decides the mix.
    const n = st.resolved;
    const side = Math.min(0.99, Math.max(0.5, (n * st.hitRate + K * sideConf) / (n + K)));
    const adjusted = stated >= 0.5 ? side : 1 - side;
    return { source: call.source, stated, adjusted, weight: st.weight, callId: call.id };
  });
  const off = rows.length ? rows.reduce((s, r) => s + r.stated, 0) / rows.length : 0.5;
  const wsum = rows.reduce((s, r) => s + r.weight, 0) || 1;
  const on = rows.length ? rows.reduce((s, r) => s + r.adjusted * r.weight, 0) / wsum : 0.5;
  const rankOff = [...rows].sort((a, b) => a.source.localeCompare(b.source)).map((r) => r.source);
  const rankOn = [...rows].sort((a, b) => b.weight - a.weight).map((r) => r.source);
  return { rows, off, on, rankOff, rankOn, stats };
}

/** Reliability table for the user's own journal: stated confidence bucket vs actual hit rate. */
export function reliability(joined: Joined[], source: string) {
  const buckets = [
    { lo: 50, hi: 60 }, { lo: 60, hi: 70 }, { lo: 70, hi: 80 }, { lo: 80, hi: 90 }, { lo: 90, hi: 101 },
  ].map((b) => ({ ...b, n: 0, hits: 0 }));
  for (const j of joined) {
    if (j.call.source !== source || !j.outcome) continue;
    const side = Math.max(j.call.confidence, 100 - j.call.confidence);
    const b = buckets.find((x) => side >= x.lo && side < x.hi);
    if (!b) continue;
    b.n++;
    if ((j.call.confidence >= 50) === j.outcome.result) b.hits++;
  }
  return buckets.filter((b) => b.n);
}
