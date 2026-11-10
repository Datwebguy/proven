import { config } from "dotenv"; config({ path: ".env.local" });
import { SuiGrpcClient } from "@mysten/sui/grpc";
async function main() {
  const c = new SuiGrpcClient({ network: "mainnet", baseUrl: "https://fullnode.mainnet.sui.io:443" });
  const a = process.env.MEMWAL_ACCOUNT_ID!;
  const r: any = await c.listOwnedObjects({ owner: a, limit: 50 } as any);
  console.log("owned objects:", r.objects?.length);
  for (const o of r.objects ?? []) console.log(" -", o.objectId, o.type);
  const b: any = await c.getBalance({ owner: a } as any).catch((e: any) => ({ err: e.message }));
  console.log("SUI balance:", JSON.stringify(b, (_, v) => (typeof v === "bigint" ? String(v) : v)).slice(0, 200));
}
main().catch((e) => console.log("ERR", e.message));
