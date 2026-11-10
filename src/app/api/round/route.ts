import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { loadAll, writeMany } from "@/lib/memory";
import { HORIZON_HOURS, strategyCalls } from "@/lib/round";
import { join } from "@/lib/scoring";
import { ASSETS } from "@/lib/tatum";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Start a new round: every strategy makes a fresh call on each asset that has no open strategy call.
 * Idempotent while a round is open, so it can be run on a schedule.
 */
export async function POST() {
  try {
    const { records } = await loadAll({ fresh: true });
    const open = join(records.map((r) => r.record)).filter((j) => !j.outcome && j.call.origin === "strategy");
    const busy = new Set(open.map((j) => j.call.asset));
    const assets = ASSETS.filter((a) => !busy.has(a));
    if (!assets.length) return NextResponse.json({ created: 0, reason: "A round is already open for every asset." });
    const calls = await strategyCalls(Date.now() - 2 * 60_000, HORIZON_HOURS, assets);
    const res = await writeMany(calls);
    revalidateTag("journal");
    return NextResponse.json({ created: calls.length, assets, receipts: res });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
