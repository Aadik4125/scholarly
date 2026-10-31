"""FITRON experiments E5-E7, on the fusion feature table (val = training, test = evaluation).

    python -m detector.models.fitron_exp --split random

Protocol note: FITRONModel.fit() makes its own random, non-grouped 80/20 split and rank()
retrains on whatever it is given, so neither can be evaluated on our leakage-safe test set or
used to score a single new document. We therefore use FITRON's own building blocks
(pip_model.core: fuzzy profile, calibrated tuned decision tree, TOPSIS) exactly as its pipeline
does, fitted on val and evaluated on test.

E5  FITRON classifier, linguistic features only      vs  LR stacker on the same features
E6  FITRON classifier, features + base-model scores   vs  E4 (LR stacker, same inputs)
E7  Review triage: rank test documents for human review. A document is "worth reviewing" when
    the production detector (E4) misclassifies it at threshold 0.5, defined before running.
    Strategies: random, uncertainty |p - 0.5|, model disagreement, and FITRON TOPSIS over
    [uncertainty, disagreement, shortness, feature-space outlyingness] with weights tuned on val.
    Metrics: precision@k, recall@k.
"""

from __future__ import annotations

import argparse

import numpy as np
import pandas as pd
from pip_model.core.decision_tree import predict_proba_positive, train_decision_tree
from pip_model.core.fuzzy import fit_fuzzy_profile, transform_fuzzy
from pip_model.core.mcdm import topsis
from sklearn.metrics import average_precision_score

from ..eval.metrics import bootstrap_ci, classification_report
from ..features import linguistic
from .common import ARTIFACTS, RESULTS, print_metrics, write_results
from .fusion import logit, make_stacker


def fitron_classifier(xtr: pd.DataFrame, ytr: np.ndarray, seed: int = 42):
    profile = fit_fuzzy_profile(xtr)
    model, _ = train_decision_tree(transform_fuzzy(xtr, profile), pd.Series(ytr), random_state=seed, tune_hyperparameters=True)
    return lambda x: predict_proba_positive(model, transform_fuzzy(x, profile))


def inputs(t: pd.DataFrame, score_cols: list[str]) -> pd.DataFrame:
    x = t[list(linguistic.FEATURE_NAMES)].copy()
    for c in score_cols:
        x["logit_" + c] = logit(t[c].to_numpy())
    return x


def compare(name_f, name_b, xva, yva, xte, yte, units, split, max_train):
    """Fit FITRON and the LR baseline on (a sample of) val, evaluate both on test."""
    rng = np.random.default_rng(0)
    idx = rng.choice(len(xva), size=min(len(xva), max_train), replace=False)
    f = fitron_classifier(xva.iloc[idx], yva[idx])
    b = make_stacker(1.0).fit(xva.to_numpy(), yva)
    out = {}
    for name, p in ((name_f, f(xte)), (name_b, b.predict_proba(xte.to_numpy())[:, 1])):
        m = {u: classification_report(yte[units == u], p[units == u]) for u in ("doc", "window")}
        lo, hi = bootstrap_ci(yte[units == "doc"], p[units == "doc"], "roc_auc", n=300)
        m["doc"]["roc_auc_ci"] = f"[{lo:.4f}, {hi:.4f}]"
        print_metrics(f"{name} / {split} / test   doc AUC 95% CI {m['doc']['roc_auc_ci']}", m)
        write_results(name, split, "test", m)
        out[name] = p
    return out


def precision_recall_at_k(relevant: np.ndarray, order: np.ndarray, ks) -> dict:
    total = max(int(relevant.sum()), 1)
    out = {}
    for k in ks:
        hits = int(relevant[order[:k]].sum())
        out[f"p@{k}"] = hits / k
        out[f"r@{k}"] = hits / total
    return out


def triage_criteria(t: pd.DataFrame, p: np.ndarray, feat_center: np.ndarray, feat_scale: np.ndarray) -> np.ndarray:
    """Benefit criteria (higher = more worth reviewing)."""
    uncertainty = 1 - 2 * np.abs(p - 0.5)
    disagreement = np.abs(t["tfidf_score"].to_numpy() - t["transformer_score"].to_numpy()) if "transformer_score" in t else np.zeros(len(t))
    shortness = 1 / np.log1p(t["word_count"].to_numpy().astype(float))
    z = (t[list(linguistic.FEATURE_NAMES)].to_numpy() - feat_center) / feat_scale
    outlying = np.sqrt((z**2).mean(axis=1))
    return np.column_stack([uncertainty, disagreement, shortness, outlying])


def tune_topsis_weights(m: np.ndarray, relevant: np.ndarray, rounds: int = 4, step: float = 0.1) -> np.ndarray:
    """Coordinate ascent on average precision, as FITRON's _optimize_weights does on its own
    ranking-quality objective."""
    w = np.ones(m.shape[1]) / m.shape[1]
    best = average_precision_score(relevant, topsis(m, w))
    for _ in range(rounds):
        for i in range(len(w)):
            for d in (-step, step):
                trial = w.copy()
                trial[i] = max(1e-6, trial[i] + d)
                trial /= trial.sum()
                ap = average_precision_score(relevant, topsis(m, trial))
                if ap > best:
                    best, w = ap, trial
        step /= 2
    return w


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", default="random")
    ap.add_argument("--max-train", type=int, default=12000, help="FITRON grid search is slow on large tables")
    args = ap.parse_args()

    table = pd.read_parquet(ARTIFACTS / f"fusion_table_{args.split}.parquet")
    score_cols = [c for c in ("tfidf_score", "transformer_score") if c in table]
    val, test = table[table.part == "val"].reset_index(drop=True), table[table.part == "test"].reset_index(drop=True)
    yva, yte = val["label"].to_numpy(), test["label"].to_numpy()
    units = test["unit"].to_numpy()

    print("\n=== E5: linguistic features only")
    compare("E5_fitron_features", "E5_baseline_lr_features", inputs(val, []), yva, inputs(test, []), yte, units, args.split, args.max_train)

    print("\n=== E6: features + base-model scores")
    probs = compare("E6_fitron_scores+features", "E4_lr_scores+features", inputs(val, score_cols), yva, inputs(test, score_cols), yte, units, args.split, args.max_train)

    print("\n=== E7: review triage (documents only)")
    stacker = make_stacker(1.0).fit(inputs(val, score_cols).to_numpy(), yva)
    pv = stacker.predict_proba(inputs(val, score_cols).to_numpy())[:, 1]
    pt = probs["E4_lr_scores+features"]
    vd, td = (val.unit == "doc").to_numpy(), units == "doc"
    feats = val.loc[vd, list(linguistic.FEATURE_NAMES)].to_numpy()
    center, scale = np.median(feats, axis=0), feats.std(axis=0) + 1e-9
    # On val the stacker is scored in-sample, so "errors" there are slightly optimistic; they only
    # tune the 4 TOPSIS weights.
    rel_val = ((pv[vd] >= 0.5) != yva[vd]).astype(int)
    rel_test = ((pt[td] >= 0.5) != yte[td]).astype(int)
    w = tune_topsis_weights(triage_criteria(val[vd], pv[vd], center, scale), rel_val)
    print(f"TOPSIS weights [uncertainty, disagreement, shortness, outlying] = {np.round(w, 3)}")

    crit = triage_criteria(test[td], pt[td], center, scale)
    rng = np.random.default_rng(0)
    strategies = {
        "random": rng.permutation(td.sum()),
        "uncertainty": np.argsort(-crit[:, 0]),
        "disagreement": np.argsort(-crit[:, 1]),
        "fitron_topsis": np.argsort(-topsis(crit, w)),
    }
    ks = (50, 100, 200, 500)
    rows = []
    print(f"test docs={td.sum()}  detector errors (relevant)={rel_test.sum()}")
    for name, order in strategies.items():
        r = precision_recall_at_k(rel_test, order, ks)
        rows.append({"experiment": "E7_triage", "split": args.split, "strategy": name, **r})
        print(f"  {name:14s} " + "  ".join(f"{k}={v:.3f}" for k, v in r.items()))
    RESULTS.mkdir(parents=True, exist_ok=True)
    path = RESULTS / "triage.csv"
    df = pd.DataFrame(rows)
    if path.exists():
        old = pd.read_csv(path)
        df = pd.concat([old[old["split"] != args.split], df], ignore_index=True)
    df.to_csv(path, index=False)


if __name__ == "__main__":
    main()
