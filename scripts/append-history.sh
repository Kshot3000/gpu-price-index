#!/usr/bin/env bash
# Append a new OctaSpace price point to data/octa-history.json.
# Pulls the live api.octa.computer marketplace snapshot; skips when the
# values are identical to the latest committed point (no noise points).
# Each point is a real marketplace pull with its real capture time — the
# site's trend sparklines are built from these, so never append fabricated data.
set -euo pipefail
cd "$(dirname "$0")/.."

TMP="$(mktemp)"
curl -s --max-time 20 https://api.octa.computer/network -o "$TMP"

python3 - "$TMP" <<'PY'
import json, sys, datetime

with open(sys.argv[1]) as f:
    j = json.load(f)

gpus = (j.get("marketplace") or {}).get("gpus") or {}
if not gpus:
    print("append-history: no marketplace gpus in API response, aborting", file=sys.stderr)
    sys.exit(1)

now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
point = {
    "captured": now,
    "gpus": {name: {"avg_price": d["avg_price"], "count": d["count"]} for name, d in gpus.items()
             if isinstance(d, dict) and isinstance(d.get("avg_price"), (int, float))}
}

with open("data/octa-history.json") as f:
    hist = json.load(f)

last = hist["points"][-1] if hist.get("points") else None
if last and last["gpus"] == point["gpus"]:
    print("append-history: values identical to latest point, skipping (no new signal)")
    sys.exit(0)

hist["points"].append(point)
hist["updated"] = now
with open("data/octa-history.json", "w") as f:
    json.dump(hist, f, indent=2)
    f.write("\n")
print(f"append-history: appended point {now} ({len(point['gpus'])} GPUs)")
PY
rm -f "$TMP"
