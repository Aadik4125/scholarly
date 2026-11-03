"""Exports evaluation sets as JSONL for server/aiDetector/eval-app.mjs, which scores them with the
detector exactly as the app runs it (exported models, windows, stride, int8 ONNX).

    python -m detector.eval.app_sets [--split random] [--per-set 400]

Sets (data/eval/<name>.jsonl, one {"label", "generator", "text"} per line):
  modern_test   current-model paper sections + their human sections, from the split's test part
  modern_ood    held-out current models (never trained on) + their human sections
  modern_audit  human paper sections (full sections, not abstracts), never trained on
  audit         human arXiv abstracts 2007-08, never trained on
  legacy_test   the rest of the test part (2019-23 generators, many domains)
"""

from __future__ import annotations

import argparse

import pandas as pd

from ..models.common import PROCESSED, ROOT, load_split

OUT = ROOT / "data" / "eval"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", default="random")
    ap.add_argument("--per-set", type=int, default=400)
    ap.add_argument("--seed", type=int, default=13)
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    test = load_split(args.split)["test"]
    sets = {
        "modern_test": test[test["origin"] == "modern"],
        "legacy_test": test[test["origin"] != "modern"],
        "modern_ood": pd.read_parquet(PROCESSED / "modern_ood.parquet"),
        "modern_audit": pd.read_parquet(PROCESSED / "modern_audit.parquet"),
        "audit": pd.read_parquet(PROCESSED / "audit.parquet"),
    }
    for name, df in sets.items():
        if df.empty:
            print(f"{name}: empty, skipped")
            continue
        # Stratified so both classes are represented when a set has both.
        n = args.per_set
        parts = [g.sample(min(len(g), n // df["label"].nunique()), random_state=args.seed) for _, g in df.groupby("label")]
        out = pd.concat(parts)[["label", "generator", "text"]]
        out.to_json(OUT / f"{name}.jsonl", orient="records", lines=True)
        print(f"{name}: {len(out)} docs ({out['label'].value_counts().to_dict()})")


if __name__ == "__main__":
    main()
