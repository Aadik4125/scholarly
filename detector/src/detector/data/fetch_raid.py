"""Sample RAID (liamdugan/raid, MIT) without downloading the 11.7 GB train.csv.

The CSV is sorted in long homogeneous runs (domain, then attack/model blocks), so we:
  1. probe the file with many tiny byte-range reads to map which (attack, domain) sits where,
  2. download evenly spaced slices from inside the attack == "none" runs of every domain, plus a
     small sample of each adversarial attack (used only for robustness tests).
Records start on a line beginning with three UUIDs, which is how we resync mid-file.
Output: data/raw/raid/slices.csv with RAID's columns.
"""

from __future__ import annotations

import argparse
import csv
import io
import random
import re
import sys
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

URL = "https://huggingface.co/datasets/liamdugan/raid/resolve/main/train.csv"
FILE_SIZE = 11_779_000_000  # slightly under the real size so the last probe stays in range
ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "data" / "raw" / "raid" / "slices.csv"

_UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
_RECORD_START = re.compile(rf"\n(?={_UUID},{_UUID},{_UUID},)")
HEADER = "id,adv_source_id,source_id,model,decoding,repetition_penalty,attack,domain,title,prompt,generation"


def fetch(start: int, length: int, tries: int = 4) -> str:
    for attempt in range(tries):
        try:
            req = urllib.request.Request(URL, headers={"Range": f"bytes={start}-{start + length - 1}"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read().decode("utf-8", errors="replace")
        except Exception:
            if attempt == tries - 1:
                raise
    return ""


def records(chunk: str) -> list[dict]:
    starts = [m.end() for m in _RECORD_START.finditer(chunk)]
    if len(starts) < 2:
        return []
    body = chunk[starts[0] : starts[-1]]  # drop the partial first and last records
    rows = list(csv.DictReader(io.StringIO(HEADER + "\n" + body)))
    return [r for r in rows if r.get("generation") is not None and r.get("domain")]


def probe_map(n: int, workers: int = 16) -> list[tuple[int, str, str]]:
    """[(offset, attack, domain)] for n evenly spaced probes."""
    offs = [int(i * FILE_SIZE / n) for i in range(n)]

    def one(o):
        try:
            rs = records(fetch(o, 24_000))
            return (o, rs[0]["attack"], rs[0]["domain"]) if rs else None
        except Exception:
            return None

    with ThreadPoolExecutor(workers) as ex:
        return [p for p in ex.map(one, offs) if p]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--probes", type=int, default=2400)
    ap.add_argument("--clean-mb-per-domain", type=float, default=30.0)
    ap.add_argument("--attack-mb-per-domain", type=float, default=1.5, help="per attack type")
    ap.add_argument("--slice-kb", type=int, default=500)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    rng = random.Random(args.seed)

    probes = probe_map(args.probes)
    print(f"mapped {len(probes)} probes", file=sys.stderr)
    by_key: dict[tuple[str, str], list[int]] = defaultdict(list)
    for o, attack, domain in probes:
        by_key[(attack, domain)].append(o)

    slice_len = args.slice_kb * 1000
    jobs = []
    for (attack, domain), offs in sorted(by_key.items()):
        budget = args.clean_mb_per_domain if attack == "none" else args.attack_mb_per_domain
        k = min(len(offs), max(1, int(budget * 1e6 / slice_len)))
        # Probes are evenly spaced, so a random subset of probe offsets is an even sample of the run.
        jobs += [(o, attack, domain) for o in rng.sample(offs, k)]
    print(f"fetching {len(jobs)} slices of {args.slice_kb} KB", file=sys.stderr)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    seen = set()
    total = 0
    with OUT.open("w", newline="") as f, ThreadPoolExecutor(12) as ex:
        w = csv.DictWriter(f, fieldnames=HEADER.split(","))
        w.writeheader()
        for i, rows in enumerate(ex.map(lambda j: records(fetch(j[0], slice_len)), jobs)):
            # A slice may run past the end of its run; keep only rows matching the run it was
            # chosen for, so the attack/domain mix stays as planned.
            want = jobs[i][1:]
            for r in rows:
                if (r["attack"], r["domain"]) == want and r["id"] not in seen:
                    seen.add(r["id"])
                    w.writerow(r)
                    total += 1
            if i % 25 == 0:
                print(f"  {i + 1}/{len(jobs)} slices, {total} rows", file=sys.stderr)
    print(f"wrote {total} rows to {OUT}", file=sys.stderr)


# ---------------------------------------------------------------------------- human top-up
# RAID has ~1 human document per 11 generations, and the CSV stores each domain's human rows at
# the very start of its block. `python -m detector.data.fetch_raid humans` finds each domain's
# first byte by binary search and downloads a contiguous stretch from there.

DOMAIN_ORDER = ["abstracts", "books", "news", "poetry", "recipes", "reddit", "reviews", "wiki"]
HUMANS_OUT = ROOT / "data" / "raw" / "raid" / "humans.csv"


def _domain_at(offset: int) -> str | None:
    rs = records(fetch(offset, 24_000))
    return rs[0]["domain"] if rs else None


def domain_start(domain: str) -> int:
    """First offset whose record belongs to `domain` (domains are contiguous, in DOMAIN_ORDER)."""
    rank = DOMAIN_ORDER.index(domain)
    lo, hi = 0, FILE_SIZE - 24_000
    while hi - lo > 200_000:
        mid = (lo + hi) // 2
        d = _domain_at(mid)
        if d is None or DOMAIN_ORDER.index(d) < rank:
            lo = mid
        else:
            hi = mid
    return lo


def fetch_humans(mb_per_domain: float = 8.0) -> None:
    rows_out = []
    for domain in DOMAIN_ORDER:
        start = 0 if domain == DOMAIN_ORDER[0] else domain_start(domain)
        got = []
        pos = start
        while pos < start + mb_per_domain * 1e6:
            rows = records(fetch(pos, 2_000_000))
            got += [r for r in rows if r["domain"] == domain and r["model"] == "human" and r["attack"] == "none"]
            pos += 1_900_000  # small overlap so no record is lost at the seam
            if rows and rows[-1]["model"] != "human" and got:
                break  # past the human run
        print(f"{domain}: start {start / 1e9:.2f} GB, {len(got)} human rows", file=sys.stderr)
        rows_out += got
    seen = set()
    with HUMANS_OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=HEADER.split(","))
        w.writeheader()
        for r in rows_out:
            if r["id"] not in seen:
                seen.add(r["id"])
                w.writerow(r)
    print(f"wrote {len(seen)} rows to {HUMANS_OUT}", file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "humans":
        fetch_humans()
    else:
        main()
