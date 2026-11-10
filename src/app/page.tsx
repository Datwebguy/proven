"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Journal } from "@/lib/journal";

const ACCOUNT = process.env.NEXT_PUBLIC_MEMWAL_ACCOUNT_ID ?? "";
const pct = (x: number) => `${Math.round(x * 100)}%`;
const short = (s?: string) => (s ? `${s.slice(0, 6)}…${s.slice(-4)}` : "");
const receiptUrl = (b: string) => `https://aggregator.walrus-mainnet.walrus.space/v1/blobs/${b}`;
const COLORS = ["#0f766e", "#b91c1c", "#b45309", "#4338ca", "#0369a1", "#be185d"];
const TOPIC_LABEL: Record<string, string> = { SUI: "SUI price", SOL: "SOL price", BTC: "BTC price", ETH: "ETH price", "SUI-onchain": "Sui network activity" };
const topicLabel = (t: string) => TOPIC_LABEL[t] ?? t;

/** Sample forecasters are stored as "Sample · Name"; show the name with a badge instead of the prefix. */
function Name({ source }: { source: string }) {
  const demo = source.startsWith("Sample · ");
  return (
    <>
      {demo ? source.slice(9) : source}
      {demo && <span className="chip demo">demo</span>}
    </>
  );
}

type ResolveResult = {
  verdict: { result: boolean; observed: string; evidence: string };
  blobs: { kind: string; blobId?: string; error?: string }[];
  before: { off: number; on: number; rankOn: string[] };
  after: { off: number; on: number; rankOn: string[] };
};

const untilText = (iso: string) => {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "ready to resolve";
  const m = Math.round(ms / 60000);
  return m < 60 ? `resolves in ${m} min` : `resolves in ${(m / 60).toFixed(1)} h`;
};

export default function Home() {
  const [topic, setTopic] = useState("SUI");
  const [j, setJ] = useState<Journal | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [notice, setNotice] = useState<{ tone: "good" | "bad" | "info"; body: React.ReactNode } | null>(null);

  const load = useCallback(async (t: string) => {
    setErr("");
    try {
      const r = await fetch(`/api/state?topic=${encodeURIComponent(t)}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setJ(d);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => { load(topic); }, [topic, load]);

  async function logCall(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    setBusy("log");
    setNotice({ tone: "info", body: "Saving your call to memory. This takes about 20 seconds because it is written to Sui mainnet before the event." });
    const r = await fetch("/api/call", { method: "POST", body: JSON.stringify(body) });
    const d = await r.json();
    setBusy("");
    if (!r.ok) return setNotice({ tone: "bad", body: `Could not save the call: ${d.error}` });
    form.reset();
    setNotice({
      tone: "good",
      body: (
        <>
          <div><b>Saved.</b> Your call is now part of the record and cannot be edited after the fact.</div>
          <div className="receipts"><span className="muted">Receipt</span> <a className="receipt" href={receiptUrl(d.blobId)} target="_blank" rel="noreferrer">{d.blobId}</a></div>
        </>
      ),
    });
    setTopic(d.call.topic);
    load(d.call.topic);
  }

  async function resolve(id: string) {
    setBusy(id);
    setNotice({ tone: "info", body: "Checking the real outcome with Tatum, then writing the result and the updated trust scores to memory…" });
    const r = await fetch("/api/resolve", { method: "POST", body: JSON.stringify({ callId: id }) });
    const d: ResolveResult & { error?: string } = await r.json();
    setBusy("");
    if (!r.ok) return setNotice({ tone: "bad", body: `Could not resolve: ${d.error}` });
    const moved = d.before.rankOn.join() !== d.after.rankOn.join();
    setNotice({
      tone: "good",
      body: (
        <>
          <div>
            Outcome: <span className={"chip " + (d.verdict.result ? "good" : "bad")}>{d.verdict.result ? "Came true" : "Did not happen"}</span>{" "}
            <span className="muted">{d.verdict.observed}</span>
          </div>
          <div className="shift">
            <div className="box"><b>{pct(d.before.on)}</b><span>answer before this result</span></div>
            <div className="arrow">→</div>
            <div className="box"><b>{pct(d.after.on)}</b><span>answer after memory updated</span></div>
          </div>
          <div className="muted">{moved ? "The ranking of sources changed because of this result." : "Trust scores updated; the order of sources held."} Without memory the answer would still be {pct(d.after.off)}.</div>
          <div className="receipts"><span className="muted">Receipts</span>{d.blobs.map((b, i) => b.blobId ? <a key={i} className="receipt" href={receiptUrl(b.blobId)} target="_blank" rel="noreferrer">{short(b.blobId)}</a> : <span key={i} className="chip bad">{b.error}</span>)}</div>
        </>
      ),
    });
    load(topic);
  }

  const g = j?.guidance;
  const open = useMemo(() => (j?.calls ?? []).filter((c) => !c.outcome).sort((a, b) => a.deadline.localeCompare(b.deadline)), [j]);
  const resolved = useMemo(() => (j?.calls ?? []).filter((c) => c.outcome).sort((a, b) => b.deadline.localeCompare(a.deadline)), [j]);
  const sources = useMemo(() => [...(j?.sources ?? [])].sort((a, b) => b.weight - a.weight), [j]);
  const question = topic.endsWith("-onchain") ? "Who should I trust on Sui network activity?" : `Who should I trust on the ${topicLabel(topic)}?`;

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand"><i />Proven</div>
          <nav className="nav">
            <a href="#ask">Ask</a><a href="#log">Log a call</a><a href="#sources">Sources</a><a href="#journal">Journal</a><a href="#verify">Verification</a>
          </nav>
          <div className="spacer" />
          <div className="status">
            <span className={"dot " + (err ? "bad" : j ? "" : "pending")} />
            {err ? "Memory unavailable" : j ? `${j.onchainCount} records in memory · Sui mainnet` : "Recalling memory…"}
          </div>
        </div>
      </header>

      <main>
        <div className="hero">
          <h1>A prediction journal that learns who is actually right.</h1>
          <p>Log a call with a confidence number before the event. When it resolves, Proven remembers the outcome and adjusts how much it trusts each source. Ask the same question with memory on and off, and see the difference.</p>
        </div>

        <section id="ask">
          <div className="sec-head">
            <h2>{question}</h2>
            <p>Same question, two answers. The only difference is memory.</p>
          </div>
          <div className="card">
            <div className="ask-bar">
              <label htmlFor="topic">Topic</label>
              <select id="topic" className="select" value={topic} onChange={(e) => setTopic(e.target.value)}>
                {(j?.topics ?? [topic]).map((t) => <option key={t} value={t}>{topicLabel(t)}</option>)}
              </select>
              {g && g.rows.length > 0 && <span className="muted">{g.rows.length} open call{g.rows.length === 1 ? "" : "s"} on this topic</span>}
            </div>

            {err && <div className="notice bad">We could not reach the memory layer right now. {err}</div>}
            {!j && !err && <div className="loading"><div className="skeleton" style={{ width: "40%" }} /><div className="skeleton" style={{ width: "70%" }} /><div className="skeleton" style={{ width: "55%" }} /></div>}

            {g && g.rows.length === 0 && <div className="empty">No open calls on this topic yet. Log one below to get an answer.</div>}

            {g && g.rows.length > 0 && (
              <>
                <div className="grid2">
                  <div className="answer off">
                    <div className="label">Without memory</div>
                    <div className="num">{pct(g.off)}</div>
                    <div className="how">Every source counts the same. Their stated confidence is taken at face value.</div>
                    <div className="ranks">
                      {g.rankOff.map((s, i) => {
                        const r = g.rows.find((x) => x.source === s)!;
                        return (
                          <div className="rank" key={s}>
                            <span className="n">{i + 1}</span>
                            <div><div className="name"><Name source={s} /></div><div className="bar"><i style={{ width: `${r.stated * 100}%` }} /></div></div>
                            <div className="val">says {pct(r.stated)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="answer on">
                    <div className="label">With memory <span className="chip brand">{j!.kinds.outcome} resolved calls</span></div>
                    <div className="num">{pct(g.on)} <span className={"move " + (g.on >= g.off ? "up" : "down")}>{g.on >= g.off ? "▲" : "▼"} {Math.abs(Math.round((g.on - g.off) * 100))} pts</span></div>
                    <div className="how">Sources are weighted by their track record. Each claim is blended with how often that source has actually been right.</div>
                    <div className="ranks">
                      {g.rankOn.map((s, i) => {
                        const r = g.rows.find((x) => x.source === s)!;
                        const moved = g.rankOff.indexOf(s) - i;
                        return (
                          <div className="rank" key={s}>
                            <span className="n">{i + 1}</span>
                            <div>
                              <div className="name"><Name source={s} />{moved !== 0 && <span className={"move " + (moved > 0 ? "up" : "down")}>{moved > 0 ? "▲" : "▼"}{Math.abs(moved)}</span>}</div>
                              <div className="bar"><i style={{ width: `${r.adjusted * 100}%` }} /></div>
                              <div className="sub">trust {pct(r.weight)}</div>
                            </div>
                            <div className="val">says {pct(r.stated)} → <b>{pct(r.adjusted)}</b></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="takeaway">
                  <b><Name source={g.rankOn[0]} /></b> is the most trusted source on this topic right now.{" "}
                  {g.rankOn[0] !== g.rankOff[0] && <>Without memory the list would start with <b><Name source={g.rankOff[0]} /></b>.</>}{" "}
                  Trust comes only from resolved outcomes in memory; nothing here is set by hand.
                </div>
              </>
            )}
          </div>
        </section>

        {j && j.curve.points.length > 1 && (
          <section id="learning">
            <div className="sec-head">
              <h2>How trust was learned</h2>
              <p>Each source's trust after every resolved call, from the first to the latest.</p>
            </div>
            <div className="card"><Curve curve={j.curve} /></div>
          </section>
        )}

        <section id="log">
          <div className="grid-3-2">
            <div className="card">
              <div className="sec-head"><h2>Log a call</h2><p>Saved to memory before the event, so it can't be changed later.</p></div>
              <form className="form" onSubmit={logCall}>
                <div className="f wide"><label htmlFor="src">Your name or the source</label><input id="src" name="source" placeholder="e.g. Me, or an analyst you follow" defaultValue="Me" /></div>
                <div className="f"><label htmlFor="sym">Asset</label><select id="sym" name="symbol"><option>SUI</option><option>SOL</option><option>BTC</option><option>ETH</option></select></div>
                <div className="f"><label htmlFor="dir">Will be</label><select id="dir" name="direction"><option value="above">above</option><option value="below">below</option></select></div>
                <div className="f"><label htmlFor="usd">Price (USD)</label><input id="usd" name="usd" type="number" step="any" min="0" required placeholder="0.85" /></div>
                <div className="f"><label htmlFor="hrs">In (hours)</label><input id="hrs" name="hours" type="number" step="any" min="0.1" max="720" defaultValue={1} /></div>
                <div className="f wide"><label htmlFor="conf">How confident are you? (%)</label><input id="conf" name="confidence" type="number" min={0} max={100} defaultValue={70} /></div>
                <div className="hint">Prices are checked against Tatum's market rate at the deadline. Be honest with the percentage: that's what Proven scores you on.</div>
                <div className="actions">
                  <button className="btn" disabled={!!busy}>{busy === "log" ? "Saving to memory…" : "Save call"}</button>
                </div>
              </form>
            </div>

            <div className="card">
              <div className="sec-head"><h2>Open calls</h2><p>Resolve once the deadline has passed.</p></div>
              {j && open.length === 0 && <div className="empty">Nothing open right now.</div>}
              <div className="list">
                {open.map((c) => {
                  const due = Date.parse(c.deadline) <= Date.now();
                  return (
                    <div className="item" key={c.id}>
                      <div>
                        <div className="t"><Name source={c.source} /> · {c.confidence}% · {c.claim.replace(" (Tatum rate) at the deadline", "")}</div>
                        <div className="s">{new Date(c.deadline).toUTCString().replace(" GMT", " UTC")} · {untilText(c.deadline)}</div>
                      </div>
                      <button className="btn sm secondary" disabled={!due || !!busy} onClick={() => resolve(c.id)}>{busy === c.id ? "Resolving…" : due ? "Resolve" : "Waiting"}</button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {notice && <div className={"notice " + (notice.tone === "info" ? "" : notice.tone)}>{notice.body}</div>}
        </section>

        <section id="sources">
          <div className="sec-head"><h2>Sources</h2><p>Ranked by trust. Trust is recomputed from memory on every visit.</p></div>
          <div className="card scroll">
            <table>
              <thead><tr><th>Source</th><th>Resolved calls</th><th>Accuracy</th><th>Average confidence</th><th>Verdict</th><th>Trust</th></tr></thead>
              <tbody>
                {sources.map((s) => {
                  const gap = s.avgConfidence - s.hitRate;
                  const verdict = s.resolved < 3 ? "Not enough history" : gap > 0.15 ? "Overconfident" : gap < -0.1 ? "Underrates themself" : "Well calibrated";
                  const tone = s.resolved < 3 ? "" : gap > 0.15 ? "bad" : gap < -0.1 ? "warn" : "good";
                  return (
                    <tr key={s.source}>
                      <td><span className="name" style={{ display: "inline-flex", gap: 8, alignItems: "center", fontWeight: 600 }}><Name source={s.source} /></span></td>
                      <td className="num">{s.resolved}{s.open ? <span className="muted"> · {s.open} open</span> : null}</td>
                      <td className="num">{s.resolved ? pct(s.hitRate) : "—"}</td>
                      <td className="num">{s.resolved ? pct(s.avgConfidence) : "—"}</td>
                      <td><span className={"chip " + tone}>{verdict}</span></td>
                      <td className="num"><b>{pct(s.weight)}</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section id="journal">
          <div className="sec-head"><h2>Journal</h2><p>Every call and every outcome, with a receipt you can open.</p></div>
          <div className="card scroll">
            <table>
              <thead><tr><th>Source</th><th>Call</th><th>Confidence</th><th>Outcome</th><th>Receipts</th></tr></thead>
              <tbody>
                {(showAll ? resolved : resolved.slice(0, 8)).map((c) => (
                  <tr key={c.id}>
                    <td><span style={{ display: "inline-flex", gap: 8, alignItems: "center", fontWeight: 600 }}><Name source={c.source} /></span></td>
                    <td>{c.claim}<div className="muted">{new Date(c.deadline).toUTCString().replace(" GMT", " UTC")}</div></td>
                    <td className="num">{c.confidence}%</td>
                    <td>
                      <span className={"chip " + (c.outcome!.result ? "good" : "bad")}>{c.outcome!.result ? "Came true" : "Did not happen"}</span>
                      <div className="muted">{c.outcome!.observed.split(" via ")[0]}</div>
                      <div className="muted">Checked via {c.outcome!.evidence === "tatum-price" ? "Tatum market data" : c.outcome!.evidence === "tatum-sui-grpc" ? "Tatum Sui gateway" : "Sui public node"}</div>
                    </td>
                    <td>
                      {c.callBlob && <div><a className="receipt" href={receiptUrl(c.callBlob)} target="_blank" rel="noreferrer">call {short(c.callBlob)}</a></div>}
                      {c.outcome?.blob && <div style={{ marginTop: 4 }}><a className="receipt" href={receiptUrl(c.outcome.blob)} target="_blank" rel="noreferrer">result {short(c.outcome.blob)}</a></div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {j && resolved.length === 0 && <div className="empty">No resolved calls yet.</div>}
            {resolved.length > 8 && <div style={{ marginTop: 12 }}><button className="btn sm secondary" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${resolved.length} resolved calls`}</button></div>}
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            Sources marked <span className="chip demo">demo</span> are simulated forecasters used to show the learning loop. They are not real people. Their calls about Sui network activity were added after the fact and scored against real chain data, so the learning is real but those were not predictions made in advance. Calls you log yourself are real and are saved before the event.
          </p>
        </section>

        <section id="verify">
          <div className="sec-head"><h2>Verification</h2><p>Memory is the source of truth. There is no local database.</p></div>
          <div className="proof">
            <div className="stat"><b>{j?.onchainCount ?? "—"}</b><span>records stored on Sui mainnet (Walrus Memory)</span></div>
            <div className="stat"><b>{j?.recalledCount ?? "—"}</b><span>records recalled to build this page {j && j.recalledCount === j.onchainCount ? "· complete" : ""}</span></div>
            <div className="stat"><b>{j?.kinds.outcome ?? "—"}</b><span>outcomes checked against real data</span></div>
            <div className="stat"><b>{j ? j.sources.length : "—"}</b><span>sources being scored</span></div>
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            Memory account {ACCOUNT ? <a href={`https://suiscan.xyz/mainnet/object/${ACCOUNT}`} target="_blank" rel="noreferrer">{short(ACCOUNT)}</a> : "—"} on Sui mainnet. Each receipt opens the stored record on Walrus. Records are encrypted, so the link proves the record exists and when it was written; Proven decrypts them with its own key when it rebuilds the page. Prices and chain data come from Tatum. <a href="/api/health" target="_blank" rel="noreferrer">Live integration status</a>.
          </p>
        </section>

        <div className="foot">Proven · Built for the Walrus × Tatum Total Recall hackathon · <a href="https://github.com/datwebguy/proven" target="_blank" rel="noreferrer">Source code</a></div>
      </main>
    </>
  );
}

function Curve({ curve }: { curve: Journal["curve"] }) {
  const W = 960, H = 220, P = 32;
  const n = curve.points.length - 1;
  const max = Math.max(0.05, ...curve.points.flatMap((p) => Object.values(p.weights)));
  const x = (i: number) => P + (i / Math.max(1, n)) * (W - 2 * P);
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  return (
    <div className="scroll">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Trust per source over resolved calls">
        {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={P} y1={y(max * f)} x2={W - P} y2={y(max * f)} stroke="#eef0f5" />)}
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#d6dae6" />
        {curve.sources.map((s, k) => (
          <polyline key={s} fill="none" stroke={COLORS[k % COLORS.length]} strokeWidth={2.5} strokeLinejoin="round"
            points={curve.points.map((p, i) => `${x(i)},${y(p.weights[s] ?? 0)}`).join(" ")} />
        ))}
        <text x={P} y={16} fill="#7c8aa5" fontSize="12">trust (share of total)</text>
        <text x={W - P} y={H - 10} fill="#7c8aa5" fontSize="12" textAnchor="end">resolved calls →</text>
      </svg>
      <div className="legend">{curve.sources.map((s, k) => <span key={s}><i style={{ background: COLORS[k % COLORS.length] }} /><Name source={s} /></span>)}</div>
    </div>
  );
}
