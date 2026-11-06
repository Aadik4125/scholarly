"""Leakage-safe splits. Every split keeps each `split_group` entirely on one side.

Splits written to data/splits/<name>.parquet with columns [text_id, part] where part is
train / val / test:
  random         grouped 80/10/10 over the pooled corpus (minus the audit set)
  ood_generator  test = every AI text from held-out generator families (+ a matched share of
                 human text); train/val never see those generators
  ood_domain     test = every text from held-out domains; train/val never see those domains
The academic human false-positive audit set (data/processed/audit.parquet) is carved out in
prepare.py and never appears in any split.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[3]
PROCESSED = ROOT / "data" / "processed"
SPLITS = ROOT / "data" / "splits"

# Held-out choices. Families are matched on the `generator` column by prefix (see prepare.py).
OOD_GENERATOR_FAMILIES = ("mistral/",)  # RAID mistral + mistral-chat: modern and absent from MAGE
OOD_DOMAINS = {
    "ood_domain_creative": ("poetry", "recipes", "wp", "roct"),
    # Our target domain: does a detector trained on everything else transfer to papers?
    "ood_domain_academic": ("abstracts", "sci_gen", "hc3_wiki_csai"),
}


def _group_partition(groups: pd.Series, fracs: dict[str, float], seed: int) -> pd.Series:
    """Assign each unique group to a part, then map back to rows."""
    rng = np.random.default_rng(seed)
    uniq = np.array(sorted(groups.unique()), dtype=object)  # sorted: deterministic before shuffling
    rng.shuffle(uniq)
    cuts = np.cumsum([fracs[p] for p in fracs]) * len(uniq)
    names = list(fracs)
    part_of = {}
    for i, g in enumerate(uniq):
        part_of[g] = names[int(np.searchsorted(cuts, i, side="right"))]
    return groups.map(part_of)


def random_split(df: pd.DataFrame, seed: int = 13) -> pd.Series:
    return _group_partition(df["split_group"], {"train": 0.8, "val": 0.1, "test": 0.1}, seed)


def _holdout_split(df: pd.DataFrame, held: pd.Series, seed: int) -> pd.Series:
    """Rows in `held` (and any row sharing a group with them) become test; the rest is split
    90/10 train/val by group."""
    held_groups = set(df.loc[held, "split_group"])
    in_test = df["split_group"].isin(held_groups)
    part = pd.Series("test", index=df.index)
    rest = df[~in_test]
    part[~in_test] = _group_partition(rest["split_group"], {"train": 0.9, "val": 0.1}, seed)
    return part


def ood_generator_split(df: pd.DataFrame, seed: int = 13) -> pd.Series:
    gen = df["generator"].fillna("").str.lower()
    held_ai = (df["label"] == 1) & gen.str.startswith(OOD_GENERATOR_FAMILIES)
    # Matched human share: sample as many human groups as there are held-out AI rows, so the
    # test set has both classes. Those human rows leave training too.
    rng = np.random.default_rng(seed)
    human_groups = df.loc[df["label"] == 0, "split_group"].unique()
    n = min(len(human_groups), max(1, int(held_ai.sum())))
    chosen = set(rng.choice(human_groups, size=n, replace=False))
    held = held_ai | df["split_group"].isin(chosen) & (df["label"] == 0)
    part = _holdout_split(df, held, seed)
    # Any held-out-generator AI text that landed in train/val via group sharing is dropped.
    leak = held_ai & (part != "test")
    return part.mask(leak, "drop")


def _ood_domain(domains):
    return lambda df, seed=13: _holdout_split(df, df["domain"].isin(domains), seed)


BUILDERS = {
    "random": random_split,
    "ood_generator": ood_generator_split,
    **{name: _ood_domain(doms) for name, doms in OOD_DOMAINS.items()},
}


def check_no_leak(df: pd.DataFrame, part: pd.Series) -> None:
    kept = part != "drop"
    per_group = pd.DataFrame({"g": df.loc[kept, "split_group"], "p": part[kept]}).groupby("g")["p"].nunique()
    bad = per_group[per_group > 1]
    if len(bad):
        raise AssertionError(f"{len(bad)} split_groups span multiple parts")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=13)
    args = ap.parse_args()
    df = pd.read_parquet(PROCESSED / "corpus.parquet")
    SPLITS.mkdir(parents=True, exist_ok=True)
    for name, build in BUILDERS.items():
        part = build(df, args.seed)
        check_no_leak(df, part)
        out = pd.DataFrame({"text_id": df["text_id"], "part": part})
        out = out[out["part"] != "drop"]
        out.to_parquet(SPLITS / f"{name}.parquet", index=False)
        summary = out.merge(df[["text_id", "label"]]).groupby(["part", "label"]).size().unstack(fill_value=0)
        print(f"\n== {name}\n{summary}")


if __name__ == "__main__":
    main()
