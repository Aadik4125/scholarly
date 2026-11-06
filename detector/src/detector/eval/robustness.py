"""Robustness and audit tests for a trained model.

    python -m detector.eval.robustness --model artifacts/E1_tfidf_lr_random.joblib --split random

Reports (and appends to experiments/results/robustness.csv):
  audit           FPR on held-back human academic abstracts (arXiv 2007-08), never trained on
  mage_ood        MAGE's out-of-distribution GPT-4 sets, plain and paraphrased
  raid_attack:*   recall on each RAID adversarial attack (AI rows) and FPR (human rows)
  domain:*        per-domain metrics on the split's test part
  generator:*     recall per generator family on the test part
  length:*        metrics by word-count bucket on the test part
All thresholds are 0.5 unless --threshold is given (e.g. the 1%-FPR threshold from validation).
"""

from __future__ import annotations

import argparse

import joblib
import numpy as np
import pandas as pd

from ..models.common import PROCESSED, RESULTS, load_split
from .metrics import classification_report, tpr_at_fpr


def _rate(pred: np.ndarray) -> float:
    return float(pred.mean()) if len(pred) else float("nan")


def run(score, split: str, threshold: float) -> pd.DataFrame:
    rows = []

    def add(name, df, p):
        y = df["label"].to_numpy()
        pred = p >= threshold
        rows.append(
            {
                "test": name,
                "n": len(df),
                "n_ai": int((y == 1).sum()),
                "recall": _rate(pred[y == 1]),
                "fpr": _rate(pred[y == 0]),
                "roc_auc": classification_report(y, p)["roc_auc"] if len(np.unique(y)) == 2 else float("nan"),
            }
        )

    audit = pd.read_parquet(PROCESSED / "audit.parquet")
    add("audit_human_academic", audit, score(audit["text"].tolist()))

    ood = pd.read_parquet(PROCESSED / "mage_ood.parquet")
    p = score(ood["text"].tolist())
    for attack, g in ood.groupby("attack"):
        add(f"mage_ood_gpt4:{attack}", g, p[g.index])

    attacks = pd.read_parquet(PROCESSED / "raid_attacks.parquet")
    attacks = attacks.sample(frac=1.0, random_state=0).groupby("attack").head(1500).reset_index(drop=True)
    p = score(attacks["text"].tolist())
    for attack, g in attacks.groupby("attack"):
        add(f"raid_attack:{attack}", g, p[g.index])

    test = load_split(split)["test"]
    p = score(test["text"].tolist())
    add("test:all", test, p)
    for dom, g in test.groupby("domain"):
        add(f"domain:{dom}", g, p[g.index])
    fam = test["generator"].str.split("/").str[0].replace("", "human")
    for f, g in test.groupby(fam):
        add(f"generator:{f}", g, p[g.index])
    buckets = pd.cut(test["word_count"], [0, 75, 150, 300, 10_000], labels=["50-75", "75-150", "150-300", "300+"])
    for b, g in test.groupby(buckets, observed=True):
        add(f"length:{b}", g, p[g.index])
    return pd.DataFrame(rows)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, help="a .joblib model, or fusion:<E4 name>")
    ap.add_argument("--split", default="random")
    ap.add_argument("--threshold", type=float, default=None, help="default: 0.5")
    ap.add_argument("--name", default=None)
    args = ap.parse_args()
    if args.model.startswith("fusion:"):  # e.g. fusion:E4_fusion_tfidf+transformer+features
        from ..models.fusion import fused_scorer

        score = fused_scorer(args.split, args.model.split(":", 1)[1])
    else:
        model = joblib.load(args.model)
        score = lambda texts: model.predict_proba(texts)[:, 1]  # noqa: E731

    thr = args.threshold
    if thr is None:
        thr = 0.5
    else:
        print(f"threshold={thr}")
    df = run(score, args.split, thr)
    df.insert(0, "model", args.name or args.model.split("/")[-1].removesuffix(".joblib"))
    df.insert(1, "threshold", thr)
    pd.set_option("display.width", 160)
    print(df.drop(columns="model").to_string(index=False, float_format=lambda x: f"{x:.3f}"))
    RESULTS.mkdir(parents=True, exist_ok=True)
    path = RESULTS / "robustness.csv"
    if path.exists():
        old = pd.read_csv(path)
        old = old[~((old["model"] == df["model"].iloc[0]) & (old["threshold"] == thr))]
        df = pd.concat([old, df], ignore_index=True)
    df.to_csv(path, index=False)


def threshold_at_fpr(score, val: pd.DataFrame, target: float = 0.01) -> float:
    return tpr_at_fpr(val["label"].to_numpy(), score(val["text"].tolist()), target)[1]


if __name__ == "__main__":
    main()
