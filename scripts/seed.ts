/**
 * Builds Proven's starting history on Walrus Memory (mainnet), from real data only.
 *
 * 1. Replay: for each of the last DAYS days and each asset, every strategy makes a 24h call using
 *    Tatum prices from before the call time. Each claim is then decided by Tatum's price at its deadline.
 * 2. Live round: every strategy makes a fresh call on each asset with a short horizon, left open
 *    so it can be settled live.
 *
 * Usage: npm run seed            (refuses if the namespace already has records)
 *        npm run seed -- --force
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { mkdirSync, writeFileSync } from "node:fs";
import { mem, NAMESPACE, writeMany } from "../src/lib/memory";
import { claimKey, resolveGroup } from "../src/lib/resolve";
import { HORIZON_HOURS, strategyCalls } from "../src/lib/round";
import { join, sourceStats } from "../src/lib/scoring";
import type { CallRecord, ProvenRecord } from "../src/lib/types";

const DAYS = Number(process.env.SEED_DAYS ?? 4);
const HOUR = 3600_000;

async function main() {
  const existing = await mem().listMemories({ namespace: NAMESPACE, limit: 50 });
  if (existing.memories.some((m) => m.namespace_id === NAMESPACE) && !process.argv.includes("--force")) {
    console.log(`Namespace ${NAMESPACE} already has records. Use --force to add more.`);
    return;
  }

  const anchor = Math.floor(Date.now() / HOUR) * HOUR - 2 * HOUR; // last full hour, minus margin
  const calls: CallRecord[] = [];
  for (let d = DAYS; d >= 1; d--) {
    const t = anchor - d * 24 * HOUR;
    const batch = await strategyCalls(t, 24);
    calls.push(...batch);
    console.log(`replay ${new Date(t).toISOString()} -> ${batch.length} calls`);
  }

  const groups = new Map<string, CallRecord[]>();
  for (const c of calls) groups.set(claimKey(c), [...(groups.get(claimKey(c)) ?? []), c]);
  const outcomes = [];
  for (const g of groups.values()) {
    const o = await resolveGroup(g);
    outcomes.push(o);
    console.log(`  ${g[0].asset} ${g[0].deadline}: ${o.result ? "up" : "down"} ($${g[0].check.usd} -> $${o.observedUsd}) cp ${o.checkpoint} via ${o.checkpointSource}`);
  }

  const now = new Date().toISOString();
  const snapshots: ProvenRecord[] = sourceStats(join([...calls, ...outcomes])).map((s) => ({
    kind: "CALIBRATION", source: s.source, resolved: s.resolved, brier: +s.brier.toFixed(4), weight: +s.weight.toFixed(4), at: now,
  }));

  const live = await strategyCalls(Date.now() - 2 * 60_000, HORIZON_HOURS);
  console.log(`live round: ${live.length} calls, deadline ${live[0].deadline}`);

  const all: ProvenRecord[] = [...calls, ...outcomes, ...snapshots, ...live];
  console.log(`writing ${all.length} records to Walrus Memory (${NAMESPACE}, mainnet)...`);
  const res = await writeMany(all, (done, total) => console.log(`  ${done}/${total}`));

  const receipts = all.map((r, i) => ({
    kind: r.kind,
    ref: r.kind === "CALL" ? r.id : r.kind === "OUTCOME" ? r.callIds.join(",") : r.source,
    blobId: res[i].blobId ?? null,
    error: res[i].error ?? null,
  }));
  mkdirSync("data", { recursive: true });
  writeFileSync("data/receipts.json", JSON.stringify({ network: "sui-mainnet", account: process.env.MEMWAL_ACCOUNT_ID, namespace: NAMESPACE, writtenAt: now, receipts }, null, 2));
  console.log(`done: ${receipts.filter((r) => r.blobId).length} stored, ${receipts.filter((r) => !r.blobId).length} failed`);
}

main().catch((e) => {
  console.error("seed failed:", e?.message ?? e);
  process.exit(1);
});
