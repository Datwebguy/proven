# Proven

**A prediction journal that learns who is actually right.**

You log a call with a confidence number *before* the event. When it resolves, Proven writes the
outcome and the updated calibration to **Walrus Memory on Sui mainnet**. The next time you ask
"who should I trust on this?", the ranking and the blended answer are rebuilt from those
memories, so the same question gives a different result with memory on than with memory off.

Built for the Walrus × Tatum **Total Recall** hackathon (track: Markets & Sports Prediction).

## The loop

1. **Log** a call: source, claim, confidence (0–100), deadline. It is written to Walrus Memory
   (`rememberAndWait` returns a real mainnet **blob ID**, shown in the ledger).
2. **Resolve** after the deadline with real data: Tatum Data API prices, or Sui checkpoint data
   read over gRPC (Tatum's Sui gateway first, public fullnode as a labelled fallback).
3. **Write back** the outcome and refreshed calibration snapshots to Walrus Memory.
4. **Ask**: the screen shows the same question twice.
   - **Memory off**: every source counts equally, stated confidence taken at face value.
   - **Memory on**: sources weighted by their recalled track record; each source's stated
     confidence is blended with what it actually achieves.
5. **Reload anywhere**: nothing is cached locally. On every load the server calls
   `listMemories` (exact on-chain count) and `recall`, decodes the records, and recomputes all
   scores. The UI shows recalled count vs. on-chain count so you can see they match.

## How scoring works (`src/lib/scoring.ts`)

- Per source: Brier score over resolved calls, shrunk toward a coin flip with `K = 3` prior
  calls, so one lucky call cannot put a source on top.
- Trust weight ∝ improvement over a coin flip (normalised across sources, never zero).
- Memory-on confidence per source: `(n·hitRate + K·statedSideConfidence) / (n + K)`; the more
  resolved evidence, the more the track record outweighs the claim.
- Guidance = trust-weighted mean of those adjusted confidences. Nothing is hardcoded; the
  ranking is a pure function of recalled records (see `tests/scoring.test.ts`).

## What is stored on Walrus

One namespace (`proven-v1`), three record kinds, each `PROVEN/1 {json}`:
`CALL`, `OUTCOME`, `CALIBRATION`. Walrus Memory Seal-encrypts every blob, so a blob link shows
the stored object but not its plaintext; Proven decrypts through the relayer with the delegate key.

## Tatum usage

- **Data API** (`/v4/data/rate/symbol`): resolves price calls and records spot at logging time.
- **Sui gRPC gateway**: checkpoint reads for resolving on-chain claims. If the gateway refuses the
  key, the code falls back to a public fullnode and the outcome's `evidence` field says which
  source decided it (`tatum-sui-grpc` or `sui-fullnode-grpc`). Evidence labels are never faked.

## Honest data disclosure

The demo journal contains **simulated forecasters** (`Sample · …`), generated from a published RNG
seed (`src/lib/seedplan.ts`). They are not real people and no private data is used. Their claims
about already-finalised Sui checkpoints were backfilled and then resolved from real chain data, so
the learning loop is real but those calls were not predictions made in advance. Calls you log in the
app are real and written before the event.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in your own mainnet account + delegate key
npm run smoke                 # remember + recall on mainnet
npm run seed                  # writes the demo journal, prints blob IDs -> data/receipts.json
npm run dev
```

Account and delegate key: create them at <https://memory.walrus.xyz> (mainnet). Use a delegate key,
never your wallet key. `.env.local` is git-ignored.

Environment: `MEMWAL_PRIVATE_KEY`, `MEMWAL_ACCOUNT_ID`, `NEXT_PUBLIC_MEMWAL_ACCOUNT_ID`,
`TATUM_API_KEY`; optional `MEMWAL_SERVER_URL`, `MEMWAL_NAMESPACE`, `TATUM_SUI_GRPC_URL`.

## Layout

```
src/lib/scoring.ts   calibration + ranking (pure, tested)
src/lib/memory.ts    Walrus Memory writes, bulk writes, full reload
src/lib/chain.ts     Sui checkpoint reads over gRPC (Tatum first)
src/lib/tatum.ts     Tatum Data API prices
src/lib/resolve.ts   resolves claims from real data
src/app/             the single screen + /api/{state,call,resolve}
scripts/             smoke, seed, account diagnostics
data/receipts.json   blob IDs written by the seed (a receipt, not the source of truth)
```
