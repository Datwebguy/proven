const KEY = () => process.env.TATUM_API_KEY ?? "proxy-injected";

export async function spotUsd(symbol: string): Promise<{ usd: number; at: number }> {
  const r = await fetch(`https://api.tatum.io/v4/data/rate/symbol?symbol=${encodeURIComponent(symbol)}&basePair=USD`, {
    headers: { "x-api-key": KEY() },
  });
  if (!r.ok) throw new Error(`Tatum rate ${symbol}: ${r.status}`);
  const j = await r.json();
  return { usd: Number(j.value), at: j.timestamp };
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const r = await fetch("https://sui-mainnet.gateway.tatum.io", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY() },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(`Tatum Sui RPC ${method}: ${r.status} ${JSON.stringify(j.error ?? j)}`);
  return j.result as T;
}

export const latestCheckpoint = async () => Number(await rpc<string>("sui_getLatestCheckpointSequenceNumber", []));

export async function checkpointTxCount(seq: number) {
  const c = await rpc<{ transactions: string[]; timestampMs: string }>("sui_getCheckpoint", [String(seq)]);
  return { txs: c.transactions.length, timestampMs: Number(c.timestampMs) };
}

/** Read the Walrus Memory account object straight from Sui via Tatum (proves the account is onchain). */
export async function readAccountObject(id: string) {
  return rpc<any>("sui_getObject", [id, { showType: true, showOwner: true }]);
}
