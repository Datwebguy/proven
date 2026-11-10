"use client";
import { useCallback, useEffect, useState } from "react";
import type { Journal } from "@/lib/journal";

const ACCOUNT = process.env.NEXT_PUBLIC_MEMWAL_ACCOUNT_ID ?? "";
const short = (s?: string) => (s ? `${s.slice(0, 6)}…${s.slice(-4)}` : "—");
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const blobUrl = (b: string) => `https://aggregator.walrus-mainnet.walrus.space/v1/blobs/${b}`;
const COLORS = ["#5eead4", "#fb7185", "#fbbf24", "#a78bfa", "#60a5fa", "#f472b6"];

type ResolveResult = {
  verdict: { result: boolean; observed: string; evidence: string };
  blobs: { kind: string; blobId?: string; error?: string }[];
  before: { off: number; on: number; rankOn: string[] };
  after: { off: number; on: number; rankOn: string[] };
};

export default function Home() {
  const [topic, setTopic] = useState("SUI");
  const [j, setJ] = useState<Journal | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState<React.ReactNode>(null);
  const [t0, setT0] = useState(0);

  const load = useCallback(async (t: string) => {
    setErr("");
    const s = Date.now();
    try {
      const r = await fetch(`/api/state?topic=${encodeURIComponent(t)}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setJ(d);
      setT0(Date.now() - s);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => { load(topic); }, [topic, load]);

  async function logCall(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy("log");
    setToast("Writing your call to Walrus mainnet (~20s)…");
    const r = await fetch("/api/call", { method: "POST", body: JSON.stringify(Object.fromEntries(f)) });
    const d = await r.json();
    setBusy("");
    if (!r.ok) return setToast(<span className="err">{d.error}</span>);
    setToast(<>Stored on Walrus mainnet · blob <a href={blobUrl(d.blobId)} target="_blank"><code>{d.blobId}</code></a></>);
    setTopic(d.call.topic);
    load(d.call.topic);
  }

  async function resolve(id: string) {
    setBusy(id);
    setToast("Resolving with Tatum data, then writing outcome + calibration to Walrus (~30s)…");
    const r = await fetch("/api/resolve", { method: "POST", body: JSON.stringify({ callId: id }) });
    const d: ResolveResult & { error?: string } = await r.json();
    setBusy("");
    if (!r.ok) return setToast(<span className="err">{d.error}</span>);
    const moved = d.before.rankOn.join() !== d.after.rankOn.join();
    setToast(
      <div>
        Claim resolved <b className={d.verdict.result ? "ok" : "err"}>{d.verdict.result ? "TRUE" : "FALSE"}</b> — {d.verdict.observed} ({d.verdict.evidence}).<br />
        Memory-on answer {pct(d.before.on)} → <b>{pct(d.after.on)}</b>; memory-off stayed {pct(d.after.off)}.{" "}
        {moved ? "Source ranking changed." : "Ranking held."}<br />
        Written: {d.blobs.map((b) => b.blobId ? <a key={b.blobId} href={blobUrl(b.blobId)} target="_blank"><code>{short(b.blobId)} </code></a> : <span key={b.kind} className="err">{b.error} </span>)}
      </div>,
    );
    load(topic);
  }

  const g = j?.guidance;
  const names = j ? [...new Set(j.sources.map((s) => s.source))] : [];
  const open = j?.calls.filter((c) => !c.outcome) ?? [];
  const mismatch = j && j.onchainCount !== j.recalledCount;

  return (
    <main>
      <h1>Proven</h1>
      <p className="sub">A prediction journal that learns who is actually right. Every outcome is written to Walrus Memory on Sui mainnet and changes the next answer.</p>

      <div className="strip">
        <span><b>{j ? j.onchainCount : "…"}</b> memories on Walrus mainnet</span>
        <span>rebuilt from Walrus on this load: <b>{j ? j.recalledCount : "…"}</b> recalled {j && (mismatch ? <span className="err">(count differs from on-chain listing)</span> : <span className="ok">✓ matches on-chain count</span>)}</span>
        <span>{j ? `${j.kinds.call} calls · ${j.kinds.outcome} outcomes · ${j.calibrations} calibration snapshots` : ""}</span>
        <span>no local database{t0 ? ` · loaded in ${(t0 / 1000).toFixed(1)}s` : ""}</span>
        {ACCOUNT && <span>account <code>{short(ACCOUNT)}</code></span>}
      </div>
      {err && <div className="card err">Could not load from Walrus: {err}</div>}

      <div className="card">
        <h2>Same question, memory off vs memory on</h2>
        <label style={{ maxWidth: 320 }}>Question topic — who should I trust on…
          <select value={topic} onChange={(e) => setTopic(e.target.value)}>
            {(j?.topics ?? [topic]).map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        {!g || g.rows.length === 0 ? (
          <p className="note">{j ? "No open calls on this topic. Log one below, or pick another topic." : "Recalling memories from Walrus…"}</p>
        ) : (
          <div className="grid2" style={{ marginTop: 14 }}>
            <div className="col off">
              <div className="tag">MEMORY OFF</div>
              <div className="big">{pct(g.off)}</div>
              <div className="meta">flat average · every source counts equally · stated confidence taken at face value</div>
              <div className="rows">
                {g.rankOff.map((s, i) => {
                  const r = g.rows.find((x) => x.source === s)!;
                  return (
                    <div className="row" key={s}>
                      <span className="rank">{i + 1}</span>
                      <div><div className="name">{s}</div><div className="bar"><i style={{ width: `${r.stated * 100}%` }} /></div></div>
                      <span className="meta">says {pct(r.stated)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="col on">
              <div className="tag">MEMORY ON — from {j!.recalledCount} Walrus memories</div>
              <div className="big">{pct(g.on)}<span className={"delta " + (g.on >= g.off ? "up" : "down")}>{g.on >= g.off ? "▲" : "▼"} {Math.abs((g.on - g.off) * 100).toFixed(1)} pts</span></div>
              <div className="meta">weighted by calibration · each source's claim blended with its actual track record</div>
              <div className="rows">
                {g.rankOn.map((s, i) => {
                  const r = g.rows.find((x) => x.source === s)!;
                  const offPos = g.rankOff.indexOf(s);
                  const moved = offPos - i;
                  return (
                    <div className="row" key={s}>
                      <span className="rank">{i + 1}</span>
                      <div>
                        <div className="name">{s}{moved !== 0 && <span className={"delta " + (moved > 0 ? "up" : "down")}>{moved > 0 ? "▲" : "▼"}{Math.abs(moved)}</span>}</div>
                        <div className="bar"><i style={{ width: `${r.adjusted * 100}%` }} /></div>
                      </div>
                      <span className="meta">trust {pct(r.weight)} · {pct(r.stated)} → {pct(r.adjusted)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {j && j.curve.points.length > 1 && (
        <div className="card">
          <h2>How trust was learned — weight per source as resolved claims accumulate</h2>
          <Curve curve={j.curve} />
        </div>
      )}

      <div className="grid2">
        <div className="card">
          <h2>Log a call (written to Walrus before the event)</h2>
          <form onSubmit={logCall}>
            <label>Source<input name="source" defaultValue="Me" size={12} /></label>
            <label>Asset<select name="symbol"><option>SUI</option><option>SOL</option><option>BTC</option><option>ETH</option></select></label>
            <label>Direction<select name="direction"><option>above</option><option>below</option></select></label>
            <label>USD<input name="usd" type="number" step="any" required style={{ width: 100 }} /></label>
            <label>Confidence %<input name="confidence" type="number" min={0} max={100} defaultValue={70} style={{ width: 80 }} /></label>
            <label>Deadline (hours)<input name="hours" type="number" step="any" defaultValue={1} style={{ width: 80 }} /></label>
            <button disabled={!!busy}>{busy === "log" ? "Writing…" : "Log call"}</button>
          </form>
        </div>
        <div className="card">
          <h2>Open calls — resolve once the deadline passes</h2>
          {open.length === 0 && <p className="note">None open.</p>}
          {open.map((c) => {
            const due = Date.parse(c.deadline) <= Date.now();
            return (
              <div key={c.id} className="row" style={{ gridTemplateColumns: "1fr auto", margin: "6px 0" }}>
                <div><div className="name">{c.source} · {c.confidence}% — {c.claim}</div><div className="meta">deadline {new Date(c.deadline).toUTCString()}</div></div>
                <button className="ghost" disabled={!due || !!busy} onClick={() => resolve(c.id)}>{busy === c.id ? "…" : due ? "Resolve" : "pending"}</button>
              </div>
            );
          })}
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}

      <div className="card">
        <h2>Sources · rebuilt from recalled memories</h2>
        <div className="scroll"><table>
          <thead><tr><th>Source</th><th>Resolved</th><th>Hit rate</th><th>Avg stated</th><th>Brier</th><th>Trust weight</th></tr></thead>
          <tbody>{[...(j?.sources ?? [])].sort((a, b) => b.weight - a.weight).map((s) => (
            <tr key={s.source}><td>{s.source}</td><td>{s.resolved}</td><td>{pct(s.hitRate)}</td><td>{pct(s.avgConfidence)}</td><td>{s.brier.toFixed(3)}</td><td><b>{pct(s.weight)}</b></td></tr>
          ))}</tbody>
        </table></div>
      </div>

      <div className="card">
        <h2>Ledger — every row is a Walrus mainnet blob (Seal-encrypted; link shows the stored object)</h2>
        <div className="scroll"><table>
          <thead><tr><th>Source</th><th>Claim</th><th>Conf</th><th>Outcome</th><th>Call blob</th><th>Outcome blob</th></tr></thead>
          <tbody>{(j?.calls ?? []).map((c) => (
            <tr key={c.id}>
              <td>{c.source}</td><td>{c.claim}</td><td>{c.confidence}%</td>
              <td>{c.outcome ? <><span className={"pill " + (c.outcome.result ? "t" : "f")}>{c.outcome.result ? "TRUE" : "FALSE"}</span><div className="meta">{c.outcome.evidence}</div></> : <span className="pill">open</span>}</td>
              <td>{c.callBlob ? <a href={blobUrl(c.callBlob)} target="_blank"><code>{short(c.callBlob)}</code></a> : "—"}</td>
              <td>{c.outcome?.blob ? <a href={blobUrl(c.outcome.blob)} target="_blank"><code>{short(c.outcome.blob)}</code></a> : "—"}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <p className="note">Sources marked “Sample ·” are simulated forecasters with a published seed (not real people or private data). Their claims about Sui checkpoints were backfilled after finalization and resolved from real Sui data via Tatum; calls you log yourself are real and written before the event.</p>
      </div>
      {names.length === 0 && null}
    </main>
  );
}

function Curve({ curve }: { curve: Journal["curve"] }) {
  const W = 960, H = 200, P = 28;
  const n = curve.points.length - 1;
  const max = Math.max(0.01, ...curve.points.flatMap((p) => Object.values(p.weights)));
  const x = (i: number) => P + (i / Math.max(1, n)) * (W - 2 * P);
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  return (
    <div className="scroll">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Trust weight per source over resolved claims">
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#232c40" />
        {curve.sources.map((s, k) => (
          <polyline key={s} fill="none" stroke={COLORS[k % COLORS.length]} strokeWidth={2}
            points={curve.points.map((p, i) => `${x(i)},${y(p.weights[s] ?? 0)}`).join(" ")} />
        ))}
        <text x={P} y={14} fill="#8b96ad" fontSize="11">trust weight (max {(max * 100).toFixed(0)}%)</text>
        <text x={W - P} y={H - 8} fill="#8b96ad" fontSize="11" textAnchor="end">resolved claims →</text>
      </svg>
      <div className="meta">{curve.sources.map((s, k) => <span key={s} style={{ marginRight: 14 }}><i style={{ display: "inline-block", width: 10, height: 10, background: COLORS[k % COLORS.length], borderRadius: 2, marginRight: 5 }} />{s}</span>)}</div>
    </div>
  );
}
