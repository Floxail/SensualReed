import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import RNFS from 'react-native-fs';
import { CamembertTokenizer } from './CamembertTokenizer';
import { ITriggerEngine, KeywordMap, AnalysisResult } from '../../engines/analysis/ITriggerEngine';

const MAX_LEN     = 128;
// Asset paths (relative to android/app/src/main/assets/)
const MODEL_ASSET = 'models/lovense_camembert.onnx';
const TOK_ASSET   = 'models/tokenizer.json';
// Destination filenames in DocumentDirectoryPath
const MODEL_FILE  = 'lovense_camembert.onnx';
const TOK_FILE    = 'camembert_tokenizer.json';

/**
 * OnDeviceAIAnalyzer — CamemBERT ONNX INT8 scorer implementing ITriggerEngine.
 *
 * Usage flow:
 *   1. TriggerEngine calls initialize() on startup (async, non-blocking).
 *   2. TriggerEngine calls preloadAsync(text) inside preloadContent() for page N+1.
 *   3. analyze() returns lastScore synchronously — always zero-lag.
 *   4. TriggerEngine hot-swaps KeywordAnalyzer → this when _ready === true.
 */
export class OnDeviceAIAnalyzer implements ITriggerEngine {
  private session:     InferenceSession | null = null;
  private tokenizer:   CamembertTokenizer | null = null;
  private lastScore  = 0;
  private _sensitivity = 1.0;
  private _enabled     = true;
  private _keywords: KeywordMap = { keywords: [] };
  private _ready       = false;

  get isModelReady(): boolean { return this._ready; }

  async initialize(): Promise<void> {
    const docDir    = RNFS.DocumentDirectoryPath;
    const modelPath = `${docDir}/${MODEL_FILE}`;
    const tokPath   = `${docDir}/${TOK_FILE}`;

    if (!(await RNFS.exists(modelPath))) {
      console.log('[OnDeviceAI] Copying model from assets (~106 MB)...');
      await RNFS.copyFileAssets(MODEL_ASSET, modelPath);
    }
    if (!(await RNFS.exists(tokPath))) {
      await RNFS.copyFileAssets(TOK_ASSET, tokPath);
    }

    [this.session, this.tokenizer] = await Promise.all([
      InferenceSession.create(modelPath),
      CamembertTokenizer.fromPath(tokPath),
    ]);
    this._ready = true;
    console.log('[OnDeviceAI] ONNX session ready');
  }

  /**
   * Run async inference and cache the result.
   * Called by TriggerEngine.preloadContent() for next-page prefetch.
   * Never throws — errors are swallowed to preserve fallback stability.
   */
  async preloadAsync(text: string): Promise<void> {
    if (!this.session || !this.tokenizer) return;
    try {
      this.lastScore = await this._infer(text);
    } catch (e) {
      console.warn('[OnDeviceAI] Inference error:', e);
    }
  }

  /** Synchronous — returns cached score from last preloadAsync(). Zero lag. */
  analyze(_content: string): AnalysisResult {
    const score = Math.max(0, Math.min(100, Math.round(this.lastScore * this._sensitivity)));
    return {
      score,
      matchedKeywords: [],
      rawScore: this.lastScore,
      timestamp: Date.now(),
    };
  }

  private async _infer(text: string): Promise<number> {
    const { input_ids, attention_mask } = this.tokenizer!.encode(text, MAX_LEN);

    const ids64  = new BigInt64Array(MAX_LEN);
    const mask64 = new BigInt64Array(MAX_LEN);
    for (let i = 0; i < MAX_LEN; i++) {
      ids64[i]  = BigInt(input_ids[i]);
      mask64[i] = BigInt(attention_mask[i]);
    }

    const feeds = {
      input_ids:      new Tensor('int64', ids64,  [1, MAX_LEN]),
      attention_mask: new Tensor('int64', mask64, [1, MAX_LEN]),
    };

    const out = await this.session!.run(feeds);
    const raw = Number(out.score.data[0]); // 0–1 (model output) → ×100 = 0–100
    return Math.max(0, Math.min(100, Math.round(raw * 100)));
  }

  // ── ITriggerEngine boilerplate ──────────────────────────────────────────────
  setKeywords(keywords: KeywordMap): void { this._keywords = keywords; }
  getKeywords(): KeywordMap              { return this._keywords; }
  setSensitivity(m: number): void        { this._sensitivity = m; }
  getSensitivity(): number               { return this._sensitivity; }
  setEnabled(e: boolean): void           { this._enabled = e; }
  isEnabled(): boolean                   { return this._enabled; }
  reset(): void                          { this.lastScore = 0; }
}
