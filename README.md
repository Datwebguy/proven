<p align="center">
  <img src="docs/logo.svg" width="72" alt="Proven logo" />
</p>
<h1 align="center">Proven</h1>
<p align="center"><b>Know who is actually right.</b><br/>A prediction journal that remembers every call on Sui mainnet and learns whom to trust.</p>
<p align="center">
  <a href="https://proven-ten.vercel.app"><b>Live app</b></a> ·
  <a href="EVIDENCE.md">Mainnet evidence</a> ·
  <a href="https://proven-ten.vercel.app/api/health">Live status</a>
</p>

<p align="center"><img src="docs/screenshot.png" alt="Proven: the same question answered without and with memory" width="900"/></p>

## What it does

Everyone who makes market calls sounds sure. Proven keeps score.

1. **Call it before it happens.** A source states a claim and a confidence ("SUI above $0.85 by 10:35, 80% sure"). The call is written to **Walrus Memory on Sui mainnet** before the deadline. Its blob ID is the receipt; it can't be edited later.
2. **Check it against reality.** At the deadline, **Tatum's historical price data** decides the outcome at that exact minute. The result is written back to memory and anchored to a Sui checkpoint read through **Tatum's Sui gateway**.
3. **Trust follows the record.** Proven scores every source on accuracy *and* honesty (a Brier score: claiming 90% and missing costs far more than claiming 60% and missing). The next time you ask, the answer is weighted by that record.

The main screen asks one question two ways. **Without memory**, every source counts the same and the loudest claim wins. **With memory**, sources are weighted by what Proven remembers, and the answer and the ranking change.

## Where the data comes from

There is no seeded or invented data. Two kinds of sources make calls:

| Source | How it calls |
|---|---|
| **Trend Follower** | Bets the last 24 hours' move continues. Bigger move, more confident. |
| **Mean Reverter** | Bets the last 24 hours' move snaps back. |
| **Momentum 4h** | Follows the last 4 hours. Never above 75%. |
| **Perma-Bull** | Always says up, always 80% sure. |
| **People** | Anyone can log a call in the app, with their own name and confidence. |

The strategies are simple published rules ([`src/lib/strategies.ts`](src/lib/strategies.ts)) that only see Tatum prices from *before* their call. Proven is not told which one is good; it has to learn it.

**What it learned** from the first 64 settled calls (four days, SUI/SOL/BTC/ETH):

| Source | Right | Claims on average | Verdict | Trust |
|---|---|---|---|---|
| Momentum 4h | 62% | 58% | Calibrated | **57%** |
| Mean Reverter | 56% | 68% | Slightly overconfident | 14% |
| Trend Follower | 44% | 68% | Overconfident | 14% |
| Perma-Bull | 31% | 80% | Overconfident | 14% |

Sources that score worse than a coin flip share a small floor of trust rather than reaching zero, so they can earn their way back.

## How it uses Walrus Memory

Walrus Memory is the only store of record. There is no database and no cache.

- Every call, outcome and trust update is an append-only record. Each write (one call, a whole strategy round, or a settlement's outcomes and trust snapshots) is **one Walrus memory** holding a bundle of records, `PROVEN/3 {"records":[…]}`, in namespace `proven-v3`. Bundling keeps the journal to a handful of memories, so a full rebuild is one recall of a few seconds.
- Records carried over from the earlier one-record-per-memory namespace (`proven-v2`) keep a `receipt` pointing at the blob where they were first written, so "saved before the deadline" stays provable ([`scripts/migrate-v3.ts`](scripts/migrate-v3.ts)).
- On every page load the server counts the namespace with `listMemories`, recalls the records with `recall`, and recomputes every score from scratch ([`src/lib/memory.ts`](src/lib/memory.ts), [`src/lib/scoring.ts`](src/lib/scoring.ts)). The Proof section shows *stored* vs *recalled* so you can see nothing is missing.
- One outcome record settles every call on the same claim, which keeps the journal compact.
- Every memory on mainnet is listed with its blob ID in [EVIDENCE.md](EVIDENCE.md).

## How it uses Tatum

| Tatum product | Used for |
|---|---|
| **Data API, historical OHLCV** (`/v4/data/rate/symbol/OHLCV`) | The price at the exact deadline minute decides every outcome; strategies read 4h and 24h history. |
| **Data API, spot rate** (`/v4/data/rate/symbol`) | The price shown when a person logs a call. |
| **Sui gRPC gateway** (`sui-mainnet-grpc.gateway.tatum.io`, native gRPC with `x-api-key` metadata) | Anchors every outcome to the current Sui checkpoint; powers the live status check. |

If Tatum's Sui gateway is unreachable, the code falls back to a public fullnode and the record says so (`checkpointSource`). Labels are never faked: the first replay batch was settled from a sandbox that could not reach native gRPC, so those 16 outcomes carry `sui-fullnode-grpc`; settlements from the live app carry `tatum-sui-grpc`.

## The learning loop runs by itself

[`.github/workflows/loop.yml`](.github/workflows/loop.yml) runs every hour:

1. `POST /api/settle` settles every call whose deadline has passed (Tatum price at the deadline → outcome + new trust snapshots on Walrus).
2. `POST /api/round` has every strategy make a fresh 4-hour call on each asset.

Both are idempotent. The journal keeps growing and keeps learning without anyone clicking.

## API

| Route | |
|---|---|
| `GET /api/state?asset=SUI` | The journal, rebuilt from Walrus: the open question with/without memory, leaderboard, learning curve, calls with receipts. |
| `POST /api/call` | Log a person's call (validated, written to Walrus, returns the blob ID). |
| `POST /api/settle` | Settle due calls; returns outcomes, trust before/after and receipts. |
| `POST /api/round` | Open a new strategy round. |
| `GET /api/health` | Live status of Walrus, Tatum prices and Tatum Sui gRPC. Never returns keys. |

## Run it yourself

```bash
npm install
cp .env.example .env.local   # your mainnet Walrus Memory account + delegate key, your Tatum key
npm run smoke                 # remember + recall on mainnet
npm run seed                  # replay the last 4 days from Tatum prices and open a live round
npm run dev
npm test                      # scoring, strategies, codec
npm run evidence              # regenerate EVIDENCE.md from the Walrus index
```

Create the account and delegate key at <https://memory.walrus.xyz> (mainnet). Use a delegate key, never a wallet key.

## Project layout

```
src/lib/strategies.ts  rule-based forecasters (inputs: Tatum prices before the call)
src/lib/tatum.ts       Tatum prices: spot + exact-minute historical candles
src/lib/chain.ts       Sui checkpoints over native gRPC (Tatum first, labelled fallback)
src/lib/memory.ts      Walrus Memory writes and the full rebuild
src/lib/resolve.ts     decide a claim from the price at its deadline
src/lib/settle.ts      settle everything due, write outcomes + trust snapshots
src/lib/scoring.ts     Brier score, trust weights, memory off vs on (pure, tested)
src/app/               the app and API routes
scripts/               smoke test, seed (replay), evidence, account check
```

## Honest limits

- Strategy calls in the first four days were **replayed**: each was computed from prices before its call time and settled by the real price afterwards, but they were written to memory after the fact. Every call made since the live round opened was written before its deadline.
- Records are encrypted by Walrus Memory. A blob link proves a record exists and when it was written; reading its contents needs the account's key.
- Four days is a small sample. The trust numbers will move as the hourly loop adds results; that is the point.
