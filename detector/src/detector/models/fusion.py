"""E4: fuse TF-IDF score + transformer score + linguistic features with a logistic-regression
stacker (blending: base models trained on `train`, stacker trained on their `val` predictions,
everything evaluated on `test`).

    python -m detector.models.fusion --split random                 # TF-IDF + transformer + features
    python -m detector.models.fusion --split random --no-transformer

Also writes artifacts/fusion_table_<split>.parquet: one row per val/test text (documents and
windows) with every base score and feature. The FITRON experiments read this table.
"""

from __future__ import annotations

import argparse

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from ..eval.metrics import classification_report
from ..features import linguistic
from ..features.text import normalize
from .common import ARTIFACTS, PROCESSED, SPLITS, load_split, make_windows, print_metrics, save_json, write_results


def base_scorers(split: str, use_transformer: bool) -> dict:
    tfidf = joblib.load(ARTIFACTS / f"E1_tfidf_lr_{split}.joblib")
    scorers = {"tfidf_score": lambda texts: tfidf.predict_proba(texts)[:, 1]}
    if use_transformer:
        # Use the int8 ONNX export when present: it is what the server runs, and its scores differ
        # slightly from fp32 PyTorch, so the stacker should learn from the production model.
        onnx_dir = ARTIFACTS / f"E3_onnx_{split}"
        if (onnx_dir / "onnx" / "model_quantized.onnx").exists():
            from .transformer import OnnxScorer

            scorers["transformer_score"] = OnnxScorer(onnx_dir)
        else:
            from transformers import AutoModelForSequenceClassification, AutoTokenizer

            from .transformer import Scorer, device

            path = ARTIFACTS / f"E3_distilroberta_{split}"
            dev = device()
            scorers["transformer_score"] = Scorer(
                AutoModelForSequenceClassification.from_pretrained(path).to(dev), AutoTokenizer.from_pretrained(path), dev
            )
    return scorers


def feature_table(df: pd.DataFrame, scorers: dict, windows_per_doc: int = 2) -> pd.DataFrame:
    """Documents plus windows, each with base-model scores and linguistic features."""
    docs = df.assign(unit="doc")
    wins = make_windows(df, windows_per_doc, seed=7).assign(unit="window")
    t = pd.concat([docs, wins], ignore_index=True)
    texts = t["text"].tolist()
    for name, score in scorers.items():
        t[name] = score(texts)
    feats = np.array([linguistic.extract(normalize(x)) for x in texts])
    for i, name in enumerate(linguistic.FEATURE_NAMES):
        t[name] = feats[:, i]
    return t


def make_stacker(c: float = 1.0) -> Pipeline:
    return Pipeline([("scale", StandardScaler()), ("lr", LogisticRegression(C=c, max_iter=5000))])


def logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def stack_inputs(t: pd.DataFrame, score_cols: list[str], use_features: bool) -> np.ndarray:
    cols = [logit(t[c].to_numpy()) for c in score_cols]
    x = np.column_stack(cols)
    if use_features:
        x = np.column_stack([x, t[list(linguistic.FEATURE_NAMES)].to_numpy()])
    return x


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", default="random")
    ap.add_argument("--no-transformer", action="store_true")
    ap.add_argument("--no-features", action="store_true")
    ap.add_argument("--rebuild", action="store_true", help="recompute the base-score table even if it looks current")
    args = ap.parse_args()
    use_tr = not args.no_transformer

    data = load_split(args.split)
    table_path = ARTIFACTS / f"fusion_table_{args.split}.parquet"
    scorers = base_scorers(args.split, use_tr)
    # The cached table holds base-model scores, so it is stale as soon as a base model (or the
    # split it was built from) is newer than the table. Reusing it silently would evaluate the
    # fusion of models that no longer exist.
    sources = [ARTIFACTS / f"E1_tfidf_lr_{args.split}.joblib", SPLITS / f"{args.split}.parquet", PROCESSED / "corpus.parquet"]
    if use_tr:
        sources.append(ARTIFACTS / f"E3_distilroberta_{args.split}" / "model.safetensors")
    fresh = table_path.exists() and all(not p.exists() or p.stat().st_mtime <= table_path.stat().st_mtime for p in sources)
    if fresh and not args.rebuild and set(scorers) <= set(pd.read_parquet(table_path, columns=None).columns):
        table = pd.read_parquet(table_path)
        print(f"reusing {table_path}")
    else:
        table = pd.concat([feature_table(data[p], scorers).assign(part=p) for p in ("val", "test")], ignore_index=True)
        table.to_parquet(table_path, index=False)
        print(f"wrote {table_path} ({len(table)} rows)")

    score_cols = [c for c in ("tfidf_score", "transformer_score") if c in scorers]
    use_feats = not args.no_features
    name = "E4_fusion_" + "+".join([c.split("_")[0] for c in score_cols] + (["features"] if use_feats else []))
    val, test = table[table.part == "val"], table[table.part == "test"]
    xva, yva = stack_inputs(val, score_cols, use_feats), val["label"].to_numpy()
    xte, yte = stack_inputs(test, score_cols, use_feats), test["label"].to_numpy()

    # Pick C by grouped CV on val (the stacker never sees test).
    best = (-1, None)
    for c in (0.01, 0.1, 1.0, 10.0):
        p = cross_val_predict(make_stacker(c), xva, yva, groups=val["split_group"], cv=GroupKFold(5), method="predict_proba")[:, 1]
        auc = classification_report(yva, p)["roc_auc"]
        print(f"  C={c:<5} cv AUC={auc:.4f}")
        if auc > best[0]:
            best = (auc, c)
    stacker = make_stacker(best[1]).fit(xva, yva)

    p = stacker.predict_proba(xte)[:, 1]
    metrics = {u: classification_report(yte[test.unit == u], p[(test.unit == u).to_numpy()]) for u in ("doc", "window")}
    for c in score_cols:  # base models on the same rows, for a like-for-like comparison
        metrics[f"base:{c}:doc"] = classification_report(yte[test.unit == "doc"], test.loc[test.unit == "doc", c])
    print_metrics(f"{name} / {args.split} / test", metrics)
    write_results(name, args.split, "test", {k: v for k, v in metrics.items() if not k.startswith("base")}, {"C": best[1]})

    joblib.dump({"stacker": stacker, "score_cols": score_cols, "use_features": use_feats}, ARTIFACTS / f"{name}_{args.split}.joblib")
    scaler, lr = stacker.named_steps["scale"], stacker.named_steps["lr"]
    save_json(
        {
            "type": "logit_stacker",
            "inputs": [f"logit({c})" for c in score_cols] + (list(linguistic.FEATURE_NAMES) if use_feats else []),
            "mean": scaler.mean_.tolist(),
            "scale": scaler.scale_.tolist(),
            "coef": lr.coef_[0].tolist(),
            "intercept": float(lr.intercept_[0]),
        },
        ARTIFACTS / f"{name}_{args.split}.json",
    )
    print(f"saved {name}")


if __name__ == "__main__":
    main()


def fused_scorer(split: str, name: str = "E4_fusion_tfidf+transformer+features"):
    """texts -> P(AI) from the saved stacker and its base models (the production pipeline)."""
    saved = joblib.load(ARTIFACTS / f"{name}_{split}.joblib")
    scorers = base_scorers(split, "transformer_score" in saved["score_cols"])

    def score(texts):
        t = pd.DataFrame({"text": texts})
        for c in saved["score_cols"]:
            t[c] = scorers[c](texts)
        if saved["use_features"]:
            feats = np.array([linguistic.extract(normalize(x)) for x in texts])
            for i, n in enumerate(linguistic.FEATURE_NAMES):
                t[n] = feats[:, i]
        return saved["stacker"].predict_proba(stack_inputs(t, saved["score_cols"], saved["use_features"]))[:, 1]

    return score
