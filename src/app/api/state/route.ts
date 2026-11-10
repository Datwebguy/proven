import { NextResponse } from "next/server";
import { buildJournal } from "@/lib/journal";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** The whole journal, rebuilt from Walrus Memory, with every asset's question answered. */
export async function GET() {
  try {
    return NextResponse.json(await buildJournal());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
