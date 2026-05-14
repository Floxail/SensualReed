import { KeywordAnalyzer } from './KeywordAnalyzer';
import { ITriggerEngine, KeywordMap, AnalysisResult } from './ITriggerEngine';
import { IHapticService } from '../../services/bluetooth';

export type ContentCallback = (content: string) => void;
export type IntensityCallback = (result: AnalysisResult) => void;

export class TriggerEngine {
  private analyzer: ITriggerEngine;
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
  }

  setHapticService(service: IHapticService): void {
    this.hapticService = service;
  }

  /**
   * Pre-analyze next page text deferred (setTimeout 0) so it doesn't block
   * the current animation frame. Result is cached for processContent().
   */
  preloadContent(text: string): void {
    if (this.preloadTimer) clearTimeout(this.preloadTimer);
    this.preloadTimer = setTimeout(() => {
      if (!text) return;
      const truncated = text.length > 4000 ? text.slice(0, 4000) : text;
      this.preloadedResult = this.analyzer.analyze(truncated);
      this.preloadedText = text;
    }, 0);
  }

  /**
   * Process visible page text.
   * Option A: if a preloaded result exists for this text, apply it immediately
   * (zero lag) then re-analyze at +50ms for self-correction.
   * Otherwise defer analysis to setTimeout(0) to avoid blocking main thread.
   */
  processContent(content: string): void {
    if (!content) return;

    if (this.reanalysisTimer) {
      clearTimeout(this.reanalysisTimer);
      this.reanalysisTimer = null;
    }

    if (this.processTimer) {
      clearTimeout(this.processTimer);
      this.processTimer = null;
    }

    if (this.preloadedResult && this.preloadedText === content) {
      const cached = this.preloadedResult;
      this.preloadedText = '';
      this.preloadedResult = null;
      this._applyResult(cached);

      this.reanalysisTimer = setTimeout(() => {
        const truncated = content.length > 4000 ? content.slice(0, 4000) : content;
        const fresh = this.analyzer.analyze(truncated);
        this._applyResult(fresh);
      }, 50);
      return;
    }

    // Fallback: defer analysis to avoid blocking main thread
    this.processTimer = setTimeout(() => {
      const truncated = content.length > 4000 ? content.slice(0, 4000) : content;
      const result = this.analyzer.analyze(truncated);
      this._applyResult(result);
    }, 0);
  }

  // Kept for API compatibility — debounce removed
  setDebounce(_ms: number): void {}

  getAnalyzer(): ITriggerEngine {
    return this.analyzer;
  }

  loadKeywords(keywords: KeywordMap): void {
    this.analyzer.setKeywords(keywords);
  }

  onIntensityChange(callback: IntensityCallback): () => void {
    this.intensityListeners.add(callback);
    return () => {
      this.intensityListeners.delete(callback);
    };
  }

  getLastResult(): AnalysisResult | null {
    return this.lastResult;
  }

  stop(): void {
    if (this.preloadTimer) { clearTimeout(this.preloadTimer); this.preloadTimer = null; }
    if (this.reanalysisTimer) { clearTimeout(this.reanalysisTimer); this.reanalysisTimer = null; }
    if (this.processTimer) { clearTimeout(this.processTimer); this.processTimer = null; }
    this.preloadedText = '';
    this.preloadedResult = null;
    this.analyzer.reset();
    this.lastResult = null;
    if (this.hapticService && this.hapticService.isConnected()) {
      this.hapticService.stop();
    }
  }

  private _applyResult(result: AnalysisResult): void {
    this.lastResult = result;
    this.intensityListeners.forEach(listener => listener(result));
    if (this.hapticService && this.hapticService.isConnected()) {
      this.hapticService.setIntensity(result.score);
    }
    if (result.score > 0) {
      console.log(`[TriggerEngine] Score: ${result.score} | Keywords: ${result.matchedKeywords.join(', ')}`);
    }
  }
}
