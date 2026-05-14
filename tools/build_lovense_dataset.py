"""
build_lovense_dataset.py — Phase 8 dataset builder (Windows + CUDA local)

Pipeline:
  EPUB/TXT files → paragraph extraction → Ollama local (CUDA) → score 0-20 → CSV

Usage:
    python build_lovense_dataset.py --books_dir C:\\livres
    python build_lovense_dataset.py --books_dir C:\\livres --check      # verify CUDA setup
    python build_lovense_dataset.py --books_dir C:\\livres --workers 12 --model mistral

Requirements:
    pip install requests ebooklib beautifulsoup4 tqdm
"""

import os
import re
import csv
import sys
import json
import time
import argparse
import subprocess
import concurrent.futures
from pathlib import Path
from typing import Iterator, Optional

import requests
from tqdm import tqdm

try:
    import ebooklib
    from ebooklib import epub
    from bs4 import BeautifulSoup
    HAS_EPUB = True
except ImportError:
    HAS_EPUB = False


# ─── Defaults ──────────────────────────────────────────────────────────────────
OLLAMA_URL   = "http://localhost:11434"
MODEL        = "mistral"          # French-capable. llama3.1:8b also works.
WORKERS      = 10                 # Local CUDA = low latency → many parallel requests
MIN_PARA_LEN = 80                 # chars minimum
MAX_PARA_LEN = 600                # chars — keeps prompt short, faster inference
TIMEOUT      = 20                 # seconds per request (local CUDA = fast)
OUTPUT_CSV   = "dataset_lovense.csv"

SCORE_PROMPT = """\
Classify the erotic/sensual intensity of the following text.
Scale: 0 (neutral) to 20 (extremely explicit).
- 0-3  : no erotic content
- 4-8  : romantic tension, light sensuality
- 9-13 : moderate erotic content, suggestive
- 14-17: explicit erotic content
- 18-20: very explicit / intense

Reply with ONE integer only. No words, no punctuation, just the number.

TEXT: {text}
SCORE:"""


# ─── Setup verification ────────────────────────────────────────────────────────

def check_nvidia():
    print("\n[1/3] NVIDIA GPU check...")
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total,driver_version",
             "--format=csv,noheader"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            for line in result.stdout.strip().splitlines():
                print(f"      GPU: {line.strip()}")
            return True
        else:
            print("      [FAIL] nvidia-smi not found or no GPU detected")
            return False
    except FileNotFoundError:
        print("      [FAIL] nvidia-smi not in PATH")
        return False


def check_ollama(url: str, model: str):
    print(f"\n[2/3] Ollama check ({url})...")
    try:
        resp = requests.get(f"{url}/api/tags", timeout=5)
        resp.raise_for_status()
        models = [m["name"] for m in resp.json().get("models", [])]
        if not models:
            print("      [WARN] Ollama running but no models pulled yet")
            print(f"             Run: ollama pull {model}")
            return False
        print(f"      Models installed: {', '.join(models)}")
        if not any(model in m for m in models):
            print(f"      [WARN] Model '{model}' not found. Pull it:")
            print(f"             ollama pull {model}")
            return False
        print(f"      [OK] Model '{model}' ready")
        return True
    except Exception as e:
        print(f"      [FAIL] Cannot reach Ollama: {e}")
        print("             Start Ollama: open a terminal and run 'ollama serve'")
        return False


def check_cuda_in_ollama(url: str, model: str):
    """Send a tiny request and check if Ollama logs mention CUDA/GPU."""
    print(f"\n[3/3] CUDA inference test...")
    try:
        resp = requests.post(
            f"{url}/api/generate",
            json={"model": model, "prompt": "1+1=", "stream": False,
                  "options": {"num_predict": 2, "temperature": 0}},
            timeout=15
        )
        data = resp.json()
        ns_per_token = data.get("eval_duration", 0) / max(data.get("eval_count", 1), 1)
        ms_per_token = ns_per_token / 1_000_000
        print(f"      Response: '{data.get('response', '').strip()}'")
        print(f"      Speed: {ms_per_token:.0f} ms/token", end="")
        if ms_per_token < 50:
            print("  ✓ GPU inference (CUDA active)")
        elif ms_per_token < 200:
            print("  ~ Probably GPU (moderate speed)")
        else:
            print("  ✗ Looks like CPU (slow) — see CUDA setup below")
    except Exception as e:
        print(f"      [FAIL] Test request failed: {e}")


def run_checks(url: str, model: str):
    print("=" * 60)
    print("SensualRead Phase 8 — Setup Check")
    print("=" * 60)
    check_nvidia()
    ok = check_ollama(url, model)
    if ok:
        check_cuda_in_ollama(url, model)
    print("\n" + "=" * 60)
    print("CUDA SETUP (if Ollama runs on CPU):")
    print("  1. Install CUDA Toolkit: https://developer.nvidia.com/cuda-downloads")
    print("  2. Set env var before starting Ollama:")
    print("     [System Properties > Env Variables]")
    print("     OLLAMA_GPU_LAYERS = 999")
    print("     Or in PowerShell:")
    print("     $env:OLLAMA_GPU_LAYERS=999; ollama serve")
    print("  3. Verify: nvidia-smi while running — see 'ollama' in processes")
    print("=" * 60)


# ─── Text extraction ───────────────────────────────────────────────────────────

def _clean(text: str) -> str:
    text = re.sub(r'[­​‌‍⁠﻿\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def extract_paragraphs_txt(path: str) -> list[str]:
    with open(path, encoding='utf-8', errors='replace') as f:
        raw = f.read()
    result = []
    for block in re.split(r'\n{2,}', raw):
        para = _clean(block)
        if len(para) >= MIN_PARA_LEN:
            result.append(para[:MAX_PARA_LEN])
    return result


def extract_paragraphs_epub(path: str) -> list[str]:
    if not HAS_EPUB:
        print(f"  [SKIP] {path} — install ebooklib: pip install ebooklib beautifulsoup4")
        return []
    result = []
    book = epub.read_epub(path, options={'ignore_ncx': True})
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        soup = BeautifulSoup(item.get_content(), 'html.parser')
        # Remove nav/toc elements
        for tag in soup.find_all(['nav', 'aside', 'header', 'footer']):
            tag.decompose()
        for tag in soup.find_all(['p', 'div', 'section']):
            # Skip if it contains nested block elements (structural div)
            if tag.find(['p', 'div', 'section']):
                continue
            para = _clean(tag.get_text())
            if len(para) >= MIN_PARA_LEN:
                result.append(para[:MAX_PARA_LEN])
    return result


def get_paragraphs(path: str) -> list[str]:
    ext = Path(path).suffix.lower()
    if ext == '.txt':
        return extract_paragraphs_txt(path)
    if ext == '.epub':
        return extract_paragraphs_epub(path)
    return []


# ─── Ollama scoring ────────────────────────────────────────────────────────────

def score_paragraph(text: str, url: str, model: str) -> Optional[int]:
    payload = {
        "model": model,
        "prompt": SCORE_PROMPT.format(text=text),
        "stream": False,
        "options": {
            "temperature": 0.0,
            "num_predict": 4,
            "stop": ["\n", " ", ".", ","],
        }
    }
    try:
        resp = requests.post(f"{url}/api/generate", json=payload, timeout=TIMEOUT)
        resp.raise_for_status()
        raw = resp.json().get("response", "").strip()
        m = re.search(r'\b([01]?\d|20)\b', raw)
        if m:
            return max(0, min(20, int(m.group(1))))
    except Exception:
        pass
    return None


def score_worker(args: tuple) -> dict:
    row_id, book_title, paragraph, url, model = args
    score = score_paragraph(paragraph, url, model)
    return {"id": row_id, "book": book_title, "score": score, "text": paragraph}


# ─── Checkpoint ────────────────────────────────────────────────────────────────

def load_done_ids(csv_path: str) -> set[int]:
    done: set[int] = set()
    p = Path(csv_path)
    if not p.exists():
        return done
    with open(p, newline='', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            try:
                done.add(int(row['id']))
            except (KeyError, ValueError):
                pass
    print(f"[RESUME] {len(done)} paragraphs already scored in {csv_path}")
    return done


# ─── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Build SensualRead Phase 8 intensity dataset (Windows + CUDA)"
    )
    parser.add_argument("--books_dir", default="./books",
                        help="Folder containing EPUB and/or TXT files")
    parser.add_argument("--output",    default=OUTPUT_CSV)
    parser.add_argument("--model",     default=MODEL,
                        help="Ollama model name (default: mistral)")
    parser.add_argument("--workers",   type=int, default=WORKERS,
                        help="Parallel requests (default: 10, increase with fast GPU)")
    parser.add_argument("--min_score", type=int, default=0,
                        help="Only save rows with score >= N (e.g. 4 to skip neutral)")
    parser.add_argument("--check",     action="store_true",
                        help="Verify CUDA + Ollama setup then exit")
    args = parser.parse_args()

    if args.check:
        run_checks(OLLAMA_URL, args.model)
        return

    # Verify Ollama reachable
    try:
        requests.get(f"{OLLAMA_URL}/api/tags", timeout=5).raise_for_status()
    except Exception:
        print(f"[ERROR] Ollama not reachable at {OLLAMA_URL}")
        print("        Run: ollama serve")
        print("        Or check if Ollama is running in system tray")
        sys.exit(1)

    # Collect books
    books_dir = Path(args.books_dir)
    book_files = sorted(books_dir.glob("*.epub")) + sorted(books_dir.glob("*.txt"))
    if not book_files:
        print(f"[ERROR] No EPUB/TXT files in {books_dir}")
        sys.exit(1)

    # Build work queue
    print(f"[INFO] Scanning {len(book_files)} book(s)...")
    done_ids = load_done_ids(args.output)

    work_items: list[tuple] = []
    total_paragraphs = 0
    global_id = 0

    for book_path in book_files:
        paras = get_paragraphs(str(book_path))
        total_paragraphs += len(paras)
        skipped_book = 0
        for para in paras:
            if global_id not in done_ids:
                work_items.append((global_id, book_path.stem, para, OLLAMA_URL, args.model))
            else:
                skipped_book += 1
            global_id += 1
        label = f"  {book_path.name}: {len(paras)} paragraphs"
        if skipped_book:
            label += f" ({skipped_book} already done)"
        print(label)

    to_score = len(work_items)
    if to_score == 0:
        print("\n[DONE] Dataset already complete. Nothing to score.")
        return

    print(f"\n[INFO] {to_score} paragraphs to score")
    print(f"       Model: {args.model}  |  Workers: {args.workers}  |  min_score: {args.min_score}")
    print(f"       Output: {Path(args.output).absolute()}\n")

    # Open CSV
    csv_exists = Path(args.output).exists() and len(done_ids) > 0
    fieldnames = ['id', 'book', 'score', 'text']
    written = 0
    skipped = 0
    errors  = 0
    t0 = time.time()

    with open(args.output, 'a' if csv_exists else 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
        if not csv_exists:
            writer.writeheader()

        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            future_map = {pool.submit(score_worker, item): item for item in work_items}

            with tqdm(total=to_score, unit='§', ncols=80,
                      bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}]') as bar:
                for future in concurrent.futures.as_completed(future_map):
                    result = future.result()
                    bar.update(1)

                    if result['score'] is None:
                        errors += 1
                        bar.set_postfix(ok=written, skip=skipped, err=errors)
                        continue

                    if result['score'] < args.min_score:
                        skipped += 1
                        bar.set_postfix(ok=written, skip=skipped, err=errors)
                        continue

                    writer.writerow({
                        'id':    result['id'],
                        'book':  result['book'],
                        'score': result['score'],
                        'text':  result['text'],
                    })
                    f.flush()  # crash-safe: each row persisted immediately
                    written += 1
                    bar.set_postfix(ok=written, skip=skipped, err=errors)

    elapsed = time.time() - t0
    rate = to_score / max(elapsed, 1)

    print(f"\n{'='*60}")
    print(f"DONE — {written} rows written to {args.output}")
    print(f"       {skipped} skipped (below min_score={args.min_score})")
    print(f"       {errors} errors (Ollama timeout or bad response)")
    print(f"       Time: {elapsed:.0f}s  |  Speed: {rate:.1f} paragraphs/sec")
    if errors > 0:
        print(f"\n[TIP] Re-run same command to retry failed paragraphs (resume works automatically)")
    print(f"\nNext step: python train_model.py --dataset {args.output}")
    print("=" * 60)


if __name__ == "__main__":
    main()
