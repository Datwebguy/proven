import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { settleDue } from "@/lib/settle";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Resolve every call whose deadline has passed. Idempotent: settled calls are skipped. */
export async function POST() {
  try {
    const r = await settleDue(4);
    if (r.settled) revalidateTag("journal");
    const trust = (list: typeof r.afterStats) => Object.fromEntries(list.map((s) => [s.source, s.weight]));
    return NextResponse.json({
      settled: r.settled,
      outcomes: r.outcomes.map((o) => ({
        asset: o.claim.asset,
        result: o.result,
        observedUsd: o.observedUsd,
        targetUsd: o.claim.check.usd,
        direction: o.claim.check.type === "price_above" ? "above" : "below",
        checkpoint: o.checkpoint ?? null,
        receipt: o.blobId ?? null,
      })),
      receipts: r.receipts,
      trustBefore: trust(r.beforeStats),
      trustAfter: trust(r.afterStats),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
