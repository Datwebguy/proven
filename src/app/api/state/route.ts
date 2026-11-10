import { NextResponse } from "next/server";
import { buildJournal } from "@/lib/journal";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const topic = new URL(req.url).searchParams.get("topic") ?? "SUI";
  try {
    return NextResponse.json(await buildJournal(topic));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
