"""Helpers shared by every model: loading splits, building windows, scoring documents the same
way the server does, and writing result tables."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd

from ..eval.metrics import classification_report
from ..features.text import sentence_spans, windows

ROOT = Path(__file__).resolve().parents[3]
PROCESSED = ROOT / "data" / "processed"
SPLITS = ROOT / "data" / "splits"
ARTIFACTS = ROOT / "artifacts"
RESULTS = ROOT / "experiments" / "results"

Scorer = Callable[[list[str]], np.ndarray]  # texts -> P(AI)


def load_corpus() -> pd.DataFrame:
    return pd.read_parquet(PROCESSED / "corpus.parquet")


def load_split(name: str) -> dict[str, pd.DataFrame]:
    corpus = load_corpus()
    parts = pd.read_parquet(SPLITS / f"{name}.parquet")
    df = corpus.merge(parts, on="text_id")
    return {p: df[df["part"] == p].reset_index(drop=True) for p in ("train", "val", "test")}


def doc_windows(text: str) -> list[str]:
    spans = sentence_spans(text)
    return [text[spans[i][0] : spans[j - 1][1]] for i, j in windows(len(spans))]


def make_windows(df: pd.DataFrame, per_doc: int, seed: int = 0) -> pd.DataFrame:
    """Up to `per_doc` random 3-sentence windows per document, keeping the doc's metadata."""
    rng = np.random.default_rng(seed)
    rows = []
    for rec in df.itertuples(index=False):
        ws = doc_windows(rec.text)
        if len(ws) <= 1:
            continue  # a 1-window doc is the doc itself
        for k in rng.choice(len(ws), size=min(per_doc, len(ws)), replace=False):
            rows.append({**rec._asdict(), "text": ws[k]})
    return pd.DataFrame(rows)


def training_frame(train: pd.DataFrame, windows_per_doc: int, seed: int = 0) -> pd.DataFrame:
    """Whole documents plus windows from them: the app scores windows, so the model must too."""
    return pd.concat([train, make_windows(train, windows_per_doc, seed)], ignore_index=True)


def score_documents(score: Scorer, texts: list[str]) -> tuple[np.ndarray, np.ndarray]:
    """Score each document the way the server will: per-window scores, then (a) mean over
    windows and (b) the share of sentences whose averaged window score is >= 0.5."""
    all_windows, owner = [], []
    spans_per_doc = []
    for d, text in enumerate(texts):
        spans = sentence_spans(text)
        spans_per_doc.append(spans)
        for i, j in windows(len(spans)):
            all_windows.append(text[spans[i][0] : spans[j - 1][1]])
            owner.append(d)
    p = score(all_windows) if all_windows else np.array([])
    mean_score = np.zeros(len(texts))
    flagged_share = np.zeros(len(texts))
    k = 0
    for d, spans in enumerate(spans_per_doc):
        ws = windows(len(spans))
        if not ws:
            continue
        wp = p[k : k + len(ws)]
        k += len(ws)
        sent = np.zeros(len(spans))
        cnt = np.zeros(len(spans))
        for (i, j), s in zip(ws, wp):
            sent[i:j] += s
            cnt[i:j] += 1
        sent /= np.maximum(cnt, 1)
        mean_score[d] = wp.mean()
        flagged_share[d] = (sent >= 0.5).mean()
    return mean_score, flagged_share


def evaluate(score: Scorer, df: pd.DataFrame, windows_per_doc: int = 3) -> dict[str, dict]:
    """Metrics at three granularities: whole document, single window, and document scored as the
    mean of its windows (what the app shows)."""
    out = {"doc": classification_report(df["label"], score(df["text"].tolist()))}
    w = make_windows(df, windows_per_doc, seed=1)
    if len(w):
        out["window"] = classification_report(w["label"], score(w["text"].tolist()))
    mean_score, _ = score_documents(score, df["text"].tolist())
    out["doc_via_windows"] = classification_report(df["label"], mean_score)
    return out


def write_results(experiment: str, split: str, part: str, metrics: dict[str, dict], extra: dict | None = None) -> None:
    RESULTS.mkdir(parents=True, exist_ok=True)
    rows = [{"experiment": experiment, "split": split, "part": part, "granularity": g, **m, **(extra or {})} for g, m in metrics.items()]
    path = RESULTS / "results.csv"
    df = pd.DataFrame(rows)
    if path.exists():
        old = pd.read_csv(path)
        key = ["experiment", "split", "part", "granularity"]
        old = old.merge(df[key], on=key, how="left", indicator=True)
        old = old[old["_merge"] == "left_only"].drop(columns="_merge")
        df = pd.concat([old, df], ignore_index=True)
    df.to_csv(path, index=False)


def print_metrics(title: str, metrics: dict[str, dict]) -> None:
    print(f"\n{title}")
    for g, m in metrics.items():
        print(
            f"  {g:16s} n={m['n']:6d}  F1={m['f1']:.3f}  P={m['precision']:.3f}  R={m['recall']:.3f}  "
            f"FPR={m['fpr']:.3f}  AUC={m['roc_auc']:.3f}  TPR@1%FPR={m['tpr_at_1pct_fpr']:.3f}"
        )


def save_json(obj, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj))
