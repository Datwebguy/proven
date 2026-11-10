import { NextResponse } from "next/server";
import { fetchPost } from "@/lib/xpost";

export const dynamic = "force-dynamic";

/** Read a public post on X and return a draft call. Nothing is saved here. */
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  try {
    return NextResponse.json(await fetchPost(url));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
