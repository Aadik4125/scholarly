"""E3: fine-tune DistilRoBERTa for AI-text detection (runs on Apple-silicon MPS, CUDA or CPU).

    python -m detector.models.transformer --split random
    python -m detector.models.transformer --split random --max-train 20000 --epochs 1   # quick run

Trains on documents + 3-sentence windows (the unit the app scores), selects the best epoch on
val AUC, evaluates val/test, and saves a Hugging Face checkpoint to
artifacts/E3_distilroberta_<split>/ for ONNX export.
"""

from __future__ import annotations

import argparse
import math
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import roc_auc_score
from torch.utils.data import DataLoader
from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

from .common import ARTIFACTS, evaluate, load_split, print_metrics, training_frame, write_results

BASE_MODEL = "distilroberta-base"
MAX_LEN = 256


def device() -> torch.device:
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


class Scorer:
    """texts -> P(AI), batched, sorted by length to minimise padding."""

    def __init__(self, model, tokenizer, dev, batch_size: int = 64):
        self.model, self.tok, self.dev, self.bs = model, tokenizer, dev, batch_size

    @torch.no_grad()
    def __call__(self, texts: list[str]) -> np.ndarray:
        self.model.eval()
        order = np.argsort([len(t) for t in texts])
        out = np.zeros(len(texts), dtype=np.float64)
        for i in range(0, len(texts), self.bs):
            idx = order[i : i + self.bs]
            enc = self.tok([texts[j] for j in idx], truncation=True, max_length=MAX_LEN, padding=True, return_tensors="pt")
            logits = self.model(**{k: v.to(self.dev) for k, v in enc.items()}).logits.float()
            out[idx] = torch.softmax(logits, -1)[:, 1].cpu().numpy()
        return out


class OnnxScorer:
    """texts -> P(AI) with the exported int8 ONNX model, one text at a time, exactly as the Node
    server runs it (batching would change int8 activation scales)."""

    def __init__(self, model_dir, threads: int = 4):
        import onnxruntime as ort

        from ..features.text import normalize

        self.normalize = normalize
        self.tok = AutoTokenizer.from_pretrained(model_dir)
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = threads
        self.sess = ort.InferenceSession(str(Path(model_dir) / "onnx" / "model_quantized.onnx"), opts)
        self.inputs = {i.name for i in self.sess.get_inputs()}

    def __call__(self, texts: list[str]) -> np.ndarray:
        out = np.zeros(len(texts))
        for i, t in enumerate(texts):
            enc = self.tok(self.normalize(t), truncation=True, max_length=MAX_LEN, return_tensors="np")
            logits = self.sess.run(None, {k: v for k, v in enc.items() if k in self.inputs})[0][0]
            out[i] = 1 / (1 + np.exp(logits[0] - logits[1]))
        return out


def batches(texts, labels, tok, batch_size, shuffle, seed):
    """Length-bucketed batches: shuffle, then sort within chunks of 50 batches."""
    rng = np.random.default_rng(seed)
    idx = rng.permutation(len(texts)) if shuffle else np.arange(len(texts))
    chunk = batch_size * 50
    order = []
    for s in range(0, len(idx), chunk):
        c = idx[s : s + chunk]
        order += list(c[np.argsort([len(texts[j]) for j in c])])
    groups = [order[s : s + batch_size] for s in range(0, len(order), batch_size)]
    if shuffle:
        rng.shuffle(groups)
    for g in groups:
        enc = tok([texts[j] for j in g], truncation=True, max_length=MAX_LEN, padding=True, return_tensors="pt")
        enc["labels"] = torch.tensor([labels[j] for j in g])
        yield enc


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", default="random")
    ap.add_argument("--epochs", type=int, default=2)
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--lr", type=float, default=2e-5)
    ap.add_argument("--max-train", type=int, default=60_000, help="cap on training texts (docs + windows)")
    ap.add_argument("--max-val", type=int, default=4000)
    ap.add_argument("--seed", type=int, default=13)
    ap.add_argument("--keep-origin", nargs="*", default=["modern"], help="origins always included in training")
    args = ap.parse_args()
    torch.manual_seed(args.seed)
    dev = device()
    print(f"device={dev}")

    data = load_split(args.split)
    frame = training_frame(data["train"], windows_per_doc=2, seed=args.seed)
    # Every text from the priority origins is kept (current-model paper sections are a small share
    # of the corpus but the case the app sees most); the rest of the cap is sampled from the others.
    keep = frame["origin"].isin(args.keep_origin)
    rest = frame[~keep]
    frame = pd.concat([frame[keep], rest.sample(max(0, min(len(rest), args.max_train - int(keep.sum()))), random_state=args.seed)])
    print(f"kept all {int(keep.sum())} texts from {args.keep_origin}")
    texts, labels = frame["text"].tolist(), frame["label"].astype(int).tolist()
    val = data["val"].sample(min(len(data["val"]), args.max_val), random_state=args.seed)
    print(f"train texts={len(texts)}  val docs={len(val)}")

    tok = AutoTokenizer.from_pretrained(BASE_MODEL)
    model = AutoModelForSequenceClassification.from_pretrained(BASE_MODEL, num_labels=2).to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
    steps = math.ceil(len(texts) / args.batch_size) * args.epochs
    sched = get_linear_schedule_with_warmup(opt, int(0.06 * steps), steps)
    score = Scorer(model, tok, dev)
    out_dir = ARTIFACTS / f"E3_distilroberta_{args.split}"

    best = -1.0
    step = 0
    t0 = time.time()
    for epoch in range(args.epochs):
        model.train()
        running = 0.0
        for enc in batches(texts, labels, tok, args.batch_size, True, args.seed + epoch):
            loss = model(**{k: v.to(dev) for k, v in enc.items()}).loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
            opt.zero_grad()
            step += 1
            running = 0.98 * running + 0.02 * loss.item() if step > 1 else loss.item()
            if step % 200 == 0:
                rate = step / (time.time() - t0)
                print(f"  epoch {epoch + 1} step {step}/{steps} loss {running:.4f}  {rate:.1f} it/s  eta {(steps - step) / rate / 60:.0f} min")
        auc = roc_auc_score(val["label"], score(val["text"].tolist()))
        print(f"epoch {epoch + 1}: val AUC {auc:.4f}")
        if auc > best:
            best = auc
            model.save_pretrained(out_dir)
            tok.save_pretrained(out_dir)

    model = AutoModelForSequenceClassification.from_pretrained(out_dir).to(dev)
    score = Scorer(model, tok, dev)
    for part in ("val", "test"):
        m = evaluate(score, data[part])
        print_metrics(f"E3_distilroberta / {args.split} / {part}", m)
        write_results("E3_distilroberta", args.split, part, m, {"train_texts": len(texts), "epochs": args.epochs})
    print(f"saved {out_dir}  ({(time.time() - t0) / 60:.0f} min)")


if __name__ == "__main__":
    main()
