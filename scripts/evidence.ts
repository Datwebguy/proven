/**
 * Writes EVIDENCE.md: every record Proven has stored on Walrus Memory (mainnet), straight from the
 * on-chain index, so anyone can check counts and blob IDs without trusting the app.
 * Usage: npm run evidence
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { writeFileSync } from "node:fs";
import { mem } from "../src/lib/memory";

async function main() {
  const m = mem();
  const rows: { ns: string; blob: string; created: string; size: number }[] = [];
  let cursor: string | undefined;
  let more = true;
  while (more) {
    const p = await m.listMemories({ cursor, limit: 500 });
    for (const x of p.memories) rows.push({ ns: x.namespace_id, blob: x.blob_id, created: x.created_at, size: x.size });
    cursor = p.next_cursor ?? undefined;
    more = p.has_more;
  }
  rows.sort((a, b) => a.created.localeCompare(b.created));
  const byNs = rows.reduce<Record<string, number>>((acc, r) => ((acc[r.ns] = (acc[r.ns] ?? 0) + 1), acc), {});
  const account = process.env.MEMWAL_ACCOUNT_ID ?? "";
  const md = [
    "# Mainnet evidence",
    "",
    `Generated ${new Date().toISOString()} from the Walrus Memory index (\`listMemories\`), not from the app.`,
    "",
    `- Network: **Sui mainnet**, relayer \`https://relayer.memory.walrus.xyz\``,
    `- Walrus Memory account: [\`${account}\`](https://suiscan.xyz/mainnet/object/${account})`,
    `- Total records: **${rows.length}**`,
    ...Object.entries(byNs).map(([ns, n]) => `  - \`${ns}\`: ${n}${ns === "proven-v2" ? " (one record per memory; carried into proven-v3)" : ns === "proven-v1" ? " (first prototype, kept as history)" : ns === "proven-v3" ? " (current journal: one bundle of records per write)" : ""}`),
    "",
    "Every blob link opens the stored object on the Walrus mainnet aggregator. Records are Seal-encrypted,",
    "so the link proves the record exists and when it was written; the app decrypts them to rebuild the page.",
    "",
    "| # | Namespace | Written (UTC) | Blob ID | Bytes |",
    "|---|---|---|---|---|",
    ...rows.map((r, i) => `| ${i + 1} | ${r.ns} | ${r.created.replace("T", " ").slice(0, 19)} | [\`${r.blob}\`](https://aggregator.walrus-mainnet.walrus.space/v1/blobs/${r.blob}) | ${r.size} |`),
    "",
  ].join("\n");
  writeFileSync("EVIDENCE.md", md);
  console.log("EVIDENCE.md:", rows.length, "records", JSON.stringify(byNs));
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
