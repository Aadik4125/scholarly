"""Classification metrics used for every experiment, plus bootstrap confidence intervals."""

from __future__ import annotations

import numpy as np
from sklearn.metrics import average_precision_score, roc_auc_score, roc_curve


def tpr_at_fpr(y: np.ndarray, p: np.ndarray, target_fpr: float = 0.01) -> tuple[float, float]:
    """Best TPR whose FPR stays <= target, and the score threshold that achieves it."""
    fpr, tpr, thr = roc_curve(y, p)
    ok = fpr <= target_fpr
    i = int(np.argmax(np.where(ok, tpr, -1)))
    return float(tpr[i]), float(thr[i])


def classification_report(y, p, threshold: float = 0.5) -> dict:
    y = np.asarray(y).astype(int)
    p = np.asarray(p, dtype=float)
    pred = p >= threshold
    tp = int((pred & (y == 1)).sum())
    fp = int((pred & (y == 0)).sum())
    fn = int((~pred & (y == 1)).sum())
    tn = int((~pred & (y == 0)).sum())
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    both = len(np.unique(y)) == 2
    out = {
        "n": len(y),
        "precision": precision,
        "recall": recall,
        "f1": 2 * precision * recall / (precision + recall) if precision + recall else 0.0,
        "fpr": fp / (fp + tn) if fp + tn else 0.0,
        "roc_auc": roc_auc_score(y, p) if both else float("nan"),
        "pr_auc": average_precision_score(y, p) if both else float("nan"),
    }
    out["tpr_at_1pct_fpr"] = tpr_at_fpr(y, p)[0] if both else float("nan")
    return out


def bootstrap_ci(y, p, metric: str, n: int = 1000, seed: int = 0, alpha: float = 0.05) -> tuple[float, float]:
    y = np.asarray(y)
    p = np.asarray(p)
    rng = np.random.default_rng(seed)
    vals = []
    for _ in range(n):
        idx = rng.integers(0, len(y), len(y))
        if len(np.unique(y[idx])) < 2:
            continue
        vals.append(classification_report(y[idx], p[idx])[metric])
    lo, hi = np.quantile(vals, [alpha / 2, 1 - alpha / 2])
    return float(lo), float(hi)
