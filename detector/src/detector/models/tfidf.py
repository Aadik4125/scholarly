"""E1 (TF-IDF + logistic regression) and E2 (TF-IDF + linear SVM, calibrated).

    python -m detector.models.tfidf --split random --model lr
    python -m detector.models.tfidf --split ood_generator --model svm

Features use the shared analyzer (features/text.py) so the exported model runs identically in
Node. Also provides out-of-fold scores for the fusion / FITRON experiments.
"""

from __future__ import annotations

import argparse
import time

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

from ..features.text import analyzer
from .common import ARTIFACTS, evaluate, load_split, print_metrics, training_frame, write_results

MAX_FEATURES = 50_000
WINDOWS_PER_DOC = 3


def make_vectorizer() -> TfidfVectorizer:
    return TfidfVectorizer(
        analyzer=analyzer,
        min_df=2,
        max_features=MAX_FEATURES,
        sublinear_tf=True,
        dtype=np.float32,
    )


def make_model(kind: str, c: float) -> Pipeline:
    if kind == "lr":
        clf = LogisticRegression(C=c, max_iter=3000, solver="liblinear")
    else:
        clf = CalibratedClassifierCV(LinearSVC(C=c), cv=3, method="sigmoid")
    return Pipeline([("tfidf", make_vectorizer()), ("clf", clf)])


def scorer(model: Pipeline):
    return lambda texts: model.predict_proba(texts)[:, 1]


def fit(kind: str, train: pd.DataFrame, val: pd.DataFrame, cs=(1.0, 4.0, 8.0, 16.0)) -> tuple[Pipeline, float]:
    """Pick C on val (doc-level AUC), then return the model fitted on train."""
    frame = training_frame(train, WINDOWS_PER_DOC)
    # Fit the vectorizer once; only the classifier changes between C values.
    vec = make_vectorizer().fit(frame["text"])
    xtr = vec.transform(frame["text"])
    xva = vec.transform(val["text"])
    best = (-1.0, None, None)
    for c in cs if kind == "lr" else tuple(x / 4 for x in cs):
        clf = make_model(kind, c).named_steps["clf"].fit(xtr, frame["label"])
        auc = roc_auc_score(val["label"], clf.predict_proba(xva)[:, 1])
        print(f"  C={c:<5} val AUC={auc:.4f}")
        if auc > best[0]:
            best = (auc, c, clf)
    return Pipeline([("tfidf", vec), ("clf", best[2])]), best[1]


def oof_scores(kind: str, c: float, df: pd.DataFrame, folds: int = 5) -> np.ndarray:
    """Out-of-fold P(AI) for every row of df, grouped by split_group (no row is scored by a model
    that saw its group)."""
    out = np.zeros(len(df))
    for k, (tr, te) in enumerate(GroupKFold(folds).split(df, groups=df["split_group"])):
        model = make_model(kind, c).fit(*_xy(training_frame(df.iloc[tr], WINDOWS_PER_DOC)))
        out[te] = model.predict_proba(df.iloc[te]["text"])[:, 1]
        print(f"  oof fold {k + 1}/{folds}")
    return out


def _xy(frame: pd.DataFrame):
    return frame["text"], frame["label"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", default="random")
    ap.add_argument("--model", choices=["lr", "svm"], default="lr")
    args = ap.parse_args()
    exp = {"lr": "E1_tfidf_lr", "svm": "E2_tfidf_svm"}[args.model]

    data = load_split(args.split)
    t0 = time.time()
    model, c = fit(args.model, data["train"], data["val"])
    print(f"fitted {exp} on {args.split} (C={c}) in {time.time() - t0:.0f}s")

    for part in ("val", "test"):
        m = evaluate(scorer(model), data[part])
        print_metrics(f"{exp} / {args.split} / {part}", m)
        write_results(exp, args.split, part, m, {"C": c})
    path = ARTIFACTS / f"{exp}_{args.split}.joblib"
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, path)
    print(f"saved {path}")


if __name__ == "__main__":
    main()
