/**
 * Turn a public post on X into a draft call. Uses X's public oEmbed endpoint: no X account, no API key.
 * Proven only pre-fills the form; the person checks it and saves.
 */
import { ASSETS } from "./tatum";

const ALIASES: Record<string, string> = { SUI: "SUI", SOL: "SOL", SOLANA: "SOL", BTC: "BTC", BITCOIN: "BTC", ETH: "ETH", ETHEREUM: "ETH", ETHER: "ETH" };
const UP = /\b(above|over|break(?:s|ing)?|to|hits?|reach(?:es)?|target|pump|moon|send|higher|bull(?:ish)?|long)\b/i;
const DOWN = /\b(below|under|dump|drop(?:s)?|fall(?:s)?|lower|bear(?:ish)?|short|crash)\b/i;

export type Draft = { asset: string | null; direction: "above" | "below" | null; usd: number | null; confidence: number | null };

/** Best-effort read of asset, direction, target price and an explicit "% sure" from free text. */
export function parseCall(text: string): Draft {
  const t = text.replace(/\s+/g, " ");
  let asset: string | null = null;
  for (const m of t.matchAll(/\$?([A-Za-z]{3,8})\b/g)) {
    const a = ALIASES[m[1].toUpperCase()];
    if (a && (ASSETS as readonly string[]).includes(a)) { asset = a; break; }
  }
  const price = /\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k|K)?/.exec(t) ?? /\b(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k|K)\b/.exec(t);
  let usd: number | null = null;
  if (price) {
    usd = Number(price[1].replace(/,/g, "")) * (price[2] ? 1000 : 1);
    if (!(usd > 0)) usd = null;
  }
  const down = DOWN.test(t), up = UP.test(t);
  const direction = down && !/\b(above|over|break)\b/i.test(t) ? "below" : up || usd ? "above" : null;
  const conf = /(\d{2})\s?%\s?(sure|confident|chance|likely|conviction)/i.exec(t);
  const confidence = conf ? Math.min(99, Math.max(1, Number(conf[1]))) : null;
  return { asset, direction, usd, confidence };
}

const POST_URL = /^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})/i;

export function isPostUrl(url: string) {
  return POST_URL.test(url.trim());
}

export async function fetchPost(url: string) {
  const m = POST_URL.exec(url.trim());
  if (!m) throw new Error("Paste a link to a post on X, like https://x.com/name/status/123…");
  const clean = `https://x.com/${m[3]}/status/${m[4]}`;
  const r = await fetch(`https://publish.twitter.com/oembed?omit_script=1&dnt=true&url=${encodeURIComponent(clean)}`, { cache: "no-store", redirect: "follow" });
  if (r.status === 404) throw new Error("That post can't be found. It may be deleted or from a protected account.");
  if (!r.ok) throw new Error("X didn't return the post right now. Try again, or fill the call in by hand.");
  const j = await r.json();
  const html = String(j.html ?? "");
  const para = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(html)?.[1] ?? "";
  const text = para
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&mdash;/g, "—")
    .trim();
  const handle = "@" + (String(j.author_url ?? "").split("/").pop() || m[3]);
  return { url: clean, handle, author: String(j.author_name ?? m[3]), text, draft: parseCall(text) };
}
