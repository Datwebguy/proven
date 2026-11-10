# Proven: a prediction journal that remembers who was right

*Live app: https://proven-ten.vercel.app · Code: https://github.com/datwebguy/proven*

## The problem

Open any crypto feed and you will see confident calls. "SUI breaks out this week, 90% sure." A few days later nobody checks, and the same voice is just as loud on the next call. The feed has no memory, so confidence is free.

Two things are missing. First, a record that can't be edited after the fact. Second, a way to turn that record into a better answer next time: not just "who was right most often", but "who is honest about how sure they are".

## What Proven does

Proven is a prediction journal with three steps.

1. **Call it before it happens.** A source states a claim and a confidence: "SOL above $88 by 10:35, 70% sure". Proven writes it to **Walrus Memory on Sui mainnet** before the deadline. The blob ID is the receipt.
2. **Check it against reality.** At the deadline, **Tatum's** historical price data gives the price at that exact minute, and that decides the outcome. Proven writes the result back to memory and anchors it to the current Sui checkpoint, read through **Tatum's Sui gRPC gateway**.
3. **Trust follows the record.** Every source gets a Brier score, which rewards being right *and* being honest about confidence. Saying 90% and missing costs far more than saying 60% and missing.

The main screen asks one question two ways, side by side. **Without memory**, every source counts equally and stated confidence is taken at face value. **With memory**, each source is weighted by its record, and each claim is corrected by how often that source is really right. Same question, different answer, and the only difference is memory.

## Who makes the calls

I didn't want fake people or hand-picked results, so the first sources are four simple, published rules. Each one only sees Tatum prices from before its call:

- **Trend Follower** bets the last day's move continues.
- **Mean Reverter** bets it snaps back.
- **Momentum 4h** follows the last four hours and never claims more than 75%.
- **Perma-Bull** always says up, always 80% sure: the loud voice every feed has.

Proven is never told which one is good. It has to learn that from outcomes. Anyone can also log their own calls in the app under their own name and be scored the same way.

## How it uses Walrus Memory

Walrus Memory is the only store of record. There's no database behind the app.

- Every call, outcome and trust update is an append-only record in one namespace. An outcome never edits a call; it's a new record that points at it.
- On every page load, the server counts the namespace with `listMemories`, recalls the records with `recall`, and recomputes every score from scratch. The page shows how many records are stored and how many were recalled, so you can see the rebuild is complete.
- Delete the server, start a new one, and the same ranking comes back, because it was never stored anywhere else.

Each write is one Walrus memory holding a bundle of records (a whole round of calls, or a settlement's results and trust updates), so the full journal rebuilds in a couple of seconds. Every memory Proven has written to mainnet, 222 so far, is listed with its blob ID in the repo's EVIDENCE.md.

## How it uses Tatum

Tatum is the referee and the clock.

- **Historical price data** (`/v4/data/rate/symbol/OHLCV`) gives the price at the exact minute of each deadline. That's what decides every outcome, so nobody grades their own work. The strategies also use it to read the 4-hour and 24-hour history they're allowed to see.
- **Spot rates** show the current price when a person logs a call.
- **The Sui gRPC gateway** anchors each result to a Sui checkpoint and powers the live status check. Tatum's gateway speaks native gRPC, so Proven connects with `@grpc/grpc-js` and sends the key as `x-api-key` metadata.

## How it learned over time

Proven replayed the four days from 6 to 10 November across SUI, SOL, BTC and ETH: 64 calls from the four strategies, each decided by Tatum's price at its deadline. Everyone starts with equal trust, 25% each. Here's how that changed as results came in:

| After results from | Momentum 4h | Mean Reverter | Trend Follower | Perma-Bull |
|---|---|---|---|---|
| Start | 25% | 25% | 25% | 25% |
| 7 Nov | 35% | 29% | 4% | 32% |
| 8 Nov | 38% | 52% | 5% | 5% |
| 9 Nov | 55% | 29% | 8% | 8% |
| 10 Nov, 04:00 | **57%** | 14% | 14% | 14% |
| 10 Nov, 10:35 (live) | **49%** | 17% | 17% | 17% |

The story is in the middle rows.

- **Perma-Bull** looked fine after the first day, because three of four assets went up. Then prices fell for two days, and its trust collapsed. It ended right 31% of the time while claiming 80%.
- **Mean Reverter** led on 8 November after catching a reversal, then gave it back.
- **Momentum 4h** never claimed much (58% on average) and was right 62% of the time. It's the only source that is both better than a coin flip and honest about it, so it ended up with most of the trust.

Then came the first live round: calls saved to Walrus at 06:35, decided by Tatum's price at 10:35. All four assets fell, so every "higher" call missed, Momentum 4h included. Its trust dropped from 57% to 49%, and the others gained a little. That's the point: trust is never fixed, it follows the latest record.

The other three still score worse than a coin flip. Proven gives each the same small floor of trust rather than zero, so they can earn their way back.

You can see this on the live question. For "Will SUI be above $0.8468 by 10:35?":

- **Without memory**, Proven says **61% likely**, led by Perma-Bull's 80%.
- **With memory**, it says **56%**, listens to Momentum 4h most, and moves Perma-Bull from first to third.

The page states it plainly: the most confident voice has not earned that confidence.

## How people use it

- **Ask who to trust.** Pick SUI, SOL, BTC or ETH and see the open question answered without memory and with memory, side by side.
- **Ask how confident to be.** When you make a call, Proven reads your confidence against your record before you save: "you've been right 63% while claiming 58%, so 70% is likely too high".
- **Track people you follow.** Log a call for any analyst, or paste a link to their post on X and Proven fills in the call from it.
- **See anyone's record.** Every source has a Proven score from 0 to 100 (50 is a coin flip), a "when they say 80%, they're right X%" chart, every call with its receipt, and a shareable page with a preview card.
- **Follow without an account.** Get a browser alert when someone you follow makes a call or gets a result, or subscribe to their RSS feed in Slack, Discord or Telegram. No sign-in anywhere.

## It keeps learning

A GitHub Actions workflow runs every hour. It settles every call whose deadline has passed (Tatum price → outcome → new trust snapshots on Walrus), then asks every strategy for a fresh four-hour call. The journal grows and the trust keeps moving without anyone clicking a button.

## Honest limits

- The first four days were **replayed**. Each call was computed only from prices before its call time and settled by the real price afterwards, but it was written to memory after the fact. Every call since the live round opened was written before its deadline.
- Walrus Memory encrypts records. A blob link proves a record exists and when it was written; reading it needs the account key.
- Four days is a small sample. That's exactly why the numbers keep moving, and why the trust curve matters more than any single score.

## What's next

Calls from real people and public accounts, scored the same way. Per-asset trust, so a source can be good on BTC and bad on SUI. And a public, shareable record for each source, so the next time someone says "90% sure", you can check what their 90% has been worth.

*Built with Walrus Memory (`@mysten-incubation/memwal`) and Tatum.*
