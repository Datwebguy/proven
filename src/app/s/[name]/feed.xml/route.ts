import { getRecord } from "@/lib/record";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * RSS feed of a source's calls and results. Follow anyone without an account:
 * works in feed readers and in Slack, Discord, Telegram or Zapier RSS integrations.
 */
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = decodeURIComponent((await params).name);
  const origin = new URL(req.url).origin;
  const r = await getRecord(name).catch(() => null);
  const page = `${origin}/s/${encodeURIComponent(name)}`;
  const items = (r?.calls ?? []).map((c) => {
    const status = c.right === null ? "Open" : c.right ? "Right" : "Wrong";
    const title = `${status}: ${c.claim} · ${c.confidence}% sure`;
    const desc = `${r!.source} said ${c.claim} by ${new Date(c.deadline).toUTCString()}, ${c.confidence}% sure. ${c.right === null ? "Waiting for the deadline." : c.right ? "It came out right." : "It came out wrong."}${c.receipt ? ` Receipt: https://aggregator.walrus-mainnet.walrus.space/v1/blobs/${c.receipt}` : ""}`;
    return `<item><title>${esc(title)}</title><link>${esc(page)}</link><guid isPermaLink="false">${esc(c.id + ":" + status)}</guid><pubDate>${new Date(c.deadline).toUTCString()}</pubDate><description>${esc(desc)}</description></item>`;
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${esc(`${name} on Proven`)}</title>
<link>${esc(page)}</link>
<description>${esc(r ? `Proven score ${r.score} (${r.label}). Right ${Math.round(r.hitRate * 100)}% while claiming ${Math.round(r.avgConfidence * 100)}%.` : "No calls yet.")}</description>
${items.join("\n")}
</channel></rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=300" } });
}
