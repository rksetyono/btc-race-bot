// Anchor — a mostly-long cbBTC bot for 1-minute bars.
//
// The dev window is a choppy random walk with a slight upward drift (the plain
// EMA-cross baseline loses ~$106 there on 68 whipsaw trades, and every active
// trend or mean-reversion rule I tried loses too). The only thing that makes
// money on it is being long from the start: buy-and-hold nets about +$1.07.
// So this bot is long from the first bar, but it scales in instead of buying
// everything at once, and it carries a disaster stop:
//
// - **Tranche 1:** 50% of the cash on the first bar.
// - **Tranche 2:** the rest on the first bar whose close dips below the first
//   entry's close (buy the dip), or by bar 120 at the latest.
// - **Disaster stop:** if the close ever falls 5% below the peak close since
//   entry, sell everything and stay in cash. It never fires on the dev window
//   (max drawdown there is ~2.2%); it only guards the live race against a
//   crash. No re-entry after it.
// - One position at most, no leverage, no shorts. Every decision is
//   deterministic: it reads only bar closes and the account, no clock, no
//   randomness.
//
// Local grade on the kit's dev window: net PnL about +$2.2 (vs +$1.07 for
// buy-and-hold), 2 trades, max drawdown ~2.2%.
import { BPS, runBars, type Bar, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const FIRST_TRANCHE_BPS = 5000n; // half the cash on the first bar
const TOP_UP_BAR = 120; // latest bar (since tranche 1) for the second tranche
const TRAIL_BPS = 500n; // disaster stop: 5% below the peak close since entry
const MAX_SLIPPAGE_BPS = 100; // 1% past the close the order was decided on
const RETRY_BARS = 3; // re-send tranche 1 if its fill never landed after this many bars

interface St {
  /** 0 = nothing sent, 1 = tranche 1 sent, 2 = topped up (or stopped out). */
  phase: number;
  /** Close of the first entry bar, once tranche 1 was sent. */
  entryClose: bigint | null;
  /** Highest close seen while holding (0 when flat). */
  peak: bigint;
  /** Fresh bars seen since tranche 1 was sent. */
  barsSinceT1: number;
}

const st: St = { phase: 0, entryClose: null, peak: 0n, barsSinceT1: 0 };

await runBars({
  onBatch(state: BarsState, batch: Batch) {
    let fresh = false;
    for (const bar of batch.bars) {
      if (bar.symbol === SYMBOL) fresh = true;
    }
    if (state.warmingUp || !fresh) return [];
    const close = state.close(SYMBOL);
    if (close === null) return [];
    if (st.phase === 1) st.barsSinceT1 += 1;
    const held = state.positions.get(SYMBOL);
    const { caps, fees } = state.hello;
    const minNotional = BigInt(fees.min_notional_quote_units);

    if (held !== undefined) {
      if (close > st.peak) st.peak = close;
      // --- top up once: on a dip below the first entry, or by bar 120 ---
      if (st.phase === 1) {
        const dip = st.entryClose !== null && close < st.entryClose;
        if (dip || st.barsSinceT1 >= TOP_UP_BAR) {
          let slice = state.cash;
          const room = state.weightRoom(SYMBOL);
          if (room < slice) slice = room;
          st.phase = 2;
          if (slice >= minNotional && slice > 0n) {
            const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: slice, max_slippage_bps: MAX_SLIPPAGE_BPS };
            return [buy].slice(0, caps.max_orders_per_bar);
          }
        }
      }
      // --- disaster stop only ---
      if (st.peak > 0n && close * 10000n <= st.peak * (10000n - TRAIL_BPS)) {
        st.phase = 2;
        st.peak = 0n;
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell].slice(0, caps.max_orders_per_bar);
      }
      return [];
    }

    // --- flat ---
    if (st.phase === 1) {
      // tranche 1's fill never landed (rejected: no bar, slippage): try again
      if (st.barsSinceT1 > RETRY_BARS) {
        st.phase = 0;
        st.entryClose = null;
        st.barsSinceT1 = 0;
      }
      return [];
    }
    if (st.phase === 2) return []; // topped up and out, or stopped out: stay in cash

    // phase 0: tranche 1, half the cash on the first bar
    let slice = (state.cash * FIRST_TRANCHE_BPS) / BPS;
    const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
    if (byWeight < slice) slice = byWeight;
    if (slice <= 0n || slice < minNotional) return [];
    st.phase = 1;
    st.entryClose = close;
    st.peak = close;
    st.barsSinceT1 = 0;
    const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: slice, max_slippage_bps: MAX_SLIPPAGE_BPS };
    return [buy].slice(0, caps.max_orders_per_bar);
  },
});
