import { STRATEGIES, historyAt } from "./strategies";
import { ASSETS } from "./tatum";
import type { CallRecord } from "./types";

export const HORIZON_HOURS = Number(process.env.ROUND_HORIZON_HOURS ?? 4);

/**
 * Every strategy makes one call per asset at time `t`: "price higher than now after the horizon".
 * Inputs are Tatum prices at or before `t` only.
 */
export async function strategyCalls(t: number, hours = HORIZON_HOURS, assets: readonly string[] = ASSETS): Promise<CallRecord[]> {
  const out: CallRecord[] = [];
  for (const asset of assets) {
    const h = await historyAt(asset, t);
    const deadline = new Date(t + hours * 3600_000).toISOString();
    for (const s of STRATEGIES) {
      out.push({
        kind: "CALL",
        id: `${s.id}-${asset}-${t}`.toLowerCase(),
        source: s.name,
        origin: "strategy",
        asset,
        check: { type: "price_above", symbol: asset, usd: h.now },
        confidence: Math.round(s.predict(h) * 100),
        deadline,
        loggedAt: new Date(t).toISOString(),
        note: `${hours}h horizon · price at call $${h.now}`,
      });
    }
  }
  return out;
}
