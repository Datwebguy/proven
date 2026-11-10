import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { buildJournal } from "@/lib/journal";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * The journal, rebuilt from Walrus Memory and shared across server instances for up to 30 s
 * (refreshed in the background after that). Every write refreshes it immediately via the "journal" tag.
 */
const cachedJournal = unstable_cache(() => buildJournal(), ["journal-v2"], { revalidate: 30, tags: ["journal"] });

export async function GET() {
  try {
    return NextResponse.json(await cachedJournal());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
