/* GPU Price Index — live OctaSpace prices vs published competitor rates.
   Honesty rules baked in:
   - OctaSpace = live average asking price, listing count shown.
   - <5 listings -> "few listings" badge. Price <35% of cheapest competitor -> "verify live" badge.
   - Competitor columns are dated snapshots with sources, never presented as live. */

const OCTA_API = "https://api.octa.computer/network";
const LOW_DATA_N = 5;
const OUTLIER_RATIO = 0.35;

const $ = (s) => document.querySelector(s);
const fmt$ = (n) => "$" + n.toFixed(2);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let DATA = null;
let HISTORY = []; // [{captured, gpus: {name: {avg_price, count}}}] — real scheduled captures, oldest first
let octaLive = null; // {name: {avg_price, count}}
let octaLiveAt = null;
let octaIsLive = false;

async function loadData() {
  try {
    const [dres, hres] = await Promise.all([
      fetch("data/competitors.json?v=33"),
      fetch("data/octa-history.json?v=10").catch(() => null),
    ]);
    if (!dres.ok) throw new Error("data " + dres.status);
    DATA = await dres.json();
    if (hres && hres.ok) {
      const h = await hres.json();
      HISTORY = Array.isArray(h.points) ? h.points : [];
    }
  } catch (e) {
    if (!DATA) {
      // First load failed (offline or blocked fetch): say so instead of a blank page.
      const pill = $("#livePill");
      if (pill) pill.textContent = "Couldn\u2019t load price data \u2014 check your connection and refresh.";
      return;
    }
    // Scheduled/manual refresh failed: keep the last good data on screen.
    return;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(OCTA_API, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error("API " + r.status);
    const j = await r.json();
    octaLive = j.marketplace.gpus;
    octaLiveAt = new Date();
    octaIsLive = true;
  } catch (e) {
    octaLive = DATA.fallbackOcta.gpus;
    octaLiveAt = new Date(DATA.fallbackOcta.captured);
    octaIsLive = false;
  }
  render();
}

function octaFor(gpu) {
  const o = octaLive[gpu.octa_match];
  return o || null;
}

function competitorMin(prices) {
  const vals = Object.values(prices).filter((v) => typeof v === "number");
  return vals.length ? Math.min(...vals) : null;
}

let firstRender = true;

function render() {
  renderMeta();
  renderTable();
  renderChips();
  renderCalc(firstRender);
  renderSources();
  firstRender = false;
}

function renderMeta() {
  const livePill = $("#livePill");
  const when = octaLiveAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  livePill.innerHTML = octaIsLive
    ? `<span class="pulse"></span> <span class="pill-txt">OctaSpace prices live · updated ${esc(when)}</span>`
    : `<span class="pulse" style="background:var(--amber)"></span> <span class="pill-txt">OctaSpace snapshot · ${esc(when)} (live fetch failed)</span>`;

  // hero stats
  const rows = DATA.gpus.map((g) => ({ g, o: octaFor(g) })).filter((r) => r.o);
  const cheapest4090 = rows.find((r) => r.g.id === "rtx4090");
  const savings = rows
    .map((r) => {
      const sec = r.g.prices.runpod_secure;
      return sec && r.o ? (sec - r.o.avg_price) / sec : null;
    })
    // Keep every comparable GPU in the average — including rows where
    // OctaSpace LOSES (negative savings). Dropping them would inflate the headline.
    .filter((v) => v !== null);
  const avgSave = savings.length ? savings.reduce((a, b) => a + b, 0) / savings.length : 0;

  $("#statGpus").innerHTML = `${rows.length}<span class="unit"> GPUs tracked</span>`;
  $("#stat4090").innerHTML = cheapest4090 ? `${fmt$(cheapest4090.o.avg_price)}<span class="unit">/hr RTX 4090</span>` : "—";
  $("#statSave").innerHTML = `${Math.round(avgSave * 100)}%<span class="unit"> avg savings vs RunPod Secure</span>`;
  $("#statSaveSub").textContent = `across ${savings.length} GPUs with comparable list prices`;
}

function priceCell(o, octaMatch) {
  if (!o) return `<span class="na">—</span>`;
  // Honesty rule: when the live API fetch failed and we're showing the baked
  // snapshot, the cell must not claim LIVE — use the snapshot badge instead.
  let badges = octaIsLive
    ? `<span class="badge badge-live">LIVE</span>`
    : `<span class="badge badge-snap" title="Live OctaSpace fetch failed — showing the baked snapshot captured ${esc(DATA.fallbackOcta.captured.slice(0, 10))}.">snapshot</span>`;
  if (o.count < LOW_DATA_N) badges += `<span class="badge badge-low" title="Fewer than ${LOW_DATA_N} listings — the average can swing on a single listing.">few listings</span>`;
  return `<span class="price">${fmt$(o.avg_price)}<span class="per">/hr</span></span>${badges}<span class="listings">${o.count} listing${o.count === 1 ? "" : "s"}</span>${trendSpark(octaMatch)}`;
}

// Trend sparkline: OctaSpace average asking price across this site's scheduled
// captures. Every point is a real marketplace pull at its shown timestamp —
// not interpolated, not estimated. Rendered only when >= 2 points exist.
function trendSpark(octaMatch) {
  const series = HISTORY.map((h) => {
    const g = h.gpus[octaMatch];
    return { t: h.captured, p: g ? g.avg_price : null };
  }).filter((s) => typeof s.p === "number");
  if (series.length < 2) return "";
  const W = 84, H = 24, PAD = 2;
  const prices = series.map((s) => s.p);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const span = hi - lo || 1e-9;
  const pts = series.map((s, i) => {
    const x = PAD + (i / (series.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - (s.p - lo) / span) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const first = series[0], last = series[series.length - 1];
  const pct = ((last.p - first.p) / first.p) * 100;
  const down = last.p <= first.p; // cheaper is good for renters — green
  const f = (t) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const tip = `OctaSpace avg asking price — this site's scheduled captures (${series.length} pulls): ${f(first.t)} $${first.p.toFixed(2)} → ${f(last.t)} $${last.p.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
  return `<span class="spark" title="${esc(tip)}" aria-label="${esc(tip)}">`
    + `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">`
    + `<polyline points="${pts}" fill="none" stroke="${down ? "var(--green)" : "var(--red)"}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
    + `</svg></span>`;
}

function renderTable() {
  const P = DATA.providers;
  const head = `
    <tr>
      <th>GPU</th>
      <th>OctaSpace<span class="sub">live avg asking price</span></th>
      <th>Vast.ai<span class="sub">cheapest 'from' offer · spot tier · ${esc(P.vast.updated)}</span></th>
      <th>SaladCloud<span class="sub">'from' rate · Lowest priority tier · ${esc(P.saladcloud.updated)}</span></th>
      <th>RunPod<span class="sub">Community · ${esc(P.runpod_community.updated)}</span></th>
      <th>RunPod<span class="sub">Secure · ${esc(P.runpod_secure.updated)}</span></th>
      <th>You save<span class="sub">vs RunPod Secure</span></th>
    </tr>`;
  const body = DATA.gpus.map((g) => {
    const o = octaFor(g);
    const minComp = competitorMin(g.prices);
    let saveCell = `<span class="na">—</span>`;
    let verifyBadge = "";
    if (o && typeof g.prices.runpod_secure === "number") {
      const s = (g.prices.runpod_secure - o.avg_price) / g.prices.runpod_secure;
      saveCell = s >= 0
        ? `<span class="save">+${Math.round(s * 100)}%</span>`
        : `<span class="save neg">−${Math.round(-s * 100)}%</span>`;
    }
    if (o && minComp && o.avg_price < OUTLIER_RATIO * minComp) {
      verifyBadge = `<span class="badge badge-verify" title="This average is far below every competitor — likely a mispriced or test listing. Check the live marketplace before counting on it.">verify live</span>`;
    }
    const vramNote = g.vram_note ? ` <span title="${esc(g.vram_note)}" style="cursor:help">*</span>` : "";
    const comp = (k, from) => typeof g.prices[k] === "number"
      ? `<span class="price">${from ? `<span style="font-size:12px;color:var(--muted);font-weight:500">from </span>` : ""}${fmt$(g.prices[k])}<span class="per">/hr</span></span><span class="badge badge-snap">snapshot</span>`
      : `<span class="na">—</span>`;
    return `<tr>
      <td class="gpu-name">${esc(g.name)}<span class="vram">${esc(g.vram)}${vramNote}</span></td>
      <td class="octa-cell">${priceCell(o, g.octa_match)}${verifyBadge}</td>
      <td>${comp("vast", true)}</td>
      <td>${comp("saladcloud", true)}</td>
      <td>${comp("runpod_community")}</td>
      <td>${comp("runpod_secure")}</td>
      <td>${saveCell}</td>
    </tr>`;
  }).join("");
  $("#priceTable").innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
}

function renderChips() {
  const matched = new Set(DATA.gpus.map((g) => g.octa_match));
  const extra = Object.entries(octaLive)
    .filter(([name]) => !matched.has(name))
    .sort((a, b) => b[1].count - a[1].count);
  $("#extraChips").innerHTML = extra.map(([name, d]) => {
    const short = name.replace(/NVIDIA\s*/g, "").replace(/GeForce\s*/g, "").trim();
    const low = d.count < LOW_DATA_N ? ` <span class="n">· few listings</span>` : "";
    return `<span class="chip">${esc(short)} <b>${fmt$(d.avg_price)}/hr</b><span class="n"> · ${d.count} listings${low}</span></span>`;
  }).join("") || `<span class="chip">No additional listings right now</span>`;
}

let calcState = { gpu: "rtx4090", hours: 8 };

function renderCalc(reset) {
  const sel = $("#calcGpu");
  if (reset || !sel.options.length) {
    sel.innerHTML = DATA.gpus.map((g) => `<option value="${g.id}">${esc(g.name)} (${esc(g.vram)})</option>`).join("");
    sel.value = calcState.gpu;
  }
  const hrs = $("#calcHours");
  hrs.value = calcState.hours;
  $("#hoursVal").innerHTML = `${calcState.hours}<span class="u"> hrs / day</span>`;

  const g = DATA.gpus.find((x) => x.id === sel.value);
  const o = octaFor(g);
  const month = (p) => p * calcState.hours * 30;
  const rows = [
    { name: "OctaSpace", sub: octaIsLive ? "live" : "snapshot", price: o ? o.avg_price : null, hot: true },
    { name: "Vast.ai", sub: "from", price: g.prices.vast ?? null },
    { name: "SaladCloud", sub: "from · Lowest priority", price: g.prices.saladcloud ?? null },
    { name: "RunPod Community", sub: "", price: g.prices.runpod_community ?? null },
    { name: "RunPod Secure", sub: "", price: g.prices.runpod_secure ?? null },
  ].filter((r) => r.price !== null);

  const max = Math.max(...rows.map((r) => month(r.price)));
  $("#calcBars").innerHTML = rows.map((r) => {
    const c = month(r.price);
    const w = max ? (c / max) * 100 : 0;
    const color = r.hot ? "linear-gradient(90deg, var(--accent), var(--accent2))" : "linear-gradient(90deg, #3a3a55, #55557a)";
    return `<div class="bar-row">
      <span class="nm">${esc(r.name)}${r.sub ? ` <span style="color:var(--muted);font-weight:400;font-size:12px">${esc(r.sub)}</span>` : ""}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${w.toFixed(1)}%;background:${color}"></div></div>
      <span class="cost">${fmt$(c)}<span style="font-size:12px;color:var(--muted);font-weight:500">/mo</span></span>
    </div>`;
  }).join("");

  const octaRow = rows.find((r) => r.hot);
  const secureRow = rows.find((r) => r.name === "RunPod Secure");
  if (octaRow && secureRow) {
    const diff = month(secureRow.price) - month(octaRow.price);
    $("#calcNote").innerHTML = diff >= 0
      ? `Running this GPU <b>${calcState.hours} hrs/day</b> costs <b style="color:var(--green)">${fmt$(diff)}/month less</b> on OctaSpace than on RunPod Secure Cloud.`
      : `At <b>${calcState.hours} hrs/day</b>, RunPod Secure is currently cheaper for this GPU — the table above shows the full picture.`;
  } else {
    $("#calcNote").textContent = "Monthly estimate = hourly price × hours/day × 30 days.";
  }
}

function renderSources() {
  const P = DATA.providers;
  $("#srcTable").innerHTML = `<thead><tr><th>Column</th><th>Type</th><th>As of</th><th>Source</th></tr></thead><tbody>
    ${["octaspace", "vast", "saladcloud", "runpod_community", "runpod_secure"].map((k) => {
      const p = P[k];
      const tier = p.tier ? ` (${esc(p.tier)})` : "";
      const note = p.note ? `<div class="src-note">${esc(p.note)}</div>` : "";
      const kind = p.kind === "live" ? "Live API" : "Manual snapshot";
      const asof = p.kind === "live" ? (octaIsLive ? "just now" : esc(DATA.fallbackOcta.captured.slice(0, 10))) : esc(p.updated);
      return `<tr><td data-th="Column"><b>${esc(p.name)}</b>${tier}${note}</td><td data-th="Type">${kind}</td><td data-th="As of">${asof}</td><td data-th="Source"><a href="${esc(p.source)}" target="_blank" rel="noopener">${esc(p.sourceLabel)}</a></td></tr>`;
    }).join("")}
  </tbody>`;
}

document.addEventListener("DOMContentLoaded", () => {
  $("#calcGpu").addEventListener("change", (e) => { calcState.gpu = e.target.value; renderCalc(false); });
  $("#calcHours").addEventListener("input", (e) => { calcState.hours = parseInt(e.target.value, 10); renderCalc(false); });
  $("#refreshBtn").addEventListener("click", async () => {
    $("#refreshBtn").textContent = "Refreshing…";
    await loadData();
    $("#refreshBtn").textContent = "Refresh live prices";
  });
  loadData();
  // refresh OctaSpace prices every 5 minutes
  setInterval(loadData, 5 * 60 * 1000);
});
