/** Every record Proven writes to Walrus Memory is one of these, serialized as `PROVEN/1 {json}`. */
export type CallRecord = {
  kind: "CALL";
  id: string;
  source: string;        // who made the call (labeled sample sources in the demo)
  topic: string;         // e.g. "SUI", "SUI-onchain"
  claim: string;         // human readable claim
  /** Machine-checkable resolution rule so outcomes come from data, not opinion. */
  check: ResolutionCheck;
  confidence: number;    // 0-100, that the claim is TRUE
  deadline: string;      // ISO
  loggedAt: string;      // ISO
  notes?: string;
  sample?: boolean;      // true = labeled seeded/simulated source
};

export type ResolutionCheck =
  | { type: "price_above"; symbol: string; usd: number }
  | { type: "price_below"; symbol: string; usd: number }
  | { type: "sui_checkpoint_txs_above"; checkpoint: number; count: number }
  | { type: "sui_checkpoint_txs_below"; checkpoint: number; count: number }
  | { type: "manual" };

export type OutcomeRecord = {
  kind: "OUTCOME";
  callId: string;
  result: boolean;       // was the claim true
  observed: string;      // e.g. "checkpoint 123 had 412 txs"
  evidence: "tatum-price" | "tatum-sui-grpc" | "sui-fullnode-grpc" | "manual";
  resolvedAt: string;
};

export type CalibrationRecord = {
  kind: "CALIBRATION";
  source: string;
  n: number;
  brier: number;
  weight: number;
  at: string;
};

export type ProvenRecord = CallRecord | OutcomeRecord | CalibrationRecord;

export type Recalled = { blobId: string; createdAt?: string; record: ProvenRecord };
