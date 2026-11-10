/**
 * Tatum Data API: market prices.
 * - spot(): current rate, used to show the price when a call is logged.
 * - priceAt(): the 1-minute candle containing a timestamp, used to decide outcomes at the exact deadline
 *   and to let strategies read history. Only data at or before the requested time is ever returned.
 */
const BASE = "https://api.tatum.io/v4/data/rate/symbol";
export const ASSETS = ["SUI", "SOL", "BTC", "ETH"] as const;
export type Asset = (typeof ASSETS)[number];

const headers = () => ({ "x-api-key": process.env.TATUM_API_KEY ?? "", accept: "application/json" });

async function get(url: string, attempt = 0): Promise<any> {
  const r = await fetch(url, { headers: headers(), cache: "no-store" });
  if (r.status === 429 && attempt < 4) {
    await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
    return get(url, attempt + 1);
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Tatum ${r.status}: ${body?.message ?? "request failed"}`);
  return body;
}

export async function spot(symbol: string): Promise<{ usd: number; at: number }> {
  const j = await get(`${BASE}?symbol=${encodeURIComponent(symbol)}&basePair=USD`);
  return { usd: Number(j.value), at: Number(j.timestamp) };
}

/** Close of the 1-minute candle that contains `ms`. */
export async function priceAt(symbol: string, ms: number): Promise<{ usd: number; candleOpen: number }> {
  const j = await get(`${BASE}/OHLCV?symbol=${encodeURIComponent(symbol)}&basePair=USD&unix=${Math.floor(ms)}&interval=1m`);
  if (!j?.close) throw new Error(`Tatum has no ${symbol} candle at ${new Date(ms).toISOString()}`);
  return { usd: Number(j.close), candleOpen: Number(j.openTime) };
}
