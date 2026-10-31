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
- **Blending, not out-of-fold.** Fusion and FITRON train on base-model predictions for `val` and are evaluated on `test`. 5-fold out-of-fold training of the transformer would mean five fine-tunes on a laptop, and blending is equally leakage-safe.
- **FITRON is research-only.** `FITRONModel.fit()` makes its own non-grouped random split, `rank()` retrains on whatever it is given, and TOPSIS scores are relative to the batch. So it can neither be evaluated on a leakage-safe test set as-is nor score one new paper in production. The experiments call its core components (fuzzy profile, tuned decision tree, TOPSIS) under our protocol instead.
- **Headline metric:** TPR at 1% FPR, plus the human-academic audit FPR. In an education setting, falsely flagging a human is the expensive error.

## Shipping a model
1. Run the export (step 9). This writes `models/tfidf.json` at the repo root, which is gitignored.
2. Upload the files to a Hugging Face model repo (or any static host) and set `AI_DETECT_MODEL_URL` on the server. `npm run fetch-models` downloads them at build time.
3. Bump `--version` so the UI and results record which model produced a score.
