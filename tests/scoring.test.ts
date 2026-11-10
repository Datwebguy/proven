import { describe, expect, it } from "vitest";
import { guidance, join, learningCurve, sourceStats } from "../src/lib/scoring";
import { STRATEGIES } from "../src/lib/strategies";
import { decode, encode } from "../src/lib/codec";
import type { CallRecord, OutcomeRecord, ProvenRecord } from "../src/lib/types";

const call = (id: string, source: string, conf: number, deadline = "2026-01-01T00:00:00Z", asset = "SUI"): CallRecord => ({
  kind: "CALL", id, source, origin: "strategy", asset,
  check: { type: "price_above", symbol: asset, usd: 1 }, confidence: conf, deadline, loggedAt: "2025-12-31T00:00:00Z",
});
const out = (ids: string[], result: boolean, at = "2026-01-02T00:00:00Z"): OutcomeRecord => ({
  kind: "OUTCOME", callIds: ids, result, observedUsd: 1, evidence: "tatum-ohlcv", resolvedAt: at,
});

function history(): ProvenRecord[] {
  const recs: ProvenRecord[] = [];
  for (let i = 0; i < 6; i++) {
    const d = `2026-01-0${i + 1}T00:00:00Z`;
    recs.push(call(`g${i}`, "Good", 80, d), call(`b${i}`, "Bad", 90, d), out([`g${i}`, `b${i}`], i % 3 !== 0 ? true : true));
  }
  // Bad says 90% "up" on claims that went down
  for (let i = 0; i < 6; i++) {
    const d = `2026-01-1${i}T00:00:00Z`;
    recs.push(call(`g2${i}`, "Good", 25, d), call(`b2${i}`, "Bad", 90, d), out([`g2${i}`, `b2${i}`], false));
  }
  recs.push(call("og", "Good", 70, "2026-02-01T00:00:00Z"), call("ob", "Bad", 95, "2026-02-01T00:00:00Z"));
  return recs;
}

describe("scoring", () => {
  it("trusts the calibrated source over the overconfident one, weights sum to 1", () => {
    const s = sourceStats(join(history()));
    const good = s.find((x) => x.source === "Good")!, bad = s.find((x) => x.source === "Bad")!;
    expect(good.weight).toBeGreaterThan(bad.weight);
    expect(s.reduce((a, b) => a + b.weight, 0)).toBeCloseTo(1);
  });

  it("one outcome record settles every call on the same claim", () => {
    const j = join(history());
    expect(j.filter((x) => x.outcome).length).toBe(24);
    expect(j.filter((x) => !x.outcome).length).toBe(2);
  });

  it("memory changes the answer and the ranking on the same question", () => {
    const g = guidance(join(history()), "SUI");
    expect(g.rankOff[0]).toBe("Bad");   // loudest first without memory
    expect(g.rankOn[0]).toBe("Good");   // track record first with memory
    expect(g.on).not.toBeCloseTo(g.off, 2);
    const bad = g.rows.find((r) => r.source === "Bad")!;
    expect(bad.adjusted).toBeLessThan(bad.stated);
  });

  it("is pure: record order does not change the result", () => {
    const a = guidance(join(history()), "SUI"), b = guidance(join([...history()].reverse()), "SUI");
    expect(b.rankOn).toEqual(a.rankOn);
    expect(b.on).toBeCloseTo(a.on);
  });

  it("with no history every source is trusted equally", () => {
    const g = guidance(join([call("a", "A", 80), call("b", "B", 60)]), "SUI");
    expect(g.rows[0].weight).toBeCloseTo(g.rows[1].weight);
  });

  it("learning curve starts flat and diverges as outcomes arrive", () => {
    const c = learningCurve(join(history()));
    expect(c.points[0].weights.Good).toBeCloseTo(c.points[0].weights.Bad);
    const last = c.points[c.points.length - 1].weights;
    expect(last.Good).toBeGreaterThan(last.Bad);
  });
});

describe("strategies", () => {
  const h = { now: 105, ago24h: 100, ago4h: 104 };
  it("produce probabilities in range from price history only", () => {
    for (const s of STRATEGIES) {
      const p = s.predict(h);
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    }
  });
  it("trend and mean reversion disagree on the same move", () => {
    const t = STRATEGIES.find((s) => s.id === "trend")!.predict(h);
    const r = STRATEGIES.find((s) => s.id === "revert")!.predict(h);
    expect(t).toBeGreaterThan(0.5);
    expect(r).toBeLessThan(0.5);
  });
});

describe("codec", () => {
  it("round-trips records and ignores foreign text", () => {
    const c = call("x", "X", 70);
    expect(decode(encode(c))).toEqual(c);
    expect(decode("hello")).toBeNull();
    expect(decode("PROVEN/1 {}")).toBeNull();
  });
});

import { provenScore } from "../src/lib/scoring";
describe("proven score", () => {
  it("is 50 for a coin flip, higher for good records, capped by small samples", () => {
    expect(provenScore({ resolved: 0, brier: 0 })).toBe(50);
    expect(provenScore({ resolved: 20, brier: 0.1 })).toBeGreaterThan(provenScore({ resolved: 20, brier: 0.3 }));
    expect(provenScore({ resolved: 1, brier: 0 })).toBeLessThan(provenScore({ resolved: 30, brier: 0 }));
  });
});

import { parseCall, isPostUrl } from "../src/lib/xpost";
describe("post import", () => {
  it("reads asset, direction, price and stated confidence from a post", () => {
    expect(parseCall("$SUI to $1.20 by Friday, 80% sure")).toEqual({ asset: "SUI", direction: "above", usd: 1.2, confidence: 80 });
    expect(parseCall("Bitcoin dumps below 70k this week")).toMatchObject({ asset: "BTC", direction: "below", usd: 70000 });
    expect(parseCall("ETH breaking $2,500 soon")).toMatchObject({ asset: "ETH", direction: "above", usd: 2500 });
    expect(parseCall("gm everyone")).toMatchObject({ asset: null, usd: null });
  });
  it("accepts x.com and twitter.com post links only", () => {
    expect(isPostUrl("https://x.com/someone/status/1855000123")).toBe(true);
    expect(isPostUrl("https://twitter.com/someone/status/1855123")).toBe(true);
    expect(isPostUrl("https://example.com/post/1")).toBe(false);
  });
});
