import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import RNFS from 'react-native-fs';
import { CamembertTokenizer } from './CamembertTokenizer';

const MAX_LEN       = 128;
const MODEL_ASSET   = 'lovense_model_int8.onnx';
const TOK_ASSET     = 'tokenizer.json';

export type ScoreCallback = (score: number) => void;

export class AIScorer {
  private session:   InferenceSession | null = null;
  private tokenizer: CamembertTokenizer | null = null;
  private pending:   string | null = null;
  private busy  = false;
  private scoreListeners = new Set<ScoreCallback>();
  private hapticCb: ScoreCallback | null = null;

  async initialize(): Promise<void> {
    if (this.session) return;
    try {
      const modelPath = `${RNFS.DocumentDirectoryPath}/${MODEL_ASSET}`;
      if (!(await RNFS.exists(modelPath))) {
        console.log('[AIScorer] Copying model from assets (~106 MB)...');
        await RNFS.copyFileAssets(MODEL_ASSET, modelPath);
      }
      [this.session, this.tokenizer] = await Promise.all([
        InferenceSession.create(modelPath),
        CamembertTokenizer.fromAssets(TOK_ASSET),
      ]);
      console.log('[AIScorer] Ready');
    } catch (e) {
      console.warn('[AIScorer] Init failed — keyword fallback active:', e);
    }
  }

  get isReady(): boolean {
    return this.session !== null && this.tokenizer !== null;
  }

  setHapticCallback(cb: ScoreCallback | null): void {
    this.hapticCb = cb;
  }

  onScore(cb: ScoreCallback): () => void {
    this.scoreListeners.add(cb);
    return () => this.scoreListeners.delete(cb);
  }

  /** Queue text for inference. Only latest text processed; stale calls dropped. */
  process(text: string): void {
    if (!this.isReady || !text) return;
    this.pending = text;
    if (!this.busy) this._run();
  }

  private async _run(): Promise<void> {
    if (!this.pending || !this.session || !this.tokenizer) return;
    const text = this.pending;
    this.pending = null;
    this.busy = true;
    try {
      const score = await this._infer(text);
      this.scoreListeners.forEach(cb => cb(score));
      this.hapticCb?.(score);
    } catch (e) {
      console.warn('[AIScorer] Inference error:', e);
    } finally {
      this.busy = false;
      if (this.pending) this._run();
    }
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

    const out  = await this.session!.run(feeds);
    const raw  = Number(out.score.data[0]);   // 0–1 (model output)
    return Math.max(0, Math.min(100, Math.round(raw * 100)));
  }
}
