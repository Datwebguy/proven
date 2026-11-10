/**
 * Every record Proven writes to Walrus Memory is one of these, serialized as `PROVEN/2 {json}`.
 * Records are append-only: an outcome never edits a call, it is a new record that points at it.
 */

/** A claim that price will finish above or below a reference price at the deadline. */
export type PriceCheck = { type: "price_above" | "price_below"; symbol: string; usd: number };

export type CallRecord = {
  kind: "CALL";
  id: string;
  source: string;                       // display name of who made the call
  origin: "strategy" | "person";        // rule-based strategy, or a person logging their own call
  asset: string;                        // SUI | SOL | BTC | ETH
  check: PriceCheck;
  confidence: number;                   // 0-100: probability the claim is TRUE
  deadline: string;                     // ISO
  loggedAt: string;                     // ISO
  note?: string;
};

export type OutcomeRecord = {
  kind: "OUTCOME";
  callIds: string[];                    // every call that shares this claim and deadline
  result: boolean;                      // did the claim come true
  observedUsd: number;                  // Tatum price at the deadline
  evidence: "tatum-ohlcv";
  checkpoint?: number;                  // Sui checkpoint at resolution time
  checkpointSource?: "tatum-sui-grpc" | "sui-fullnode-grpc";
  resolvedAt: string;
};

export type CalibrationRecord = {
  kind: "CALIBRATION";
  source: string;
  resolved: number;
  brier: number;
  weight: number;
  at: string;
};

export type ProvenRecord = CallRecord | OutcomeRecord | CalibrationRecord;
export type Recalled = { blobId: string; createdAt?: string; record: ProvenRecord };

export const claimText = (c: Pick<CallRecord, "check">) =>
  `${c.check.symbol} ${c.check.type === "price_above" ? "above" : "below"} $${fmtUsd(c.check.usd)}`;

export function fmtUsd(x: number) {
  if (x >= 1000) return x.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (x >= 1) return x.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return x.toLocaleString("en-US", { maximumFractionDigits: 4 });
}
