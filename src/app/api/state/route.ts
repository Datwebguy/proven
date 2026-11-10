import { NextResponse } from "next/server";
import { buildJournal } from "@/lib/journal";
import { ASSETS } from "@/lib/tatum";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const asked = (new URL(req.url).searchParams.get("asset") ?? "SUI").toUpperCase();
  const asset = (ASSETS as readonly string[]).includes(asked) ? asked : "SUI";
  try {
    return NextResponse.json(await buildJournal(asset));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
