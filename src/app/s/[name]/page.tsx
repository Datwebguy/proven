import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRecord } from "@/lib/record";
import { Wordmark } from "../../Logo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const blobUrl = (b: string) => `https://aggregator.walrus-mainnet.walrus.space/v1/blobs/${b}`;
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

type Props = { params: Promise<{ name: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const name = decodeURIComponent((await params).name);
  const title = `${name}'s record on Proven`;
  const description = `How often ${name} is right, and how much their confidence is worth. Every call saved before the event, checked against real prices.`;
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

export default async function RecordPage({ params }: Props) {
  const name = decodeURIComponent((await params).name);
  const r = await getRecord(name);
  if (!r) notFound();
  return (
    <>
      <header className="topbar"><div className="topbar-in"><Link href="/" style={{ textDecoration: "none" }}><Wordmark /></Link><div className="grow" /><Link className="btn sm" href="/#call">Make your own call</Link></div></header>
      <main style={{ maxWidth: 820 }}>
        <section style={{ marginTop: 36 }}>
          <div className="muted">Record · {r.origin === "person" ? "Person" : "Strategy"}</div>
          <h1 style={{ fontSize: 40, letterSpacing: "-0.03em", margin: "4px 0 6px" }}>{r.source}</h1>
          {r.rule && <p className="muted" style={{ fontSize: 15, marginTop: 0 }}>{r.rule}</p>}
          <div className="scorecard">
            <div className="score-ring" style={{ ["--p" as string]: r.score }}><b className="tnum">{r.score}</b><span>Proven score</span></div>
            <div>
              <div className="score-label">{r.label}</div>
              <p style={{ margin: "4px 0 0", color: "var(--ink-2)" }}>
                {r.resolved ? <>Right <b>{pct(r.hitRate)}</b> of the time while claiming <b>{pct(r.avgConfidence)}</b> on average, across {r.resolved} settled call{r.resolved === 1 ? "" : "s"}. Ranked #{r.rank} of {r.of} by trust ({pct(r.trust)}).</> : "No settled calls yet. The score fills in as results arrive."}
              </p>
              <p className="muted" style={{ margin: "8px 0 0" }}>50 is coin-flip quality. Higher means right more often and honest about how sure.</p>
            </div>
          </div>
        </section>

        {r.reliability.length > 0 && (
          <section style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 20, margin: "0 0 12px" }}>When {r.source} says…</h2>
            <div className="card rel">
              {r.reliability.map((b) => (
                <div className="relrow" key={b.label}>
                  <span className="muted">{b.label}</span>
                  <div className="relbars"><div className="track"><i style={{ width: `${b.claimed * 100}%`, background: "#94a3b8" }} /></div><div className="track"><i style={{ width: `${b.actual * 100}%` }} /></div></div>
                  <span className="tnum" style={{ fontSize: 13 }}>right {pct(b.actual)} <span className="muted">of {b.n}</span></span>
                </div>
              ))}
              <div className="legend"><span><i style={{ background: "#94a3b8" }} />claimed</span><span><i style={{ background: "#0f766e" }} />actually right</span></div>
            </div>
          </section>
        )}

        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 20, margin: "0 0 12px" }}>Calls</h2>
          <div className="list">
            {r.calls.map((c) => (
              <div className="li" key={c.id}>
                <div>
                  <div className="t">{c.claim} · {c.confidence}%</div>
                  <div className="s">{when(c.deadline)}{c.receipt && <> · <a href={blobUrl(c.receipt)} target="_blank" rel="noreferrer">receipt</a></>}{c.link && <> · <a href={c.link} target="_blank" rel="noreferrer nofollow">source</a></>}</div>
                </div>
                <span className={"badge " + (c.right === null ? "" : c.right ? "good" : "bad")}>{c.right === null ? "Open" : c.right ? "Right" : "Wrong"}</span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 14 }}>Every call was saved to Walrus Memory on Sui before its deadline and decided by Tatum&apos;s price at that exact minute. Receipts open the stored record.</p>
        </section>
        <footer><span>Proven · know who is actually right</span><Link href="/">Open Proven</Link></footer>
      </main>
    </>
  );
}
