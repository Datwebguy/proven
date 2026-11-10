import { NextResponse } from "next/server";
import { latestCheckpoint, tatumLatestCheckpoint } from "@/lib/chain";
import { mem } from "@/lib/memory";
import { spot } from "@/lib/tatum";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    out.tatumPrice = `ok: SUI/USD ${(await spot("SUI")).usd}`;
  } catch (e) {
    out.tatumPrice = msg(e);
  }

  // Tatum's Sui gRPC only (no fallback), so this shows the real answer.
  try {
    out.tatumSuiGrpc = `ok: checkpoint ${await tatumLatestCheckpoint()}`;
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
