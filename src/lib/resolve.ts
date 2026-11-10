import { checkpointTxCount } from "./chain";
import { spotUsd } from "./tatum";
import type { CallRecord, OutcomeRecord } from "./types";

/** Decide a claim from real data. Throws if the deadline hasn't passed or the check is manual. */
export async function resolveClaim(call: CallRecord): Promise<Omit<OutcomeRecord, "callId">> {
  if (Date.parse(call.deadline) > Date.now()) throw new Error(`deadline ${call.deadline} has not passed`);
  const ck = call.check;
  const resolvedAt = new Date().toISOString();
  if (ck.type === "price_above" || ck.type === "price_below") {
    const { usd, at } = await spotUsd(ck.symbol);
    const lagMin = Math.round((at - Date.parse(call.deadline)) / 60000);
    const result = ck.type === "price_above" ? usd > ck.usd : usd < ck.usd;
    return {
      kind: "OUTCOME",
      result,
      evidence: "tatum-price",
      resolvedAt,
      observed: `${ck.symbol}/USD = $${usd} from Tatum Data API, ${lagMin} min after deadline; strike $${ck.usd}`,
    };
  }
  if (ck.type === "sui_checkpoint_txs_above" || ck.type === "sui_checkpoint_txs_below") {
    const c = await checkpointTxCount(ck.checkpoint);
    const result = ck.type === "sui_checkpoint_txs_above" ? c.txs > ck.count : c.txs < ck.count;
    return {
      kind: "OUTCOME",
      result,
      evidence: c.source,
      resolvedAt,
      observed: `checkpoint ${ck.checkpoint} had ${c.txs} transactions (threshold ${ck.count}) via ${c.source}`,
    };
  }
  throw new Error("manual claims need an explicit result");
}
