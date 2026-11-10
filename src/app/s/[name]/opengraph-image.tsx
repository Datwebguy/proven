import { ImageResponse } from "next/og";
import { getRecord } from "@/lib/record";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A Proven record";

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The preview card people see when a record link is shared. */
export default async function Image({ params }: { params: Promise<{ name: string }> }) {
  const name = decodeURIComponent((await params).name);
  const r = await getRecord(name).catch(() => null);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: "linear-gradient(135deg, #f0fdfa 0%, #ffffff 55%)", fontFamily: "sans-serif", color: "#0d1424" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="56" height="56" viewBox="0 0 64 64">
            <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0B5F59" /><stop offset="1" stopColor="#14B8A6" /></linearGradient></defs>
            <rect width="64" height="64" rx="16" fill="url(#g)" />
            <path d="M32 12a20 20 0 1 0 20 20" fill="none" stroke="#fff" strokeOpacity=".38" strokeWidth="4" strokeLinecap="round" />
            <path d="M21 33.5l7 7L44 22" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="44" cy="22" r="4.2" fill="#fff" />
          </svg>
          <div style={{ display: "flex", fontSize: 36, fontWeight: 700 }}>Proven</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 56 }}>
          <div style={{ width: 230, height: 230, borderRadius: 999, border: "18px solid #14b8a6", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ display: "flex", fontSize: 88, fontWeight: 800 }}>{r ? r.score : "—"}</div>
            <div style={{ display: "flex", fontSize: 22, color: "#4a5568" }}>Proven score</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 700 }}>
            <div style={{ display: "flex", fontSize: 64, fontWeight: 800, letterSpacing: -2 }}>{name}</div>
            <div style={{ display: "flex", fontSize: 32, color: "#0f766e", fontWeight: 700 }}>{r ? r.label : "No record yet"}</div>
            <div style={{ display: "flex", fontSize: 28, color: "#4a5568" }}>
              {r && r.resolved ? `Right ${pct(r.hitRate)} while claiming ${pct(r.avgConfidence)} · ${r.resolved} settled calls` : "Every call saved before the event, checked against real prices."}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#8090a8" }}>Know who is actually right · calls remembered on Sui</div>
      </div>
    ),
    size,
  );
}
