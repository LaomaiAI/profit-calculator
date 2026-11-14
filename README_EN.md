# Cross-Border Profit Calculator (profit-calculator)

A "true take-home profit" calculator for small and mid-size Amazon sellers:
**sale price − referral fee − FBA/storage − procurement/first-leg/tariffs − ads − returns − FX gain/loss = real per-unit profit**, aggregated by SKU and by month into a P&L.

Live demo: https://laomaiai.github.io/profit-calculator/

Chinese version: [README.md](./README.md).

## What problem it solves

Amazon sellers often see revenue but not take-home profit: referral and FBA fees rise every year, ads eat margin, returns eat more, and FX moves eat the rest. Hand-made spreadsheets cannot keep up with fee changes, and Amazon's native tools show ad-side data only — not "profit after ads".

This tool does three things:

1. **Per-unit profit calculator**: a 6-layer formula, every layer editable; drag sliders to simulate price, ad spend, and return-rate changes live; shows breakeven price and breakeven ACOS directly.
2. **Ads-to-profit linkage**: enter monthly ad spend, ad sales, and total sales to compare ACOS, TACoS, and breakeven ACOS, and see whether ads are losing money after all costs.
3. **Batch CSV import**: upload a settlement/order CSV you exported yourself from Seller Central; get per-SKU profit summaries and monthly trends, loss-making SKUs highlighted in red, and export the summary as CSV.

## What makes it different

- **Transparent formulas**: every cost layer is shown, with fee sources and verification dates in the UI and in `docs/fees-2026.md`. No black box.
- **Local-first**: pure frontend computation, no backend. Your financial data never leaves the browser — nothing is uploaded or stored.
- **Clear compliance boundary**: only uses CSVs you exported yourself. It does not scrape Amazon or any platform. No stocks, no crypto, no custody, no trading on behalf of users.
- **Sourced FX rates**: Frankfurter (ECB official rates, free, no key, daily). If unreachable, a fallback table clearly labelled with its date is used — never presented as live.

## Run locally in 3 steps

```bash
npm install
npm run dev      # open http://localhost:5173
npm run build    # production build
npm test         # unit tests (Vitest)
```

Requires Node.js 20+.

## Fee sources and version

Amazon 2026 fees (verified 2026-09-10, sources: MyRealProfit / eDesk):

- Referral fee: 15% for most categories (adjustable 8%–15% by category)
- FBA fulfillment fee: +$0.08/unit on average from 2026-01-15; +3.5% fuel/logistics surcharge from 2026-04-17
- Storage: $0.78/cu ft/month off-peak, $2.40/cu ft/month peak season

Full schedule and version history: [docs/fees-2026.md](./docs/fees-2026.md). Fees change every year — please verify against Amazon's official fee pages before use.

## CSV format

Required columns: SKU, units, price. Optional: referral fee, FBA fee, ad spend, return units, per-unit return cost, landed cost per unit, date. Column names accept English and Chinese aliases (see the alias table in `src/lib/csv.ts`). Sample file: `public/sample-settlement.csv` (synthetic data, for demo only).

## Deterministic computation layer

All computation in this tool is done by code: the core formulas live in `src/lib/profit-core.ts` as pure TypeScript deterministic functions (no network calls, no LLM involvement) — same input, same output. FX rates come from the Frankfurter API (currency codes only); if unreachable, a fallback table labelled with its date is used. This product uses no large language model.

## How to test

All core formulas live in `src/lib/profit-core.ts` (pure TypeScript functions — no network, no LLM). Tests are in `src/lib/profit-core.test.ts`:

```bash
npm test
```

Coverage: referral fee, FBA surcharge, storage (off-peak/peak), return cost, ACOS/TACoS, breakeven ACOS, breakeven price, the 6-layer per-unit profit formula, currency conversion, and per-SKU / per-month aggregation (including loss flagging and empty-input guards).

## Tech stack

React + Vite + Tailwind CSS + TypeScript; the calculation layer is pure TS functions; CSV parsing with papaparse; FX rates from the Frankfurter API (called directly from the browser, currency codes only, no amounts).

## Disclaimer

Results are for reference only and do not constitute business or tax advice. For tax matters, consult your local tax authority or a licensed tax professional.

## Roadmap

- Phase 1 (this repo): per-unit calculator, CSV batch import, ads linkage, FX rates.
- Phase 2 (not started): read-only SP-API access (settlement and returns reports, seller-authorized) and Ads API pulls to replace manual CSVs.
