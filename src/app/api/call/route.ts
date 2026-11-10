import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { write } from "@/lib/memory";
import { strategyByName } from "@/lib/strategies";
import { ASSETS, spot } from "@/lib/tatum";
import type { CallRecord } from "@/lib/types";

export const maxDuration = 300;

/** Log a person's call. It is written to memory before the event; the blob ID is the receipt. */
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const asset = String(b.asset ?? "").toUpperCase();
  const usd = Number(b.usd);
  const confidence = Math.round(Number(b.confidence));
  const hours = Number(b.hours);
  const source = String(b.source ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  const rawLink = String(b.link ?? "").trim();
  const link = /^https?:\/\/\S{3,300}$/i.test(rawLink) ? rawLink : "";

  const problems = [
    !(ASSETS as readonly string[]).includes(asset) && "Pick an asset.",
    !(usd > 0) && "Enter a target price.",
    !(confidence >= 1 && confidence <= 99) && "Confidence must be between 1 and 99.",
    !(hours >= 5 / 60 - 1e-9 && hours <= 720) && "Deadline must be between 5 minutes and 30 days.",
    !source && "Enter a name.",
    strategyByName(source) && "That name belongs to a built-in strategy.",
    rawLink && !link && "The link must start with http:// or https://.",
  ].filter(Boolean);
  if (problems.length) return NextResponse.json({ error: problems[0] }, { status: 400 });

  try {
    const now = new Date();
    const price = await spot(asset);
    const call: CallRecord = {
      kind: "CALL",
      id: `p-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      source,
      origin: "person",
      asset,
      check: { type: b.direction === "below" ? "price_below" : "price_above", symbol: asset, usd },
      confidence,
      deadline: new Date(now.getTime() + hours * 3600_000).toISOString(),
      loggedAt: now.toISOString(),
      note: `price when logged $${price.usd}`,
      ...(link ? { link } : {}),
    };
    const blobId = await write(call);
    revalidateTag("journal");
    return NextResponse.json({ call, blobId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
