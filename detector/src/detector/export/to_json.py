"""Export trained scikit-learn models to JSON for server/aiDetector, plus parity fixtures.

    python -m detector.export.to_json --model artifacts/E1_tfidf_lr_random.joblib

Writes models/tfidf.json and models/parity_fixtures.json at the repo root (../models). The Node
port computes: counts over analyzer() features -> 1 + ln(count) -> * idf -> L2 normalize ->
dot(coef) + intercept -> sigmoid.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from ..features import linguistic
from ..features.text import analyzer, normalize, sentence_spans, windows, words
from ..models.common import PROCESSED, ROOT

APP_MODELS = ROOT.parent / "models"


def export_tfidf(model, version: str) -> dict:
    vec = model.named_steps["tfidf"]
    clf = model.named_steps["clf"]
    terms = [None] * len(vec.vocabulary_)
    for term, idx in vec.vocabulary_.items():
        terms[idx] = term
    return {
        "type": "tfidf_lr",
        "version": version,
        "sublinear_tf": bool(vec.sublinear_tf),
        "terms": terms,
        "idf": [round(float(x), 6) for x in vec.idf_],
        "coef": [round(float(x), 6) for x in clf.coef_[0]],
        "intercept": float(clf.intercept_[0]),
    }


def parity_fixtures(model, n: int = 200, seed: int = 0) -> list[dict]:
    """Texts with expected intermediate values at every stage, for the Node parity test."""
    corpus = pd.read_parquet(PROCESSED / "corpus.parquet")
    texts = corpus.sample(n, random_state=seed)["text"].tolist()
    texts += [
        "Short.",
        "  Weird   spacing\tand\nnewlines.  Café naïve – “quotes” ’n’ stuff…  ",
        "No terminal punctuation at all",
        "Numbers 3.14 and e.g. abbreviations confuse splitters! Do they? Yes.",
    ]
    out = []
    for raw in texts:
        t = normalize(raw)
        spans = sentence_spans(t)
        out.append(
            {
                "raw": raw,
                "normalized": t,
                "spans": spans,
                "windows": windows(len(spans)),
                "words": words(t)[:50],
                "n_features": len(analyzer(t)),
                "linguistic": [round(x, 9) for x in linguistic.extract(t)],
                "tfidf_score": float(model.predict_proba([t])[0, 1]),
            }
        )
    return out


def export_fusion(src: Path, out: Path, version: str) -> None:
    """Copy the stacker JSON (with a version) and add fused scores to the parity fixtures, using
    the tfidf/transformer scores already stored there."""
    import math

    fusion = json.loads(src.read_text())
    fusion["version"] = version
    (out / "fusion.json").write_text(json.dumps(fusion))
    fixtures_path = out / "parity_fixtures.json"
    fixtures = json.loads(fixtures_path.read_text())
    for f in fixtures:
        x = []
        for name in fusion["inputs"]:
            if name.startswith("logit("):
                p = min(max(f[name[6:-1]], 1e-6), 1 - 1e-6)
                x.append(math.log(p / (1 - p)))
        if len(x) < len(fusion["inputs"]):
            x += linguistic.extract(f["normalized"])
        z = fusion["intercept"] + sum((v - m) / sc * c for v, m, sc, c in zip(x, fusion["mean"], fusion["scale"], fusion["coef"]))
        f["fused_score"] = 1 / (1 + math.exp(-z))
    fixtures_path.write_text(json.dumps(fixtures, ensure_ascii=False))
    print(f"wrote {out / 'fusion.json'} ({version}) and fused parity scores")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", help="TF-IDF joblib to export (required unless --fusion)")
    ap.add_argument("--version", default="detector-v1-tfidf")
    ap.add_argument("--out", default=str(APP_MODELS))
    ap.add_argument("--fusion", help="artifacts/E4_fusion_*.json to ship as fusion.json (run after to_onnx)")
    args = ap.parse_args()
    if args.fusion:
        export_fusion(Path(args.fusion), Path(args.out), args.version)
        return
    if not args.model:
        ap.error("--model is required")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    model = joblib.load(args.model)
    (out / "tfidf.json").write_text(json.dumps(export_tfidf(model, args.version), separators=(",", ":")))
    (out / "parity_fixtures.json").write_text(json.dumps(parity_fixtures(model), ensure_ascii=False))
    print(f"wrote {out / 'tfidf.json'} ({(out / 'tfidf.json').stat().st_size / 1e6:.1f} MB) and parity fixtures")


if __name__ == "__main__":
    main()
