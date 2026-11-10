"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Journal } from "@/lib/journal";
import { adjustConfidence, reliability } from "@/lib/scoring";
import { Logo, Wordmark } from "./Logo";

const ASSETS = ["SUI", "SOL", "BTC", "ETH"];
const COLORS = ["#0f766e", "#c2410c", "#4338ca", "#a16207", "#0369a1", "#be185d", "#15803d"];
const pct = (x: number) => `${Math.round(x * 100)}%`;
const short = (s?: string | null) => (s ? `${s.slice(0, 6)}…${s.slice(-4)}` : "");
const blobUrl = (b: string) => `https://aggregator.walrus-mainnet.walrus.space/v1/blobs/${b}`;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const usd = (x: number) => "$" + (x >= 1000 ? x.toLocaleString("en-US", { maximumFractionDigits: 0 }) : x >= 1 ? x.toFixed(2) : x.toFixed(4));
const timeLeft = (iso: string) => {
  const ms = Date.parse(iso) + 60_000 - Date.now();
  if (ms <= 0) return null;
  const m = Math.ceil(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

type Health = { tatumPrice?: string; tatumSuiGrpc?: string; walrusRelayer?: string };
type Toast = { tone: "good" | "bad" | "info"; body: React.ReactNode };

/** Animates a number toward its target so changes are visible, not just swapped. */
function useCount(target: number, ms = 900) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setV(a + (target - a) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** Fades sections in as they scroll into view. */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("in")), { threshold: 0.08 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  });
}

const Kind = ({ origin }: { origin: string }) => <span className={"badge " + (origin === "person" ? "brand" : "")}>{origin === "person" ? "Person" : "Strategy"}</span>;

export default function Home() {
  const [asset, setAsset] = useState("SUI");
  const [j, setJ] = useState<Journal | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [allRows, setAllRows] = useState(false);
  const [conf, setConf] = useState(70);
  const [whose, setWhose] = useState<"me" | "follow">("me");
  const [name, setName] = useState("");
  const [profile, setProfile] = useState<string | null>(null);
  const [, tick] = useState(0);
  useReveal();

  const load = useCallback(async (a: string) => {
    setErr("");
    try {
      const r = await fetch(`/api/state?asset=${a}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setJ(d);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => { load(asset); }, [asset, load]);
  useEffect(() => { fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => setHealth({})); }, []);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(t); }, []);

  const q = j?.question ?? null;
  const offV = useCount(q?.off ?? 0.5);
  const onV = useCount(q?.on ?? 0.5);
  const open = useMemo(() => (j?.calls ?? []).filter((c) => !c.outcome).sort((a, b) => a.deadline.localeCompare(b.deadline)), [j]);
  const due = open.filter((c) => !timeLeft(c.deadline));
  const resolved = useMemo(() => (j?.calls ?? []).filter((c) => c.outcome), [j]);
  const people = useMemo(() => new Set((j?.calls ?? []).filter((c) => c.origin === "person").map((c) => c.source)), [j]);
  const originOf = (s: string) => (people.has(s) ? "person" : "strategy");

  async function submitCall(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    setBusy("call");
    setToast({ tone: "info", body: <>Saving your call to Sui mainnet. It takes about 20 seconds, and after that it can never be edited.</> });
    const r = await fetch("/api/call", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(f))) });
    const d = await r.json();
    setBusy("");
    if (!r.ok) return setToast({ tone: "bad", body: d.error });
    setToast({
      tone: "good",
      body: (
        <>
          <div><b>Call saved.</b> {d.call.source} says {d.call.asset} will be {d.call.check.type === "price_above" ? "above" : "below"} {usd(d.call.check.usd)} by {when(d.call.deadline)}, with {d.call.confidence}% confidence.</div>
          <div className="chain"><span className="muted">Receipt</span><a className="rc" href={blobUrl(d.blobId)} target="_blank" rel="noreferrer">{d.blobId}</a></div>
          <div><button className="btn ghost sm" onClick={() => setProfile(d.call.source)}>See {d.call.source}&apos;s record</button></div>
        </>
      ),
    });
    setAsset(d.call.asset);
    load(d.call.asset);
  }

  async function settle() {
    setBusy("settle");
    setToast({ tone: "info", body: <>Checking real prices with Tatum at each deadline, then saving results and updated trust to memory…</> });
    const r = await fetch("/api/settle", { method: "POST" });
    const d = await r.json();
    setBusy("");
    if (!r.ok) return setToast({ tone: "bad", body: d.error });
    if (!d.settled) return setToast({ tone: "info", body: "Nothing is due yet." });
    const moves = Object.keys(d.trustAfter)
      .map((s) => ({ s, a: d.trustBefore[s] ?? 0, b: d.trustAfter[s] }))
      .filter((x) => Math.abs(x.b - x.a) >= 0.005)
      .sort((x, y) => Math.abs(y.b - y.a) - Math.abs(x.b - x.a));
    setToast({
      tone: "good",
      body: (
        <>
          <div><b>{d.settled} call{d.settled === 1 ? "" : "s"} settled.</b></div>
          {d.outcomes.map((o: any, i: number) => (
            <div key={i}>{o.asset} finished at <b>{usd(o.observedUsd)}</b>, {o.result ? "so the claim came true" : "so the claim did not happen"} ({o.direction} {usd(o.targetUsd)}).</div>
          ))}
          {moves.length > 0 && (
            <div className="chain">
              <span className="muted">Trust moved</span>
              {moves.map((m) => <span key={m.s} className={"badge " + (m.b > m.a ? "good" : "bad")}>{m.s} {pct(m.a)} → {pct(m.b)}</span>)}
            </div>
          )}
          <div className="chain"><span className="muted">Receipts</span>{d.receipts.filter((x: any) => x.blobId).map((x: any) => <a key={x.blobId} className="rc" href={blobUrl(x.blobId)} target="_blank" rel="noreferrer">{short(x.blobId)}</a>)}</div>
        </>
      ),
    });
    load(asset);
  }

  const status = err ? { cls: "off", text: "Memory unreachable" } : j ? { cls: "", text: `${j.memory.stored} records on Sui mainnet` } : { cls: "wait", text: "Recalling memory…" };

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <Wordmark />
          <nav className="nav">
            <a href="#ask">Ask</a><a href="#try">Try it</a><a href="#call">Make a call</a><a href="#leaderboard">Leaderboard</a><a href="#journal">Journal</a><a href="#how">How it works</a><a href="#proof">Proof</a>
          </nav>
          <div className="grow" />
          <span className="pill"><span className={"dot " + status.cls} /><span>{status.text}</span></span>
        </div>
      </header>

      <main>
        <div className="hero">
          <div>
            <span className="eyebrow">A calibrated prediction journal</span>
            <h1>Know who is <em>actually</em> right.</h1>
            <p className="lead">For anyone who makes calls, or follows people who do. Proven records every call before the event, checks it against real prices after, and remembers who was right and how sure they claimed to be. Then it answers two questions with that memory: <b>who should I trust on this?</b> and <b>how confident should I be?</b></p>
            <div className="cta"><a className="btn" href="#ask">Who should I trust?</a><a className="btn ghost" href="#call">How confident should I be?</a></div>
          </div>
          <div className="steps">
            <div className="step"><span className="k">1</span><div><b>Call it before it happens</b><span>A claim plus a confidence, saved permanently. No editing later.</span></div></div>
            <div className="step"><span className="k">2</span><div><b>Check it against reality</b><span>At the deadline, the real price decides. No one grades their own work.</span></div></div>
            <div className="step"><span className="k">3</span><div><b>Trust follows the record</b><span>Sources that are right, and honest about how sure they are, earn more weight.</span></div></div>
          </div>
        </div>

        <section id="try" className="reveal">
          <div className="head"><div><h2>Try it in 15 minutes</h2><p>Put your own name on the board. Every step below writes to Sui mainnet and is checked with real prices.</p></div></div>
          <div className="tryflow">
            <a className="trystep" href="#call"><span className="k">1</span><b>Make a call</b><span>Pick an asset, a price and how sure you are. Choose "In 15 minutes".</span></a>
            <div className="trystep"><span className="k">2</span><b>Get your receipt</b><span>Your call is saved before the deadline. The receipt link proves it was never changed.</span></div>
            <a className="trystep" href="#call"><span className="k">3</span><b>Check the result</b><span>After the deadline, press "Check results". The real price at that minute decides it.</span></a>
            <a className="trystep" href="#leaderboard"><span className="k">4</span><b>See your trust</b><span>You appear on the leaderboard. Ask again, and your record now counts.</span></a>
          </div>
        </section>

        <section id="ask" className="reveal">
          <div className="head">
            <div><h2>Ask: who should I trust right now?</h2><p>The same open question, answered twice. On the left, everyone counts the same. On the right, Proven uses what it remembers.</p></div>
            <div className="tabs" role="tablist">
              {ASSETS.map((a) => <button key={a} role="tab" aria-selected={asset === a} className="tab" onClick={() => setAsset(a)}>{a}</button>)}
            </div>
          </div>
          <div className="card">
            {err && <div className="toast bad">Memory is unreachable right now. Please try again in a moment.</div>}
            {!j && !err && <div style={{ display: "grid", gap: 12 }}><div className="sk" style={{ width: "45%" }} /><div className="sk" style={{ width: "80%" }} /><div className="sk" style={{ width: "65%" }} /></div>}
            {j && !q && <div className="empty">No open calls on {asset} right now. Make one below, and the answer appears here.</div>}
            {q && (
              <>
                <div className="q">Will {q.claim.replace(/^(\S+) /, "$1 be ")} by {when(q.deadline)}?</div>
                <div className="q-sub">{q.rows.length} sources have an open call on this. {timeLeft(q.deadline) ? `Decided in ${timeLeft(q.deadline)}.` : "Ready to be decided."}</div>
                <div className="compare">
                  <div className="side">
                    <div className="tag">Without memory</div>
                    <div className="big tnum">{pct(offV)} <small>likely</small></div>
                    <div className="expl">Average of what everyone says. The loudest voice counts as much as the most accurate one.</div>
                    <div className="rows">
                      {q.rankOff.map((s, i) => {
                        const r = q.rows.find((x) => x.source === s)!;
                        return (
                          <div className="row" key={s}>
                            <span className="n">{i + 1}</span>
                            <div><div className="who">{s}</div><div className="track"><i style={{ width: `${r.stated * 100}%` }} /></div></div>
                            <span className="r tnum">says {pct(r.stated)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="side on">
                    <div className="tag">With memory <span className="badge brand">{j!.counts.resolved} past results</span></div>
                    <div className="big tnum">{pct(onV)} <small>likely</small> <span className={"mv " + (onV >= offV ? "up" : "down")}>{onV >= offV ? "▲" : "▼"} {Math.abs(Math.round((onV - offV) * 100))}</span></div>
                    <div className="expl">Each source weighted by its record, and each claim corrected by how often that source is really right.</div>
                    <div className="rows">
                      {q.rankOn.map((s, i) => {
                        const r = q.rows.find((x) => x.source === s)!;
                        const mv = q.rankOff.indexOf(s) - i;
                        return (
                          <div className="row" key={s}>
                            <span className="n">{i + 1}</span>
                            <div>
                              <div className="who">{s}{mv !== 0 && <span className={"mv " + (mv > 0 ? "up" : "down")}>{mv > 0 ? "▲" : "▼"}{Math.abs(mv)}</span>}</div>
                              <div className="track"><i style={{ width: `${Math.max(4, r.weight * 100)}%` }} /></div>
                            </div>
                            <span className="r tnum">trust {pct(r.weight)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <Verdict q={q} />
              </>
            )}
          </div>
        </section>

        {j && j.curve.points.length > 2 && (
          <section className="reveal">
            <div className="head"><div><h2>How the trust was learned</h2><p>Everyone starts equal. Each line is a source's share of trust after every round of results.</p></div></div>
            <div className="card"><Curve curve={j.curve} /></div>
          </section>
        )}

        <section id="call" className="reveal">
          <div className="split">
            <div className="card">
              <div className="head" style={{ marginBottom: 12 }}><div><h2>Make a call</h2><p>Log your own call, or one from someone you follow. It is saved before the deadline and checked against the real price after it.</p></div></div>
              <form className="form" onSubmit={submitCall}>
                <div className="field w4">
                  <label>Whose call is this?</label>
                  <div className="tabs" role="tablist" style={{ width: "fit-content" }}>
                    <button type="button" role="tab" className="tab" aria-selected={whose === "me"} onClick={() => setWhose("me")}>Mine</button>
                    <button type="button" role="tab" className="tab" aria-selected={whose === "follow"} onClick={() => setWhose("follow")}>Someone I follow</button>
                  </div>
                </div>
                <div className={"field " + (whose === "follow" ? "w2" : "w4")}>
                  <label htmlFor="f-src">{whose === "me" ? "Your name" : "Their name or handle"}</label>
                  <input id="f-src" name="source" required maxLength={40} placeholder={whose === "me" ? "e.g. Ada" : "e.g. @analyst"} value={name} onChange={(e) => setName(e.target.value)} list="known-sources" autoComplete="off" />
                  <datalist id="known-sources">{(j?.sources ?? []).filter((s) => s.origin === "person").map((s) => <option key={s.source} value={s.source} />)}</datalist>
                </div>
                {whose === "follow" && <div className="field w2"><label htmlFor="f-link">Where they said it (optional)</label><input id="f-link" name="link" type="url" placeholder="https://…" /></div>}
                <div className="field"><label htmlFor="f-asset">Asset</label><select id="f-asset" name="asset" defaultValue={asset}>{ASSETS.map((a) => <option key={a}>{a}</option>)}</select></div>
                <div className="field"><label htmlFor="f-dir">Will be</label><select id="f-dir" name="direction"><option value="above">Above</option><option value="below">Below</option></select></div>
                <div className="field w2"><label htmlFor="f-usd">Price in USD</label><input id="f-usd" name="usd" type="number" step="any" min="0" required inputMode="decimal" placeholder="Target price" /></div>
                <div className="field w2"><label htmlFor="f-h">Deadline</label>
                  <select id="f-h" name="hours" defaultValue="0.25"><option value="0.25">In 15 minutes</option><option value="1">In 1 hour</option><option value="4">In 4 hours</option><option value="24">In 1 day</option><option value="168">In 1 week</option></select>
                </div>
                <div className="field w4"><label htmlFor="f-conf">{whose === "me" ? "How sure are you?" : "How sure are they?"}</label>
                  <div className="range"><input id="f-conf" name="confidence" type="range" min={1} max={99} value={conf} onChange={(e) => setConf(Number(e.target.value))} /><output className="tnum">{conf}%</output></div>
                </div>
                <Advice name={name.trim()} conf={conf} whose={whose} j={j} />
                <div><button className="btn" disabled={!!busy}>{busy === "call" ? <><span className="spin" />Saving…</> : "Save call"}</button></div>
              </form>
            </div>

            <div className="card">
              <div className="head" style={{ marginBottom: 12 }}>
                <div><h2>Waiting for results</h2><p>{open.length ? `${open.length} open call${open.length === 1 ? "" : "s"}.` : "Nothing open."} {due.length ? `${due.length} ready to check.` : ""}</p></div>
                <button className="btn sm" onClick={settle} disabled={!!busy || !due.length}>{busy === "settle" ? <><span className="spin" />Checking…</> : due.length ? "Check results" : "Nothing due"}</button>
              </div>
              <div className="list">
                {open.slice(0, 8).map((c) => (
                  <div className="li" key={c.id}>
                    <div><div className="t"><button className="linkbtn" onClick={() => setProfile(c.source)}>{c.source}</button> <Kind origin={c.origin} /></div><div className="s">{c.claim} · {c.confidence}% sure</div></div>
                    <span className={"badge " + (timeLeft(c.deadline) ? "" : "good")}>{timeLeft(c.deadline) ?? "Ready"}</span>
                  </div>
                ))}
                {open.length > 8 && <div className="muted">and {open.length - 8} more</div>}
              </div>
            </div>
          </div>
          {toast && <div className={"toast " + (toast.tone === "info" ? "" : toast.tone)}>{toast.body}</div>}
        </section>

        <section id="leaderboard" className="reveal">
          <div className="head"><div><h2>Leaderboard</h2><p>Ranked by trust, rebuilt from memory on every visit. Calibration means saying 70% and being right about 70% of the time.</p></div></div>
          <div className="board">
            {(j?.sources ?? []).map((s, i) => {
              const gap = s.avgConfidence - s.hitRate;
              const v = s.resolved < 3 ? ["", "New"] : gap > 0.08 ? ["bad", "Overconfident"] : gap < -0.08 ? ["warn", "Too modest"] : ["good", "Calibrated"];
              return (
                <div className="lb" key={s.source}>
                  <span className="pos">{i + 1}</span>
                  <div><div className="nm"><button className="linkbtn" onClick={() => setProfile(s.source)}>{s.source}</button> <Kind origin={s.origin} /> <span className={"badge " + v[0]}>{v[1]}</span></div>{s.rule && <div className="rule">{s.rule}</div>}</div>
                  <div className="facts">{s.resolved ? <>Right {pct(s.hitRate)} of the time<br />Claims {pct(s.avgConfidence)} on average</> : "No results yet"}</div>
                  <div className="trust"><b className="tnum">{s.score}</b><span>score · trust {pct(s.weight)}</span></div>
                </div>
              );
            })}
            {!j && <div className="card"><div className="sk" style={{ width: "60%" }} /></div>}
          </div>
        </section>

        <section id="journal" className="reveal">
          <div className="head"><div><h2>Journal</h2><p>Every settled call, the real price that decided it, and a receipt for each.</p></div></div>
          <div className="card scroll">
            <table>
              <thead><tr><th>Who</th><th>Call</th><th>Sure</th><th>Result</th><th>Receipts</th></tr></thead>
              <tbody>
                {(allRows ? resolved : resolved.slice(0, 10)).map((c) => (
                  <tr key={c.id}>
                    <td><button className="linkbtn" onClick={() => setProfile(c.source)}>{c.source}</button></td>
                    <td>{c.claim}<div className="muted">{when(c.deadline)}</div></td>
                    <td className="tnum">{c.confidence}%</td>
                    <td><span className={"badge " + (c.outcome!.result ? "good" : "bad")}>{c.outcome!.result ? "Came true" : "Missed"}</span><div className="muted">closed at {usd(c.outcome!.observedUsd)}</div></td>
                    <td>
                      <div className="chain">
                        {c.receipt && <a className="rc" href={blobUrl(c.receipt)} target="_blank" rel="noreferrer">call {short(c.receipt)}</a>}
                        {c.outcome!.receipt && <a className="rc" href={blobUrl(c.outcome!.receipt)} target="_blank" rel="noreferrer">result {short(c.outcome!.receipt)}</a>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {j && !resolved.length && <div className="empty">No settled calls yet.</div>}
            {resolved.length > 10 && <div style={{ marginTop: 14 }}><button className="btn ghost sm" onClick={() => setAllRows(!allRows)}>{allRows ? "Show fewer" : `Show all ${resolved.length}`}</button></div>}
          </div>
        </section>

        <section id="how" className="reveal">
          <div className="head"><div><h2>How Proven decides</h2><p>No hidden settings. Every number on this page comes from these rules, applied to what is in memory.</p></div></div>
          <div className="howgrid">
            <div className="card"><b>1 · Score each call</b><p>Brier score: (confidence − outcome)². Saying 90% and being right costs 0.01. Saying 90% and being wrong costs 0.81. Being honest about doubt is rewarded.</p></div>
            <div className="card"><b>2 · Be careful with little evidence</b><p>Every source starts as if it had 3 coin-flip calls. One lucky call can't put anyone on top; a long record can.</p></div>
            <div className="card"><b>3 · Trust = skill over a coin flip</b><p>Trust is how much better than a coin flip (0.25) a source scores, shared out across sources. Worse than a coin flip keeps a small floor, so anyone can earn their way back.</p></div>
            <div className="card"><b>4 · Correct the claim</b><p>A source saying 80% that is right 60% of the time is read closer to 60%. The more results it has, the more its record outweighs its words.</p></div>
          </div>
        </section>

        <section id="proof" className="reveal">
          <div className="head"><div><h2>Proof</h2><p>Nothing here lives in a private database. The page you are reading was rebuilt from records on Sui mainnet a moment ago.</p></div></div>
          <div className="stats">
            <div className="stat"><b className="tnum">{j?.memory.stored ?? "—"}</b><span>records stored in Walrus Memory</span></div>
            <div className="stat"><b className="tnum">{j?.memory.recalled ?? "—"}</b><span>recalled to build this page{j?.memory.complete ? " (all of them)" : ""}</span></div>
            <div className="stat"><b className="tnum">{j?.counts.resolved ?? "—"}</b><span>calls settled by real prices</span></div>
            <div className="stat"><b className="tnum">{j?.sources.length ?? "—"}</b><span>sources being scored</span></div>
          </div>
          <div className="integr">
            <Integration name="Walrus Memory" ok={health?.walrusRelayer === "ok"} detail="Stores every call, result and trust update" loading={!health} />
            <Integration name="Tatum market data" ok={!!health?.tatumPrice?.startsWith("ok")} detail="Prices at each deadline decide outcomes" loading={!health} />
            <Integration name="Tatum Sui gateway" ok={!!health?.tatumSuiGrpc?.startsWith("ok")} detail="Anchors every result to a Sui checkpoint" loading={!health} />
          </div>
          <p className="muted" style={{ marginTop: 14 }}>
            Memory account {j?.memory.account ? <a href={`https://suiscan.xyz/mainnet/object/${j.memory.account}`} target="_blank" rel="noreferrer">{short(j.memory.account)}</a> : "—"}. Receipts open the stored record on Walrus. Records are encrypted, so a receipt proves when a call was written and that it was never changed; Proven decrypts them with its own key to rebuild this page. Strategies are simple published rules that only see prices from before their call.
          </p>
        </section>

        {profile && j && <Profile source={profile} j={j} onClose={() => setProfile(null)} />}

        <footer>
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><Logo size={18} /> Proven</span>
          <span>Memory by Walrus · Data by Tatum · <a href="https://github.com/datwebguy/proven" target="_blank" rel="noreferrer">Source</a></span>
        </footer>
      </main>
    </>
  );
}

/** "How confident should I be?": reads the stated confidence against this source's remembered record. */
function Advice({ name, conf, whose, j }: { name: string; conf: number; whose: "me" | "follow"; j: Journal | null }) {
  const st = j?.sources.find((s) => s.source.toLowerCase() === name.toLowerCase());
  const you = whose === "me";
  if (!name) return <div className="advice">Enter a name and Proven will tell you what {you ? "your" : "their"} confidence is really worth, based on the record.</div>;
  if (!st || st.resolved === 0)
    return <div className="advice"><b>No record yet for {name}.</b> Saying {conf}% will be taken at face value until results come in. After a few, Proven will show how much {you ? "your" : "their"} confidence is really worth.</div>;
  const adj = Math.round(adjustConfidence(st, conf) * 100);
  const diff = adj - conf;
  return (
    <div className={"advice " + (Math.abs(diff) >= 5 ? (diff < 0 ? "warn" : "good") : "")}>
      <b>How confident should {you ? "you" : "you be in them"} be? {adj}%.</b>{" "}
      {name} {you ? "have" : "has"} been right {pct(st.hitRate)} of the time across {st.resolved} result{st.resolved === 1 ? "" : "s"}, while claiming {pct(st.avgConfidence)} on average.{" "}
      {Math.abs(diff) < 5 ? "This call is in line with the record." : diff < 0 ? `So ${conf}% is likely too high.` : `So ${conf}% is likely too modest.`}
    </div>
  );
}

/** A source's record: accuracy vs claimed confidence, a reliability table, and every call with its receipt. */
function Profile({ source, j, onClose }: { source: string; j: Journal; onClose: () => void }) {
  const st = j.sources.find((s) => s.source === source);
  const calls = j.calls.filter((c) => c.source === source);
  const done = calls.filter((c) => c.outcome);
  const rel = reliability(done.map((c) => ({ confidence: c.confidence, result: c.outcome!.result })));
  const rank = j.sources.findIndex((s) => s.source === source) + 1;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="drawer-bg" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label={`${source}'s record`} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div><div className="muted">Record</div><h3>{source}</h3></div>
          <div style={{ display: "flex", gap: 8 }}>
            <a className="btn sm" href={`/s/${encodeURIComponent(source)}`} target="_blank" rel="noreferrer">Share record</a>
            <button className="btn ghost sm" onClick={onClose} aria-label="Close">Close</button>
          </div>
        </div>
        {st?.rule && <p className="muted" style={{ marginTop: 0 }}>{st.rule}</p>}
        <div className="stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="stat"><b className="tnum">{st ? st.score : "—"}</b><span>{st ? st.label : "score"} · #{rank}</span></div>
          <div className="stat"><b className="tnum">{st?.resolved ? pct(st.hitRate) : "—"}</b><span>right</span></div>
          <div className="stat"><b className="tnum">{st?.resolved ? pct(st.avgConfidence) : "—"}</b><span>claimed</span></div>
        </div>
        <h4>When {source} says…</h4>
        {rel.length ? (
          <div className="rel">
            {rel.map((b) => (
              <div className="relrow" key={b.label}>
                <span className="muted">{b.label}</span>
                <div className="relbars">
                  <div className="track"><i style={{ width: `${b.claimed * 100}%`, background: "#94a3b8" }} /></div>
                  <div className="track"><i style={{ width: `${b.actual * 100}%` }} /></div>
                </div>
                <span className="tnum" style={{ fontSize: 13 }}>right {pct(b.actual)} <span className="muted">of {b.n}</span></span>
              </div>
            ))}
            <div className="legend"><span><i style={{ background: "#94a3b8" }} />claimed</span><span><i style={{ background: "#0f766e" }} />actually right</span></div>
          </div>
        ) : <p className="empty">No settled calls yet.</p>}
        <h4>Calls</h4>
        <div className="list">
          {calls.slice(0, 30).map((c) => (
            <div className="li" key={c.id}>
              <div>
                <div className="t">{c.claim} · {c.confidence}%</div>
                <div className="s">
                  {when(c.deadline)}
                  {c.receipt && <> · <a href={blobUrl(c.receipt)} target="_blank" rel="noreferrer">receipt</a></>}
                  {c.link && <> · <a href={c.link} target="_blank" rel="noreferrer nofollow">source</a></>}
                </div>
              </div>
              {c.outcome ? <span className={"badge " + (c.outcome.result === (c.confidence >= 50) ? "good" : "bad")}>{c.outcome.result === (c.confidence >= 50) ? "Right" : "Wrong"}</span> : <span className="badge">{timeLeft(c.deadline) ?? "Ready"}</span>}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function Verdict({ q }: { q: NonNullable<Journal["question"]> }) {
  const top = q.rankOn[0];
  const loud = q.rankOff[0];
  const lean = q.on >= 0.5 ? "likely" : "unlikely";
  return (
    <div className="verdict">
      Proven's answer: <b>{lean}, {pct(q.on >= 0.5 ? q.on : 1 - q.on)}</b>. Listen to <b>{top}</b> most.
      {loud !== top && <> The most confident voice, <b>{loud}</b>, has not earned that confidence.</>}
    </div>
  );
}

function Integration({ name, ok, detail, loading }: { name: string; ok: boolean; detail: string; loading: boolean }) {
  return (
    <div className="stat">
      <b><span className={"dot " + (loading ? "wait" : ok ? "" : "off")} />{name}</b>
      <span>{loading ? "Checking…" : ok ? detail : "Not reachable right now"}</span>
    </div>
  );
}

function Curve({ curve }: { curve: Journal["curve"] }) {
  const W = 960, H = 240, P = 36;
  const n = curve.points.length - 1;
  const max = Math.max(0.05, ...curve.points.flatMap((p) => Object.values(p.weights)));
  const x = (i: number) => P + (i / Math.max(1, n)) * (W - 2 * P);
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  return (
    <div className="scroll curve">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Trust per source after each round of results" style={{ minWidth: 520 }}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={P} y1={y(max * f)} x2={W - P} y2={y(max * f)} stroke="#eef1f6" />
            <text x={P - 8} y={y(max * f) + 4} fill="#8090a8" fontSize="11" textAnchor="end">{Math.round(max * f * 100)}%</text>
          </g>
        ))}
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#d5d9e4" />
        <text x={P} y={H - 12} fill="#8090a8" fontSize="11">start: everyone equal</text>
        <text x={W - P} y={H - 12} fill="#8090a8" fontSize="11" textAnchor="end">latest results</text>
        {curve.sources.map((s, k) => (
          <path key={s} className="line" fill="none" stroke={COLORS[k % COLORS.length]} strokeWidth={2.75} strokeLinejoin="round" strokeLinecap="round"
            d={curve.points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.weights[s] ?? 0)}`).join(" ")} />
        ))}
      </svg>
      <div className="legend">{curve.sources.map((s, k) => <span key={s}><i style={{ background: COLORS[k % COLORS.length] }} />{s}</span>)}</div>
    </div>
  );
}
