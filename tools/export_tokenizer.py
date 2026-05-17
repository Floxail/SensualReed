"""
export_tokenizer.py — Extract tokenizer.json from HF cache for Android bundling

Usage:
    python export_tokenizer.py
    cp tokenizer.json ../SensualRead/android/app/src/main/assets/
"""

from transformers import AutoTokenizer
from pathlib import Path
import shutil

MODEL_NAME = "almanach/camembert-base"
OUT_FILE   = "tokenizer.json"

print(f"Loading {MODEL_NAME} tokenizer...")
tok = AutoTokenizer.from_pretrained(MODEL_NAME)
tok.save_pretrained("tokenizer_export/")

shutil.copy("tokenizer_export/tokenizer.json", OUT_FILE)
size_kb = Path(OUT_FILE).stat().st_size // 1024
print(f"Saved: {OUT_FILE}  ({size_kb} KB)")
print(f"""
Next:
  cp {OUT_FILE} ../SensualRead/android/app/src/main/assets/
  cp lovense_model_int8.onnx ../SensualRead/android/app/src/main/assets/
""")
