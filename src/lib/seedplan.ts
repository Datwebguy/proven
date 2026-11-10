import type { CallRecord } from "./types";

/** Labeled SAMPLE forecasters. Not real people. Hidden skill = chance their *side* is right. */
export const PERSONAS = [
  { source: "Sample · Sharp Sasha", skill: 0.85, conf: [72, 84] as const },
  { source: "Sample · Hype Hank", skill: 0.5, conf: [88, 97] as const },
  { source: "Sample · Steady Sam", skill: 0.68, conf: [60, 70] as const },
  { source: "Sample · Coinflip Cass", skill: 0.5, conf: [52, 90] as const },
];

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SEED = 20261110;
export const SAMPLE_NOTE =
  "SAMPLE: simulated forecaster, backfilled after the checkpoint finalized. Not a real person; not a prediction made in advance.";

export function simulateCall(
  r: () => number,
  p: (typeof PERSONAS)[number],
  id: string,
  truth: boolean,
  base: Omit<CallRecord, "id" | "source" | "confidence" | "notes" | "sample">,
): CallRecord {
  const right = r() < p.skill;
  const saysTrue = right ? truth : !truth;
  const side = Math.round(p.conf[0] + r() * (p.conf[1] - p.conf[0]));
  return { ...base, id, source: p.source, confidence: saysTrue ? side : 100 - side, notes: SAMPLE_NOTE, sample: true };
}
