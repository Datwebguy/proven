const KEY = () => process.env.TATUM_API_KEY ?? "proxy-injected";

export async function spotUsd(symbol: string): Promise<{ usd: number; at: number }> {
  const r = await fetch(`https://api.tatum.io/v4/data/rate/symbol?symbol=${encodeURIComponent(symbol)}&basePair=USD`, {
    headers: { "x-api-key": KEY() },
  });
  if (!r.ok) throw new Error(`Tatum rate ${symbol}: ${r.status}`);
  const j = await r.json();
  return { usd: Number(j.value), at: j.timestamp };
}
