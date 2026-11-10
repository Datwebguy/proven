import { NextResponse } from "next/server";
import { write } from "@/lib/memory";
import { spotUsd } from "@/lib/tatum";
import type { CallRecord } from "@/lib/types";

export const maxDuration = 60;
const SYMBOLS = ["SUI", "SOL", "BTC", "ETH"];

/** Log a new price call. It is written to Walrus before the event; the blob id is the receipt. */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const symbol = String(b.symbol ?? "").toUpperCase();
    const usd = Number(b.usd);
    const confidence = Math.round(Number(b.confidence));
    const hours = Number(b.hours);
    if (!SYMBOLS.includes(symbol) || !(usd > 0) || !(confidence >= 0 && confidence <= 100) || !(hours > 0 && hours <= 24 * 30)) {
      return NextResponse.json({ error: "invalid call" }, { status: 400 });
    }
    const source = String(b.source ?? "").trim().slice(0, 60) || "Me";
    const dir = b.direction === "below" ? "below" : "above";
    const spot = await spotUsd(symbol);
    const now = new Date();
    const call: CallRecord = {
      kind: "CALL",
      id: `call-${now.getTime().toString(36)}`,
      source,
      topic: symbol,
      claim: `${symbol} trades ${dir} $${usd} (Tatum rate) at the deadline`,
      check: { type: dir === "above" ? "price_above" : "price_below", symbol, usd },
      confidence,
      deadline: new Date(now.getTime() + hours * 3600_000).toISOString(),
      loggedAt: now.toISOString(),
      notes: `spot at logging $${spot.usd}`,
      sample: false,
    };
    const { blobId } = await write(call);
    return NextResponse.json({ call, blobId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
