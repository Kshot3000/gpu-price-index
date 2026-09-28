# GPU Price Index

**Live:** https://kshot3000.github.io/gpu-price-index/

Stop overpaying for GPUs. Live rental prices from the [OctaSpace](https://octa.space) marketplace,
compared side-by-side against published [Vast.ai](https://vast.ai) and [RunPod](https://www.runpod.io/pricing)
rates — so you can see exactly how much you save.

Built by [@kshot9000](https://x.com/kshot9000).

## How it works

- **OctaSpace column — live.** The page fetches the current marketplace average asking price per
  GPU from the CORS-open OctaSpace network API (`api.octa.computer`) and auto-refreshes every
  5 minutes. A baked `data/competitors.json` snapshot is the fallback if the API is unreachable.
- **Competitor columns — dated snapshots.** Vast.ai figures are the cheapest "from" offers
  (spot tier) from the [hourly-refreshed madebyagents.com GPU rental index](https://www.madebyagents.com/hardware/gpu-rental-prices)
  (refreshed 2026-09-28; the marketplace moves hourly, so treat these as directional), and RunPod
  (Community + Secure Cloud official rates from [runpod.io/pricing](https://www.runpod.io/pricing),
  verified 2026-09-13). Each is labeled with the date it was verified and a link to its source.
  They do not move in real time — hover any badge for the caveats.
- **Monthly cost calculator.** Pick a GPU and your daily usage to compare the bill across platforms.
- **Savings math is honest.** If OctaSpace loses on a GPU, the page shows negative savings instead
  of hiding the row.

## Honesty guardrails

The averages are real marketplace data, which means thin or weird data happens. The page flags it:

- **"few listings"** — fewer than 5 live listings back the average, so it can swing on a single listing.
- **"verify live"** — the average is far below every competitor (less than 35% of the cheapest),
  which usually means a mispriced or test listing. Check the live marketplace before counting on it.

Competitor methodology in full: OctaSpace prices are live averages of current asking prices,
refreshed in your browser. Competitor prices are verified on the dates shown; "from" prices are
the cheapest offer found (Vast.ai = spot tier). Platform fees, storage, and egress are excluded
from all columns. Exceptions: the A100 Vast.ai cell ($0.75) retains a 2026-09-27 snapshot from
aitooldiscovery.com — the 2026-09-28 refresh listed only 80GB A100 variants, which do not match
this row's 40GB SXM4 SKU, so no figure was swapped in. RunPod has no published Secure/Community
price for the RTX 4070/4080/5070/5080 (checked 2026-09-28 on runpod.io/pricing), so those cells
honestly show no figure.

## Run it locally

It's a static site — no build step, no dependencies:

```bash
git clone https://github.com/Kshot3000/gpu-price-index.git
cd gpu-price-index
python3 -m http.server 8080   # then open http://localhost:8080
```

Or just open `index.html` in a browser (live API fetch works from `file://` too, since the API
is CORS-open; the page falls back to the baked snapshot if anything blocks it).

## Files

| Path | What |
|---|---|
| `index.html` | Page structure, hero, table, calculator, methodology |
| `css/style.css` | All styling (dark theme) |
| `js/app.js` | Live API fetch, table rendering, badges, calculator logic |
| `data/competitors.json` | Dated competitor price snapshots + methodology notes + fallback OctaSpace snapshot |

## Tips

Like the project? Tips: `0x4b6f3BC697D9dAF3e8dE182aEc56eD208B9087f1` (ETH/OCTA)
· [X @kshot9000](https://x.com/kshot9000)
