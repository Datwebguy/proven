import { NextResponse } from "next/server";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { latestCheckpoint } from "@/lib/chain";
import { mem } from "@/lib/memory";
import { spotUsd } from "@/lib/tatum";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const msg = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 160);

/** Reports which integrations are live. Never returns keys. */
export async function GET() {
  const out: Record<string, unknown> = { tatumKeyConfigured: Boolean(process.env.TATUM_API_KEY) };

  try {
    out.walrusRelayer = (await mem().health()).status;
  } catch (e) {
    out.walrusRelayer = msg(e);
  }

  try {
    out.tatumPrice = `ok: SUI/USD ${(await spotUsd("SUI")).usd}`;
  } catch (e) {
    out.tatumPrice = msg(e);
  }

  // Ask Tatum's Sui gRPC directly (no fallback), so this shows the real answer.
  try {
    const c: any = new SuiGrpcClient({
      network: "mainnet",
      baseUrl: process.env.TATUM_SUI_GRPC_URL ?? "https://sui-mainnet-grpc.gateway.tatum.io",
      fetch: (u, i) => {
        const h = new Headers(i?.headers);
        if (process.env.TATUM_API_KEY) h.set("x-api-key", process.env.TATUM_API_KEY);
        return fetch(u, { ...i, headers: h });
      },
    });
    const r = await c.ledgerService.getCheckpoint({ checkpointId: { oneofKind: undefined }, readMask: { paths: ["sequence_number"] } });
    out.tatumSuiGrpc = `ok: checkpoint ${String(r.response.checkpoint.sequenceNumber)}`;
  } catch (e) {
    out.tatumSuiGrpc = msg(e);
  }

  try {
    out.chainReadsUse = (await latestCheckpoint()).source;
  } catch (e) {
    out.chainReadsUse = msg(e);
  }
  return NextResponse.json(out);
}
