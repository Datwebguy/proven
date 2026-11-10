import { SuiGrpcClient } from "@mysten/sui/grpc";
async function main() {
  const c: any = new SuiGrpcClient({ network: "mainnet", baseUrl: "https://fullnode.mainnet.sui.io:443" });
  const latest = await c.ledgerService.getCheckpoint({ checkpointId: { oneofKind: undefined }, readMask: { paths: ["sequence_number", "summary.total_network_transactions", "summary.timestamp"] } });
  const cp = latest.response.checkpoint;
  console.log("latest", String(cp.sequenceNumber), String(cp.summary?.totalNetworkTransactions), JSON.stringify(cp.summary?.timestamp, (_k, v) => typeof v === "bigint" ? String(v) : v));
  const n = BigInt(cp.sequenceNumber) - 200000n;
  const r = await c.ledgerService.getCheckpoint({ checkpointId: { oneofKind: "sequenceNumber", sequenceNumber: n }, readMask: { paths: ["sequence_number", "summary.total_network_transactions", "summary.timestamp"] } });
  const r2 = await c.ledgerService.getCheckpoint({ checkpointId: { oneofKind: "sequenceNumber", sequenceNumber: n - 1n }, readMask: { paths: ["sequence_number", "summary.total_network_transactions"] } });
  console.log("cp", String(n), "txs=", Number(r.response.checkpoint.summary.totalNetworkTransactions) - Number(r2.response.checkpoint.summary.totalNetworkTransactions), JSON.stringify(r.response.checkpoint.summary.timestamp, (_k, v) => typeof v === "bigint" ? String(v) : v));
}
main().catch((e) => console.log("ERR", e.message));
