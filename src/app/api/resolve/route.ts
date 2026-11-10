import { NextResponse } from "next/server";
import { loadAll, writeMany } from "@/lib/memory";
import { resolveClaim } from "@/lib/resolve";
import { guidance, join, sourceStats } from "@/lib/scoring";
import type { OutcomeRecord, ProvenRecord } from "@/lib/types";

export const maxDuration = 60;

/**
 * Resolve every open call that shares this call's claim, using real data (Tatum price / Sui checkpoint),
 * then write the outcomes and refreshed calibration snapshots back to Walrus.
 * Returns the ranking before and after so the UI can show the memory changing the result.
 */
export async function POST(req: Request) {
  try {
    const { callId } = await req.json();
    const { records } = await loadAll();
    const before = join(records.map((r) => r.record));
    const target = before.find((j) => j.call.id === callId);
    if (!target) return NextResponse.json({ error: "call not found in Walrus memory" }, { status: 404 });
    if (target.outcome) return NextResponse.json({ error: "already resolved" }, { status: 409 });
    const topic = target.call.topic;
    const g0 = guidance(before, topic);

    const verdict = await resolveClaim(target.call);
    const siblings = before.filter(
      (j) => !j.outcome && j.call.claim === target.call.claim && j.call.deadline === target.call.deadline,
    );
    const outcomes: OutcomeRecord[] = siblings.map((j) => ({ ...verdict, callId: j.call.id }));
    const after = join([...records.map((r) => r.record), ...outcomes]);
    const touched = new Set(siblings.map((j) => j.call.source));
    const snaps: ProvenRecord[] = sourceStats(after)
      .filter((s) => touched.has(s.source))
      .map((s) => ({
        kind: "CALIBRATION" as const,
        source: s.source,
        n: s.resolved,
        brier: +s.brier.toFixed(4),
        weight: +s.weight.toFixed(4),
        at: new Date().toISOString(),
      }));
    const batch: ProvenRecord[] = [...outcomes, ...snaps];
    const res = await writeMany(batch);
    const g1 = guidance(after, topic);
    return NextResponse.json({
      verdict: { result: verdict.result, observed: verdict.observed, evidence: verdict.evidence },
      blobs: batch.map((b, i) => ({ kind: b.kind, blobId: res[i].blobId, error: res[i].error })),
      before: { off: g0.off, on: g0.on, rankOn: g0.rankOn },
      after: { off: g1.off, on: g1.on, rankOn: g1.rankOn },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
