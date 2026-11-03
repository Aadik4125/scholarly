"""Export the fine-tuned transformer to ONNX (int8-quantized) in the layout transformers.js
expects, and add transformer scores to the parity fixtures.

    python -m detector.export.to_onnx --checkpoint artifacts/E3_distilroberta_random

Writes ../models/transformer/{config.json, tokenizer.json, tokenizer_config.json,
onnx/model_quantized.onnx}.
"""

from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from pathlib import Path

import numpy as np

from .to_json import APP_MODELS


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--out", default=str(APP_MODELS / "transformer"))
    args = ap.parse_args()

    from optimum.onnxruntime import ORTModelForSequenceClassification, ORTQuantizer
    from optimum.onnxruntime.configuration import AutoQuantizationConfig
    from transformers import AutoTokenizer

    out = Path(args.out)
    (out / "onnx").mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        ORTModelForSequenceClassification.from_pretrained(args.checkpoint, export=True).save_pretrained(tmp)
        quantizer = ORTQuantizer.from_pretrained(tmp)
        # Dynamic int8: no calibration data needed; portable across x86 and ARM CPUs.
        qconfig = AutoQuantizationConfig.arm64(is_static=False, per_channel=False)
        quantizer.quantize(save_dir=tmp, quantization_config=qconfig)
        shutil.copy(Path(tmp) / "model_quantized.onnx", out / "onnx" / "model_quantized.onnx")
        shutil.copy(Path(tmp) / "config.json", out / "config.json")
    AutoTokenizer.from_pretrained(args.checkpoint).save_pretrained(out)
    size = (out / "onnx" / "model_quantized.onnx").stat().st_size / 1e6
    print(f"wrote {out} (model {size:.0f} MB)")

    # Expected transformer scores (from the quantized ONNX model, as Node will run it). The
    # fixtures live beside the model files, i.e. in the parent of --out, so exporting to a
    # staging directory never touches the deployed one.
    fixtures_path = out.parent / "parity_fixtures.json"
    if fixtures_path.exists():
        import onnxruntime as ort

        tok = AutoTokenizer.from_pretrained(out)
        sess = ort.InferenceSession(str(out / "onnx" / "model_quantized.onnx"))
        fixtures = json.loads(fixtures_path.read_text())
        names = {i.name for i in sess.get_inputs()}
        for f in fixtures:
            enc = tok(f["normalized"], truncation=True, max_length=256, return_tensors="np")
            logits = sess.run(None, {k: v for k, v in enc.items() if k in names})[0][0]
            e = np.exp(logits - logits.max())
            f["transformer_score"] = float(e[1] / e.sum())
        fixtures_path.write_text(json.dumps(fixtures, ensure_ascii=False))
        print("added transformer scores to parity fixtures")


if __name__ == "__main__":
    main()
