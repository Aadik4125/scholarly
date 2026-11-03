# SCHOLARLY AI-text detector

This folder trains and evaluates the self-hosted model behind the **AI Content** page. It replaces
the Sapling API. Training happens here in Python. The app runs the exported model inside the
Node server (`server/aiDetector/`), so paper text never leaves the server.

```
data → splits → E1/E2 TF-IDF ─┐
                E3 DistilRoBERTa ─┼→ E4 fusion (LR stacker) → export → server/aiDetector
                linguistic feats ─┘          └→ E5–E7 FITRON experiments (research only)
```

## Setup
```bash
cd detector
/opt/homebrew/bin/python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt -e .
.venv/bin/pip install torch transformers accelerate "optimum[onnxruntime]" fitron   # E3+, E5–E7
```

## Pipeline
All commands run from `detector/` with `.venv/bin/python -m ...`.

| Step | Command | Output |
|---|---|---|
| 1. Download | see `DATA.md`; `detector.data.fetch_raid`, then `detector.data.fetch_raid humans` | `data/raw/` |
| 2. Corpus | `detector.data.prepare` | `data/processed/*.parquet` |
| 3. Splits | `detector.data.splits` | `data/splits/*.parquet` |
| 4. E1 / E2 | `detector.models.tfidf --split random --model lr\|svm` | `artifacts/E1_…joblib`, `experiments/results/results.csv` |
| 5. E3 | `detector.models.transformer --split random` | `artifacts/E3_distilroberta_random/` |
| 6. E4 | `detector.models.fusion --split random [--no-transformer]` | stacker + `fusion_table_<split>.parquet` |
| 7. E5–E7 | `detector.models.fitron_exp --split random` | `results.csv`, `triage.csv` |
| 8. Robustness | `detector.eval.robustness --model artifacts/E1_tfidf_lr_random.joblib` | `robustness.csv` |
| 9. Export | `detector.export.to_json --model artifacts/E1_tfidf_lr_random.joblib` | `../models/tfidf.json`, parity fixtures |
| 10. Parity | `npm run test:detector` (repo root) | JS and Python agree |

To run every experiment on every split, repeat steps 4–8 with `--split` set to `ood_generator`,
`ood_domain_creative` and `ood_domain_academic`.

## Design notes
- **One text spec, two languages.** `features/text.py` and `features/linguistic.py` have exact JS twins. Parity fixtures (exported texts with expected tokens, features and scores) fail the Node test if the two drift apart.
- **Windows.** The app needs per-sentence scores. Single sentences are too short to judge, so models train on whole documents *and* on 3-sentence windows. A sentence's score is the mean over the windows that contain it (`models/common.py:score_documents`, `server/aiDetector/index.js`).
- **Window stride.** The server starts a window every 2 sentences (`AI_DETECT_STRIDE`, default 2) instead of every sentence, which roughly halves transformer work on long papers. Measured with the fusion model on 800 held-out test docs, 400 audit abstracts and 150 mixed human+AI docs:

  | | stride 1 | stride 2 | stride 3 |
  |---|---|---|---|
  | Windows scored | 12,629 | 7,294 | 5,549 |
  | ROC-AUC (mean score) | 0.970 | 0.970 | 0.970 |
  | Human test docs flagged (≥50% AI) | 6.0% | 5.8% | 7.0% |
  | Human audit abstracts flagged | 2.3% | 2.0% | 3.0% |
  | AI test docs caught | 89.3% | 90.0% | 88.8% |
  | Sentence accuracy, mixed docs | 85.6% | 84.7% | 83.0% |

  Stride 2 is within noise of stride 1 (400 human docs give about ±1.2 points); stride 3 flags more human text, so it isn't the default.
- **Blending, not out-of-fold.** Fusion and FITRON train on base-model predictions for `val` and are evaluated on `test`. 5-fold out-of-fold training of the transformer would mean five fine-tunes on a laptop, and blending is equally leakage-safe.
- **FITRON is research-only.** `FITRONModel.fit()` makes its own non-grouped random split, `rank()` retrains on whatever it is given, and TOPSIS scores are relative to the batch. So it can neither be evaluated on a leakage-safe test set as-is nor score one new paper in production. The experiments call its core components (fuzzy profile, tuned decision tree, TOPSIS) under our protocol instead.
- **Modern generators (v2).** The original corpus stops at GPT-4 / Llama-2 (2023) and its human academic text is abstracts. Measured through the app's own scoring path (`server/aiDetector/eval-app.mjs`), v1 was at chance on text from current models. v2 adds 6,447 paper sections: human sections from pre-2022 papers and the same sections written by Claude 4.5-5.5 and GPT-4o/5 (`detector.data.modern`).

  | 400 docs per set, scored as the app does | v1 | v2 |
  |---|---|---|
  | Modern AI caught (Claude/GPT, 7 models) | 33.0% | **84.0%** |
  | Unseen models caught (Sonnet 5.5, GPT-5.5) | 13.5% | **71.5%** |
  | Human paper sections wrongly flagged | 20.3% | **1.3%** |
  | Human arXiv abstracts wrongly flagged | 1.8% | **1.0%** |
  | Legacy AI caught (2019-23 generators) | 94.0% | 87.5% |
  | ROC-AUC, modern | 0.499 | **0.983** |

  Legacy recall drops ~6 points: the price of a model that no longer treats formal academic prose as AI.

- **Headline metric:** TPR at 1% FPR, plus the human-academic audit FPR. In an education setting, falsely flagging a human is the expensive error.

## Shipping a model
1. Run the export (step 9). This writes `models/tfidf.json` at the repo root, which is gitignored.
2. Upload the files to a Hugging Face model repo (or any static host) and set `AI_DETECT_MODEL_URL` on the server. `npm run fetch-models` downloads them at build time.
3. Bump `--version` so the UI and results record which model produced a score.
