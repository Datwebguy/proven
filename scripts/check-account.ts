import { config } from "dotenv"; config({ path: ".env.local" });
import { delegateKeyToPublicKey } from "@mysten-incubation/memwal";
import { SuiGrpcClient } from "@mysten/sui/grpc";

async function main() {
  const id = process.env.MEMWAL_ACCOUNT_ID!, k = process.env.MEMWAL_PRIVATE_KEY!;
  const pk = Buffer.from(await delegateKeyToPublicKey(k)).toString("hex");
  console.log("derived delegate pubkey:", pk);
  const base = process.env.SUI_GRPC_URL ?? "https://fullnode.mainnet.sui.io:443";
  const c = new SuiGrpcClient({ network: "mainnet", baseUrl: base });
  const { object } = await c.getObject({ objectId: id, include: { json: true } } as any) as any;
  console.log("object type:", object?.type, "| owner:", JSON.stringify(object?.owner)?.slice(0, 120));
  const s = JSON.stringify(object?.json ?? {}, (_, v) => (typeof v === "bigint" ? String(v) : v));
  console.log("json:", s.slice(0, 1200));
  const bytes = Array.from(Buffer.from(pk, "hex"));
  console.log("delegate pubkey registered on account?", s.includes(pk) || s.includes(bytes.join(",")) || s.includes(Buffer.from(pk, "hex").toString("base64")));
}
main().catch((e) => console.log("ERR", e.message));
