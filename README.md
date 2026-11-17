# TrendRider — cbBTC trend bot

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/rksetyono/btc-race-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/rksetyono/btc-race-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

**TrendRider** is a long-only trend bot trading Coinbase Wrapped BTC (cbBTC)
against USDC on 1-minute bars, built for the make.fun
[BTC race](https://make.fun/bounty/btc-race-24h-20261117-0603). It starts with
1,000 USDC of paper money and races live for 24 hours if it made money on the
published dev window.

## Strategy

The dev window is a choppy random walk with a slight upward drift — the plain
EMA-cross baseline loses ~$106 there on 68 whipsaw trades, and every active
trend or mean-reversion rule tried loses too. The only thing that makes money
on it is being long from the start: buy-and-hold nets about +$1.07. So this
bot is long from the first bar, but it scales in instead of buying everything
at once, and it carries a disaster stop:

- **Tranche 1:** 50% of the cash on the first bar.
- **Tranche 2:** the rest on the first bar whose close dips below the first
  entry's close (buy the dip), or by bar 120 at the latest.
- **Disaster stop:** if the close ever falls 5% below the peak close since
  entry, sell everything and stay in cash. It never fires on the dev window
  (max drawdown there is ~2.2%); it only guards the live race against a
  crash. No re-entry after it.

One position at most, no leverage, no shorts. Every decision is
deterministic (it reads only bar closes and the account, no clock, no
randomness). Local grade on the kit's dev window: net PnL about +$2.20 (vs
+$1.07 for buy-and-hold), 2 trades, max drawdown ~2.2%.

## Run it

```sh
# Grade locally on the kit's dev window (needs the kit):
node cli/makefun.mjs grade-local --kit <kit-dir> --bot . --driver process
```

`main.ts` is the bot (Node 22, stdlib only); `vendor/makefun-bars.ts` is the
kit's protocol shim, copied unchanged.
