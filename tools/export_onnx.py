"""
export_onnx.py — Export saved CamemBERT model to ONNX + INT8 quantization

Usage:
    python export_onnx.py
    python export_onnx.py --model_dir ./lovense_ai_model/final_model
"""

import argparse
import os
from pathlib import Path
import numpy as np
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

MODEL_DIR = "./lovense_ai_model/final_model"
ONNX_OUT  = "lovense_model.onnx"
ONNX_INT8 = "lovense_model_int8.onnx"
MAX_LEN   = 128


def find_best_checkpoint(base_dir: Path) -> Path:
    """
    If final_model/ doesn't exist (script crashed before save_pretrained),
    find best checkpoint from trainer_state.json, or fall back to latest checkpoint.
    """
    if (base_dir / "final_model").exists():
        return base_dir / "final_model"

    # Try trainer_state.json → best_model_checkpoint
    state_file = base_dir / "trainer_state.json"
    if state_file.exists():
        import json as _json
        state = _json.loads(state_file.read_text())
        best = state.get("best_model_checkpoint")
        if best and Path(best).exists():
            print(f"[INFO] Using best checkpoint: {best}")
            return Path(best)

    # Fall back: latest checkpoint by number
    checkpoints = sorted(base_dir.glob("checkpoint-*"),
                         key=lambda p: int(p.name.split("-")[-1]))
    if checkpoints:
        print(f"[INFO] Using latest checkpoint: {checkpoints[-1]}")
        return checkpoints[-1]

    raise FileNotFoundError(f"No model found in {base_dir}")


def export(model_dir: str):
    base_dir = Path(model_dir).resolve()
    # If user passed final_model directly, go up one level for checkpoint search
    if base_dir.name == "final_model" and not base_dir.exists():
        base_dir = base_dir.parent

    model_path = find_best_checkpoint(base_dir)
    print(f"[1/3] Loading model from {model_path}...")

    # Load using specific Camembert classes — avoids HF Hub path validator on Windows
    from transformers import CamembertTokenizer, CamembertForSequenceClassification
    tokenizer = CamembertTokenizer.from_pretrained("almanach/camembert-base")
    model = CamembertForSequenceClassification.from_pretrained(
        str(model_path), attn_implementation="eager"
    )
    model.eval()
    model.cpu()

    print("[2/3] Exporting to ONNX...")
    dummy_text = "Il l'embrassa passionnément, les mains tremblantes."
    dummy = tokenizer(dummy_text, return_tensors="pt",
                      max_length=MAX_LEN, padding="max_length", truncation=True)

    torch.onnx.export(
        model,
        (dummy["input_ids"], dummy["attention_mask"]),
        ONNX_OUT,
        input_names=["input_ids", "attention_mask"],
        output_names=["score"],
        dynamic_axes={
            "input_ids":      {0: "batch", 1: "seq"},
            "attention_mask": {0: "batch", 1: "seq"},
            "score":          {0: "batch"},
        },
        opset_version=17,
        do_constant_folding=True,
    )
    size_mb = os.path.getsize(ONNX_OUT) / 1024 / 1024
    print(f"      Saved: {ONNX_OUT}  ({size_mb:.0f} MB)")

    print("[3/3] INT8 quantization...")
    try:
        from onnxruntime.quantization import quantize_dynamic, QuantType
        quantize_dynamic(ONNX_OUT, ONNX_INT8, weight_type=QuantType.QInt8)
        size_mb = os.path.getsize(ONNX_INT8) / 1024 / 1024
        print(f"      Saved: {ONNX_INT8}  ({size_mb:.0f} MB)")
    except Exception as e:
        print(f"      [FAIL] {e}")
        return

    # Quick sanity test
    import onnxruntime as ort
    sess = ort.InferenceSession(ONNX_INT8, providers=["CPUExecutionProvider"])
    test_texts = [
        "Il faisait beau ce matin-là, les oiseaux chantaient dans les arbres.",
        "Elle gémit doucement alors qu'il posait les lèvres sur son cou.",
        "Il la plaqua contre le mur, sa bouche dévorant la sienne avec fièvre.",
    ]
    print("\n      Sanity check (should be low → high):")
    for text in test_texts:
        enc = tokenizer(text, return_tensors="np",
                        max_length=MAX_LEN, padding="max_length", truncation=True)
        out = sess.run(["score"], {
            "input_ids":      enc["input_ids"].astype(np.int64),
            "attention_mask": enc["attention_mask"].astype(np.int64),
        })
        score = float(out[0][0][0]) * 20.0
        print(f"        {score:5.1f}/20  '{text[:60]}'")

    print(f"""
{'='*60}
DONE
  {ONNX_INT8}  ({os.path.getsize(ONNX_INT8)//1024//1024} MB)

Copy to Android:
  cp {ONNX_INT8} ../SensualRead/android/app/src/main/assets/

React Native package:
  npm install onnxruntime-react-native
{'='*60}""")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_dir", default=MODEL_DIR)
    args = parser.parse_args()
    export(args.model_dir)


if __name__ == "__main__":
    main()
