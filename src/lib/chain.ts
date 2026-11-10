import { SuiGrpcClient } from "@mysten/sui/grpc";

/**
 * Sui reads over gRPC (public JSON-RPC is deprecated). Tatum's Sui gateway is tried first;
 * if it rejects the request we fall back to a public fullnode and the result says so,
 * so the evidence label on every outcome is always truthful.
 */
const TATUM_GRPC = process.env.TATUM_SUI_GRPC_URL ?? "https://sui-mainnet-grpc.gateway.tatum.io";
const FULLNODE = "https://fullnode.mainnet.sui.io:443";

const withKey: typeof fetch = (u, i) => {
  const h = new Headers(i?.headers);
  if (process.env.TATUM_API_KEY) h.set("x-api-key", process.env.TATUM_API_KEY);
  return fetch(u, { ...i, headers: h });
};

const providers = () => [
  { name: "tatum-sui-grpc" as const, client: new SuiGrpcClient({ network: "mainnet", baseUrl: TATUM_GRPC, fetch: withKey }) },
  { name: "sui-fullnode-grpc" as const, client: new SuiGrpcClient({ network: "mainnet", baseUrl: FULLNODE }) },
];
export type ChainSource = "tatum-sui-grpc" | "sui-fullnode-grpc";

const mask = { paths: ["sequence_number", "summary.total_network_transactions", "summary.timestamp"] };
const cp = (c: any, n?: bigint) =>
  c.ledgerService.getCheckpoint({ checkpointId: n === undefined ? { oneofKind: undefined } : { oneofKind: "sequenceNumber", sequenceNumber: n }, readMask: mask })
    .then((r: any) => r.response.checkpoint);

export async function latestCheckpoint(): Promise<{ seq: number; timestampMs: number; source: ChainSource }> {
  let last: unknown;
  for (const p of providers()) {
    try {
      const c = await cp(p.client);
      return { seq: Number(c.sequenceNumber), timestampMs: Number(c.summary.timestamp.seconds) * 1000, source: p.name };
    } catch (e) { last = e; }
  }
  throw last;
}

/** Transactions in a single checkpoint = delta of the network's cumulative tx counter. */
export async function checkpointTxCount(seq: number): Promise<{ txs: number; timestampMs: number; source: ChainSource }> {
  let last: unknown;
  for (const p of providers()) {
    try {
      const [a, b] = await Promise.all([cp(p.client, BigInt(seq)), cp(p.client, BigInt(seq - 1))]);
      return {
        txs: Number(a.summary.totalNetworkTransactions) - Number(b.summary.totalNetworkTransactions),
        timestampMs: Number(a.summary.timestamp.seconds) * 1000,
        source: p.name,
      };
    } catch (e) { last = e; }
  }
  throw last;
}
