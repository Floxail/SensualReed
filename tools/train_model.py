"""
train_model.py — Phase 8 model trainer for SensualRead

Pipeline:
  dataset_lovense.csv
    → CamemBERT fine-tune (CUDA fp16, RTX 3060)
    → ONNX export (INT8 quantized, ~50 MB)
    → Android via onnxruntime-android

Usage:
    pip install torch transformers datasets scikit-learn onnx onnxruntime
    python train_model.py
    python train_model.py --csv dataset_lovense.csv --epochs 5

Android integration (after this script):
    npm install onnxruntime-react-native
    copy lovense_model_int8.onnx → SensualRead/android/app/src/main/assets/
"""

import os
import csv
import argparse
import numpy as np
import pandas as pd
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification, Trainer, TrainingArguments
from sklearn.model_selection import train_test_split

# ─── Config ────────────────────────────────────────────────────────────────────
MODEL_NAME  = "almanach/camembert-base"   # French BERT, 110M params
MAX_LEN     = 128
OUTPUT_DIR  = "./lovense_ai_model"
ONNX_PATH   = "lovense_model.onnx"
ONNX_INT8   = "lovense_model_int8.onnx"


# ─── Dataset ───────────────────────────────────────────────────────────────────

class LovenseDataset(torch.utils.data.Dataset):
    def __init__(self, encodings, labels):
        self.encodings = encodings
        self.labels    = labels

    def __getitem__(self, idx):
        item = {k: torch.as_tensor(v[idx]) for k, v in self.encodings.items()}
        item['labels'] = torch.as_tensor(self.labels[idx], dtype=torch.float)
        return item

    def __len__(self):
        return len(self.labels)


# ─── ONNX export ───────────────────────────────────────────────────────────────

def export_onnx(model, tokenizer, output_path: str, max_len: int):
    """Export fine-tuned model to ONNX with dynamic axes."""
    model.eval()
    device = next(model.parameters()).device

    dummy_text = "Il l'embrassa passionnément dans la lumière tamisée."
    dummy = tokenizer(dummy_text, return_tensors="pt",
                      max_length=max_len, padding="max_length", truncation=True)
    dummy = {k: v.to(device) for k, v in dummy.items()}

    torch.onnx.export(
        model,
        (dummy["input_ids"], dummy["attention_mask"]),
        output_path,
        input_names=["input_ids", "attention_mask"],
        output_names=["score"],
        dynamic_axes={
            "input_ids":      {0: "batch_size", 1: "seq_len"},
            "attention_mask": {0: "batch_size", 1: "seq_len"},
            "score":          {0: "batch_size"},
        },
        opset_version=17,
        do_constant_folding=True,
    )
    size_mb = os.path.getsize(output_path) / 1024 / 1024
    print(f"[ONNX] Exported: {output_path}  ({size_mb:.0f} MB)")


def quantize_onnx_int8(input_path: str, output_path: str):
    """INT8 dynamic quantization — ~4× smaller, faster CPU/GPU inference."""
    try:
        from onnxruntime.quantization import quantize_dynamic, QuantType
        quantize_dynamic(input_path, output_path, weight_type=QuantType.QInt8)
        size_mb = os.path.getsize(output_path) / 1024 / 1024
        print(f"[ONNX] INT8 quantized: {output_path}  ({size_mb:.0f} MB)")
    except ImportError:
        print("[WARN] onnxruntime not installed — skipping INT8 quantization")
        print("       pip install onnxruntime")


def verify_onnx(model_path: str, tokenizer, sample_text: str):
    """Quick sanity check: run inference through ONNX model."""
    try:
        import onnxruntime as ort
        sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
        enc = tokenizer(sample_text, return_tensors="np",
                        max_length=MAX_LEN, padding="max_length", truncation=True)
        outputs = sess.run(["score"], {
            "input_ids":      enc["input_ids"].astype(np.int64),
            "attention_mask": enc["attention_mask"].astype(np.int64),
        })
        raw_score = float(outputs[0][0][0]) * 20.0  # denormalize
        print(f"[ONNX] Verify OK — sample score: {raw_score:.1f}/20")
        print(f"       Text: '{sample_text[:60]}...'")
    except Exception as e:
        print(f"[WARN] ONNX verification failed: {e}")


# ─── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv",     default="dataset_lovense.csv")
    parser.add_argument("--epochs",  type=int, default=3)
    parser.add_argument("--batch",   type=int, default=32)
    parser.add_argument("--no_onnx", action="store_true", help="Skip ONNX export")
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[GPU] Using: {device.upper()}")
    if device == "cuda":
        print(f"     {torch.cuda.get_device_name(0)}")
        print(f"     VRAM: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")

    # Load dataset
    print(f"\n[1/4] Loading {args.csv}...")
    df = pd.read_csv(args.csv, quoting=csv.QUOTE_ALL)
    df = df.dropna(subset=['text', 'score'])
    df['score'] = pd.to_numeric(df['score'], errors='coerce').clip(0, 20) / 20.0
    df = df.dropna(subset=['score'])
    print(f"      {len(df)} rows  |  mean score: {df['score'].mean()*20:.1f}/20")

    texts  = df['text'].tolist()
    scores = df['score'].tolist()

    train_texts, val_texts, train_scores, val_scores = train_test_split(
        texts, scores, test_size=0.15, random_state=42
    )
    print(f"      Train: {len(train_texts)}  Val: {len(val_texts)}")

    # Tokenize
    print(f"\n[2/4] Tokenizing with {MODEL_NAME}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    train_enc = tokenizer(train_texts, truncation=True, padding=True, max_length=MAX_LEN)
    val_enc   = tokenizer(val_texts,   truncation=True, padding=True, max_length=MAX_LEN)

    train_ds = LovenseDataset(train_enc, train_scores)
    val_ds   = LovenseDataset(val_enc,   val_scores)

    # Model
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, num_labels=1)

    # Train
    print(f"\n[3/4] Training ({args.epochs} epochs, fp16={device=='cuda'})...")
    training_args = TrainingArguments(
        output_dir                  = OUTPUT_DIR,
        num_train_epochs            = args.epochs,
        per_device_train_batch_size = args.batch,
        per_device_eval_batch_size  = args.batch,
        warmup_ratio                = 0.06,
        weight_decay                = 0.01,
        logging_steps               = 50,
        eval_strategy               = "epoch",
        save_strategy               = "epoch",
        load_best_model_at_end      = True,
        metric_for_best_model       = "eval_loss",
        fp16                        = (device == "cuda"),
        dataloader_num_workers      = 2,
        report_to                   = "none",
    )

    trainer = Trainer(
        model         = model,
        args          = training_args,
        train_dataset = train_ds,
        eval_dataset  = val_ds,
    )

    trainer.train()

    # Eval — use trainer.predict() so device handling is automatic
    results = trainer.evaluate()
    val_loss = results.get("eval_loss", -1)

    pred_output = trainer.predict(val_ds)
    preds = pred_output.predictions.flatten()
    trues = pred_output.label_ids.flatten()
    mae = float(np.mean(np.abs(preds - trues))) * 20
    print(f"\n      Val loss: {val_loss:.4f}")
    print(f"      Val MAE : {mae:.2f} / 20")

    # Save PyTorch model
    model.save_pretrained(os.path.join(OUTPUT_DIR, "final_model"))
    tokenizer.save_pretrained(os.path.join(OUTPUT_DIR, "final_model"))
    print(f"      PyTorch model saved: {OUTPUT_DIR}/final_model/")

    # Export ONNX
    if not args.no_onnx:
        print(f"\n[4/4] Exporting ONNX...")
        export_onnx(model, tokenizer, ONNX_PATH, MAX_LEN)
        quantize_onnx_int8(ONNX_PATH, ONNX_INT8)
        verify_onnx(ONNX_INT8, tokenizer, val_texts[0])

    print(f"""
{'='*60}
DONE
  PyTorch model : {OUTPUT_DIR}/final_model/
  ONNX (float)  : {ONNX_PATH}
  ONNX (int8)   : {ONNX_INT8}   ← copy to Android assets
  Val MAE       : {mae:.2f} / 20

Android integration:
  1. npm install onnxruntime-react-native
  2. cp {ONNX_INT8} SensualRead/android/app/src/main/assets/
  3. Replace KeywordAnalyzer with AITriggerEngine (Phase 8)
{'='*60}""")


if __name__ == "__main__":
    main()
