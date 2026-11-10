import { priceAt } from "./tatum";

/**
 * Rule-based forecasters. Each one reads only Tatum prices from BEFORE the moment it makes a call,
 * and states a direction plus a confidence. None of them know the outcome, and none of their
 * trust is set by hand: Proven learns how much to trust each one from resolved calls in memory.
 */
export type Strategy = {
  id: string;
  name: string;
  rule: string;
  /** Returns the probability (0-1) that price will be HIGHER after the horizon. */
  predict: (h: { now: number; ago24h: number; ago4h: number }) => number;
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const strength = (move: number, scale: number) => clamp(Math.abs(move) / scale, 0, 1); // 0..1

export const STRATEGIES: Strategy[] = [
  {
    id: "trend",
    name: "Trend Follower",
    rule: "Bets the last 24 hours' move continues. Bigger move, more confident.",
    predict: ({ now, ago24h }) => {
      const m = now / ago24h - 1;
      const c = 0.55 + 0.3 * strength(m, 0.05);
      return m >= 0 ? c : 1 - c;
    },
  },
  {
    id: "revert",
    name: "Mean Reverter",
    rule: "Bets the last 24 hours' move snaps back. Bigger move, more confident.",
    predict: ({ now, ago24h }) => {
      const m = now / ago24h - 1;
      const c = 0.55 + 0.3 * strength(m, 0.05);
      return m >= 0 ? 1 - c : c;
    },
  },
  {
    id: "momentum",
    name: "Momentum 4h",
    rule: "Follows the last 4 hours only. Cautious: never above 75%.",
    predict: ({ now, ago4h }) => {
      const m = now / ago4h - 1;
      const c = 0.52 + 0.23 * strength(m, 0.02);
      return m >= 0 ? c : 1 - c;
    },
  },
  {
    id: "bull",
    name: "Perma-Bull",
    rule: "Always says up, always 80% sure. The loud voice every feed has.",
    predict: () => 0.8,
  },
];

export const strategyById = (id: string) => STRATEGIES.find((s) => s.id === id);
export const strategyByName = (name: string) => STRATEGIES.find((s) => s.name === name);

/** Prices a strategy may look at when calling at time `t` (all at or before t). */
export async function historyAt(symbol: string, t: number) {
  const [now, ago24h, ago4h] = await Promise.all([
    priceAt(symbol, t),
    priceAt(symbol, t - 24 * 3600_000),
    priceAt(symbol, t - 4 * 3600_000),
  ]);
  return { now: now.usd, ago24h: ago24h.usd, ago4h: ago4h.usd };
}
