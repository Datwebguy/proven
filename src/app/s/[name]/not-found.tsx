import Link from "next/link";
import { Wordmark } from "../../Logo";

export default function NotFound() {
  return (
    <>
      <header className="topbar"><div className="topbar-in"><Link href="/" style={{ textDecoration: "none" }}><Wordmark /></Link></div></header>
      <main style={{ maxWidth: 720, textAlign: "center", paddingTop: 80 }}>
        <h1 style={{ fontSize: 36, letterSpacing: "-0.02em", margin: "0 0 12px" }}>No record yet</h1>
        <p className="muted" style={{ fontSize: 16 }}>This name hasn&apos;t made a call on Proven. Records appear as soon as someone logs a call under a name.</p>
        <p style={{ marginTop: 24 }}><Link className="btn" href="/#call">Make a call</Link></p>
      </main>
    </>
  );
}
