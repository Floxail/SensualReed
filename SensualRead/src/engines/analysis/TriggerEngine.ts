import { KeywordAnalyzer } from './KeywordAnalyzer';
import { ITriggerEngine, KeywordMap, AnalysisResult } from './ITriggerEngine';
import { IHapticService } from '../../services/bluetooth';
import { OnDeviceAIAnalyzer } from '../../services/ai/OnDeviceAIAnalyzer';

export type ContentCallback = (content: string) => void;
export type IntensityCallback = (result: AnalysisResult) => void;

export class TriggerEngine {
  private analyzer: ITriggerEngine;
  private aiAnalyzer: OnDeviceAIAnalyzer | null = null;
  private _isAiReady = false;
  private _aiReadyListeners = new Set<() => void>();
  private hapticService: IHapticService | null = null;
  private intensityListeners: Set<IntensityCallback> = new Set();
  private lastResult: AnalysisResult | null = null;
  private preloadedText: string = '';
  private preloadedResult: AnalysisResult | null = null;
  private preloadTimer: ReturnType<typeof setTimeout> | null = null;
  private reanalysisTimer: ReturnType<typeof setTimeout> | null = null;
  private processTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(analyzer?: ITriggerEngine) {
    this.analyzer = analyzer ?? new KeywordAnalyzer();
    this._initAI();
  }

  /** Background AI init — hot-swaps KeywordAnalyzer when model ready. */
  private async _initAI(): Promise<void> {
    try {
      const ai = new OnDeviceAIAnalyzer();
      await ai.initialize();

      // Carry over sensitivity + enabled state from keyword analyzer
      ai.setSensitivity(this.analyzer.getSensitivity());
      ai.setEnabled(this.analyzer.isEnabled());

      this.aiAnalyzer = ai;
      this.analyzer   = ai;
      this._isAiReady = true;
      this._aiReadyListeners.forEach(cb => cb());
      this._aiReadyListeners.clear();
      console.log('[TriggerEngine] Hot-swapped → OnDeviceAIAnalyzer');
    } catch (e) {
      console.warn('[TriggerEngine] AI init failed — KeywordAnalyzer stays active:', e);
    }
  }

  get isAiModelReady(): boolean { return this._isAiReady; }

  onAiModelReady(cb: () => void): () => void {
    if (this._isAiReady) { cb(); return () => {}; }
    this._aiReadyListeners.add(cb);
    return () => this._aiReadyListeners.delete(cb);
  }

  setHapticService(service: IHapticService): void {
    this.hapticService = service;
  }

  /**
   * Pre-analyze next page text.
   * When AI is ready: runs inference async (→ caches score), then sets preloadedResult.
   * When AI not ready: runs keyword analysis synchronously via setTimeout(0).
   */
  preloadContent(text: string): void {
    if (this.preloadTimer) clearTimeout(this.preloadTimer);
    this.preloadTimer = setTimeout(() => {
      if (!text) return;
      const truncated = text.length > 4000 ? text.slice(0, 4000) : text;

      if (this.aiAnalyzer) {
        this.aiAnalyzer.preloadAsync(truncated)
          .then(() => {
            this.preloadedResult = this.analyzer.analyze(truncated);
            this.preloadedText   = text;
          })
          .catch(() => {
            this.preloadedResult = this.analyzer.analyze(truncated);
            this.preloadedText   = text;
          });
      } else {
        this.preloadedResult = this.analyzer.analyze(truncated);
        this.preloadedText   = text;
      }
    }, 0);
  }

  /**
   * Process visible page text.
   * Cache hit → apply immediately (zero lag) + re-analyze at +50ms.
   * Cache miss → defer to setTimeout(0).
   */
  processContent(content: string): void {
    if (!content) return;

    if (this.reanalysisTimer) { clearTimeout(this.reanalysisTimer); this.reanalysisTimer = null; }
    if (this.processTimer)    { clearTimeout(this.processTimer);    this.processTimer    = null; }

    if (this.preloadedResult && this.preloadedText === content) {
      const cached = this.preloadedResult;
      this.preloadedText   = '';
      this.preloadedResult = null;
      this._applyResult(cached);

      this.reanalysisTimer = setTimeout(() => {
        const truncated = content.length > 4000 ? content.slice(0, 4000) : content;
        this._applyResult(this.analyzer.analyze(truncated));
      }, 50);
      return;
    }

    this.processTimer = setTimeout(() => {
      const truncated = content.length > 4000 ? content.slice(0, 4000) : content;
      this._applyResult(this.analyzer.analyze(truncated));
    }, 0);
  }

  // Kept for API compatibility
  setDebounce(_ms: number): void {}

  getAnalyzer(): ITriggerEngine { return this.analyzer; }

  loadKeywords(keywords: KeywordMap): void { this.analyzer.setKeywords(keywords); }

  onIntensityChange(callback: IntensityCallback): () => void {
    this.intensityListeners.add(callback);
    return () => this.intensityListeners.delete(callback);
  }

  getLastResult(): AnalysisResult | null { return this.lastResult; }

  stop(): void {
    if (this.preloadTimer)    { clearTimeout(this.preloadTimer);    this.preloadTimer    = null; }
    if (this.reanalysisTimer) { clearTimeout(this.reanalysisTimer); this.reanalysisTimer = null; }
    if (this.processTimer)    { clearTimeout(this.processTimer);    this.processTimer    = null; }
    this.preloadedText   = '';
    this.preloadedResult = null;
    this.analyzer.reset();
    this.lastResult = null;
    if (this.hapticService?.isConnected()) {
      this.hapticService.stop();
    }
  }

  private _applyResult(result: AnalysisResult): void {
    this.lastResult = result;
    this.intensityListeners.forEach(listener => listener(result));
    if (this.hapticService?.isConnected()) {
      this.hapticService.setIntensity(result.score);
    }
    if (result.score > 0) {
      const tag = this._isAiReady ? '[AI]' : '[KW]';
      console.log(`[TriggerEngine] ${tag} Score: ${result.score}`);
    }
  }
}
