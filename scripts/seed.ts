import { config } from "dotenv";
config({ path: ".env.local" });
import { mkdirSync, writeFileSync } from "node:fs";
import { checkpointTxCount, latestCheckpoint } from "../src/lib/chain";
import { spotUsd } from "../src/lib/tatum";
import { mem, NAMESPACE, writeMany } from "../src/lib/memory";
import { PERSONAS, SEED, rng, simulateCall } from "../src/lib/seedplan";
import { join, sourceStats } from "../src/lib/scoring";
import type { CallRecord, OutcomeRecord, ProvenRecord } from "../src/lib/types";

const N_CLAIMS = Number(process.env.N_CLAIMS ?? 10);

async function main() {
  const existing = await mem().listMemories({ namespace: NAMESPACE, limit: 500 });
  const have = existing.memories.filter((m) => m.namespace_id === NAMESPACE).length;
  if (have >= 10 && !process.argv.includes("--force")) {
    console.log(`namespace already has ${have} memories; use --force to add more`);
    return;
  }

  const r = rng(SEED);
  const head = await latestCheckpoint();
  console.log("latest checkpoint", head.seq, "via", head.source);
  const records: ProvenRecord[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < N_CLAIMS; i++) {
    const seq = head.seq - 30_000 - Math.floor(r() * 300_000);
    const c = await checkpointTxCount(seq);
    const threshold = Math.max(5, Math.round(c.txs * (0.6 + r() * 0.8)));
    const truth = c.txs > threshold;
    const base = {
      kind: "CALL" as const,
      topic: "SUI-onchain",
      claim: `Sui mainnet checkpoint ${seq} contains more than ${threshold} transactions`,
      check: { type: "sui_checkpoint_txs_above" as const, checkpoint: seq, count: threshold },
      deadline: new Date(c.timestampMs).toISOString(),
      loggedAt: now,
    };
    for (const p of PERSONAS) {
      const tag = p.source.split("· ")[1].split(" ")[0].toLowerCase();
      const call = simulateCall(r, p, `seed-${i}-${tag}`, truth, base);
      const out: OutcomeRecord = {
        kind: "OUTCOME",
        callId: call.id,
        result: truth,
        evidence: c.source,
        observed: `checkpoint ${seq} had ${c.txs} transactions (threshold ${threshold}) via ${c.source}`,
        resolvedAt: now,
      };
      records.push(call, out);
    }
    console.log(`claim ${i}: cp ${seq} txs=${c.txs} > ${threshold}? ${truth} [${c.source}]`);
  }

  // Calibration snapshots, computed from the records above (a cross-check; scores are always recomputed on read).
  for (const s of sourceStats(join(records))) {
    records.push({ kind: "CALIBRATION", source: s.source, n: s.resolved, brier: +s.brier.toFixed(4), weight: +s.weight.toFixed(4), at: now });
  }

  // Open live calls on SUI price, to be resolved against Tatum's price after the deadline.
  const spot = await spotUsd("SUI");
  const deadline = new Date(Date.now() + 3 * 3600_000).toISOString();
  const strike = +(spot.usd * 1.003).toFixed(4);
  const opens = [52, 94, 55, 71];
  PERSONAS.forEach((p, k) => {
    records.push({
      kind: "CALL",
      id: `live-${k}`,
      source: p.source,
      topic: "SUI",
      claim: `SUI trades above $${strike} (Tatum rate) at the deadline`,
      check: { type: "price_above", symbol: "SUI", usd: strike },
      confidence: opens[k],
      deadline,
      loggedAt: now,
      notes: "SAMPLE: simulated forecaster; spot at logging was $" + spot.usd,
      sample: true,
    });
  });

  console.log(`writing ${records.length} memories to Walrus mainnet (${NAMESPACE})...`);
  const res = await writeMany(records, (d, t) => console.log(`  ${d}/${t}`));
  const receipts = records.map((rec, i) => ({
    kind: rec.kind,
    id: (rec as CallRecord).id ?? (rec as OutcomeRecord).callId ?? (rec as { source?: string }).source,
    blobId: res[i].blobId,
    error: res[i].error,
  }));
  mkdirSync("data", { recursive: true });
  writeFileSync(
    "data/receipts.json",
    JSON.stringify({ account: process.env.MEMWAL_ACCOUNT_ID, namespace: NAMESPACE, network: "sui-mainnet", receipts }, null, 2),
  );
  console.log("ok:", receipts.filter((x) => x.blobId).length, "failed:", receipts.filter((x) => !x.blobId).length);
}

main().catch((e) => {
  console.error("FAIL", e?.message, e?.cause?.message ?? "");
  process.exit(1);
});
