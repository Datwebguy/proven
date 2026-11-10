import { ChannelCredentials } from "@grpc/grpc-js";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { readFileSync } from "node:fs";

/**
 * Sui reads over gRPC (public JSON-RPC is deprecated).
 * Tatum's gateway speaks native gRPC (HTTP/2) and takes the key as `x-api-key` metadata, so it is
 * reached with grpc-js. If Tatum rejects or is unreachable we fall back to a public fullnode and the
 * result says which one answered, so every outcome's evidence label is truthful.
 */
const TATUM_HOST = (process.env.TATUM_SUI_GRPC_URL ?? "https://sui-mainnet-grpc.gateway.tatum.io").replace(/^https?:\/\//, "");
const FULLNODE = "https://fullnode.mainnet.sui.io:443";

function tatumClient(): SuiGrpcClient {
  const ca = process.env.GRPC_CA_BUNDLE ? readFileSync(process.env.GRPC_CA_BUNDLE) : undefined; // sandbox proxy only
  const transport = new GrpcTransport({
    host: TATUM_HOST.includes(":") ? TATUM_HOST : `${TATUM_HOST}:443`,
    channelCredentials: ChannelCredentials.createSsl(ca),
    meta: { "x-api-key": process.env.TATUM_API_KEY ?? "" },
  });
  return new SuiGrpcClient({ network: "mainnet", transport });
}

const providers = () => [
  { name: "tatum-sui-grpc" as const, client: tatumClient() },
  { name: "sui-fullnode-grpc" as const, client: new SuiGrpcClient({ network: "mainnet", baseUrl: FULLNODE }) },
];
export type ChainSource = "tatum-sui-grpc" | "sui-fullnode-grpc";

const mask = { paths: ["sequence_number", "summary.total_network_transactions", "summary.timestamp"] };
const cp = (c: any, n?: bigint) =>
  c.ledgerService
    .getCheckpoint({ checkpointId: n === undefined ? { oneofKind: undefined } : { oneofKind: "sequenceNumber", sequenceNumber: n }, readMask: mask })
    .then((r: any) => r.response.checkpoint);

/** Ask Tatum only (no fallback). Used by /api/health so the real answer is visible. */
export async function tatumLatestCheckpoint(): Promise<number> {
  return Number((await cp(tatumClient())).sequenceNumber);
}

export async function latestCheckpoint(): Promise<{ seq: number; timestampMs: number; source: ChainSource }> {
  let last: unknown;
  for (const p of providers()) {
    try {
      const c = await cp(p.client);
      return { seq: Number(c.sequenceNumber), timestampMs: Number(c.summary.timestamp.seconds) * 1000, source: p.name };
    } catch (e) {
      last = e;
    }
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
    } catch (e) {
      last = e;
    }
  }
  throw last;
}
