import { describe, it, expect } from "vitest";
import { guidance, join, learningCurve, reliability, sourceStats } from "../src/lib/scoring";
import type { ProvenRecord } from "../src/lib/types";

const call = (id: string, source: string, conf: number, topic = "SUI"): ProvenRecord => ({
  kind: "CALL", id, source, topic, claim: "x", check: { type: "manual" }, confidence: conf,
  deadline: "2026-01-01T00:00:00Z", loggedAt: "2026-01-01T00:00:00Z", sample: true,
});
const out = (callId: string, result: boolean): ProvenRecord => ({
  kind: "OUTCOME", callId, result, observed: "", evidence: "manual", resolvedAt: "2026-01-02T00:00:00Z",
});

describe("scoring", () => {
  const recs: ProvenRecord[] = [];
  for (let i = 0; i < 6; i++) {
    recs.push(call(`g${i}`, "Good", 80), out(`g${i}`, true));
    recs.push(call(`b${i}`, "Bad", 90), out(`b${i}`, false));
  }
  recs.push(call("og", "Good", 70), call("ob", "Bad", 95));

  it("weights the calibrated source above the overconfident one", () => {
    const s = sourceStats(join(recs));
    const good = s.find((x) => x.source === "Good")!, bad = s.find((x) => x.source === "Bad")!;
    expect(good.weight).toBeGreaterThan(bad.weight);
    expect(s.reduce((a, b) => a + b.weight, 0)).toBeCloseTo(1);
  });

  it("memory-on differs from memory-off and reorders sources", () => {
    const g = guidance(join(recs), "SUI");
    expect(g.rankOn[0]).toBe("Good");
    expect(g.on).not.toBeCloseTo(g.off, 3);
    const good = g.rows.find((r) => r.source === "Good")!, bad = g.rows.find((r) => r.source === "Bad")!;
    expect(bad.adjusted).toBeLessThan(bad.stated - 0.3); // overconfident 95% collapses toward a coin flip
    expect(good.adjusted).toBeGreaterThan(good.stated);  // under-confident but right: boosted
  });

  it("learning curve starts flat and diverges as outcomes resolve", () => {
    const dated = recs.map((r, i) => (r.kind === "CALL" ? { ...r, deadline: `2026-01-${String(1 + (i >> 2)).padStart(2, "0")}T00:00:00Z` } : r));
    const c = learningCurve(join(dated));
    expect(c.points[0].weights["Good"]).toBeCloseTo(c.points[0].weights["Bad"]);
    const last = c.points[c.points.length - 1].weights;
    expect(last["Good"]).toBeGreaterThan(last["Bad"]);
    for (const p of c.points) expect(Object.values(p.weights).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("reliability buckets compare stated confidence with actual hit rate", () => {
    const r = reliability(join(recs), "Bad");
    expect(r).toHaveLength(1);
    expect(r[0].hits).toBe(0); // 90% stated, never right
    expect(r[0].n).toBe(6);
  });

  it("the same recalled records always produce the same ranking (pure, no hidden state)", () => {
    const a = guidance(join(recs), "SUI"), b = guidance(join([...recs].reverse()), "SUI");
    expect(b.rankOn).toEqual(a.rankOn);
    expect(b.on).toBeCloseTo(a.on);
  });

  it("with no history, memory-on equals a flat prior (no invented trust)", () => {
    const g = guidance(join([call("a", "A", 80), call("b", "B", 60)]), "SUI");
    expect(g.rows[0].weight).toBeCloseTo(g.rows[1].weight);
  });
});
