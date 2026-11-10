import { ChannelCredentials } from "@grpc/grpc-js";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { readFileSync } from "node:fs";

/**
 * Sui mainnet reads over gRPC. Tatum's gateway speaks native gRPC (HTTP/2) and takes the API key
 * as `x-api-key` metadata. If it is unreachable we fall back to a public fullnode, and the caller is
 * told which one answered, so labels are always truthful.
 */
export type ChainSource = "tatum-sui-grpc" | "sui-fullnode-grpc";

const TATUM_HOST = (process.env.TATUM_SUI_GRPC_URL ?? "sui-mainnet-grpc.gateway.tatum.io").replace(/^https?:\/\//, "");
const FULLNODE = "https://fullnode.mainnet.sui.io:443";

function tatum(): SuiGrpcClient {
  const ca = process.env.GRPC_CA_BUNDLE ? readFileSync(process.env.GRPC_CA_BUNDLE) : undefined;
  const transport = new GrpcTransport({
    host: TATUM_HOST.includes(":") ? TATUM_HOST : `${TATUM_HOST}:443`,
    channelCredentials: ChannelCredentials.createSsl(ca),
    meta: { "x-api-key": process.env.TATUM_API_KEY ?? "" },
  });
  return new SuiGrpcClient({ network: "mainnet", transport });
}
const fullnode = () => new SuiGrpcClient({ network: "mainnet", baseUrl: FULLNODE });

async function head(client: SuiGrpcClient) {
  const r: any = await (client as any).ledgerService.getCheckpoint({
    checkpointId: { oneofKind: undefined },
    readMask: { paths: ["sequence_number", "summary.timestamp"] },
  });
  const c = r.response.checkpoint;
  return { seq: Number(c.sequenceNumber), timestampMs: Number(c.summary?.timestamp?.seconds ?? 0) * 1000 };
}

/** Tatum only, no fallback: used by the health check so the real answer is visible. */
export const tatumLatestCheckpoint = async () => (await head(tatum())).seq;

export async function latestCheckpoint(): Promise<{ seq: number; timestampMs: number; source: ChainSource }> {
  try {
    return { ...(await head(tatum())), source: "tatum-sui-grpc" };
  } catch {
    return { ...(await head(fullnode())), source: "sui-fullnode-grpc" };
  }
}
