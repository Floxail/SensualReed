"""
export_onnx.py — Export saved CamemBERT model to ONNX + INT8 quantization

Usage:
    python export_onnx.py
    python export_onnx.py --model_dir ./lovense_ai_model/final_model
"""

import argparse
import os
import numpy as np
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

MODEL_DIR = "./lovense_ai_model/final_model"
ONNX_OUT  = "lovense_model.onnx"
ONNX_INT8 = "lovense_model_int8.onnx"
MAX_LEN   = 128


def export(model_dir: str):
    print(f"[1/3] Loading model from {model_dir}...")
    tokenizer = AutoTokenizer.from_pretrained(model_dir)
    model = AutoModelForSequenceClassification.from_pretrained(model_dir)
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
