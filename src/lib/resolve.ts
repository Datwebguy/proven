import { latestCheckpoint } from "./chain";
import { priceAt } from "./tatum";
import type { CallRecord, OutcomeRecord } from "./types";

/** A candle is final one minute after it opens; wait for the deadline's candle to close. */
export const isDue = (c: Pick<CallRecord, "deadline">, now = Date.now()) => Date.parse(c.deadline) + 60_000 <= now;

/** Same claim + same deadline => one outcome shared by every call on it. */
export const claimKey = (c: CallRecord) => `${c.check.type}|${c.check.symbol}|${c.check.usd}|${c.deadline}`;

/**
 * Decide a group of calls that share one claim, from Tatum's price at the exact deadline.
 * The outcome is anchored to the current Sui checkpoint (read through Tatum's Sui gateway).
 */
export async function resolveGroup(calls: CallRecord[]): Promise<OutcomeRecord> {
  const c = calls[0];
  if (!isDue(c)) throw new Error("deadline has not passed yet");
  const [{ usd }, cp] = await Promise.all([
    priceAt(c.check.symbol, Date.parse(c.deadline)),
    latestCheckpoint().catch(() => null),
  ]);
  const result = c.check.type === "price_above" ? usd > c.check.usd : usd < c.check.usd;
  return {
    kind: "OUTCOME",
    callIds: calls.map((x) => x.id),
    result,
    observedUsd: usd,
    evidence: "tatum-ohlcv",
    ...(cp ? { checkpoint: cp.seq, checkpointSource: cp.source } : {}),
    resolvedAt: new Date().toISOString(),
  };
}
