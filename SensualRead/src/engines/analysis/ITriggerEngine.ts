/**
 * ITriggerEngine - Interface for text analysis engine
 *
 * The Trigger System analyzes text content and produces
 * an intensity score (0-100) for the Haptic Manager.
 */

export interface KeywordEntry {
  word: string;
  score: number;        // Base score contribution (0-100)
  category?: string;    // Optional category for grouping
}

export interface KeywordMap {
  keywords: KeywordEntry[];
  caseSensitive?: boolean;
  // Multiplier for consecutive matches
  consecutiveBonus?: number;
}

export interface AnalysisResult {
  score: number;              // Final intensity score (0-100)
  matchedKeywords: string[];  // Keywords that triggered
  rawScore: number;           // Pre-capped score
  timestamp: number;
}

export interface ITriggerEngine {
  /**
   * Analyze text content and return intensity score
   * @param content - The text to analyze
   * @returns AnalysisResult with score and metadata
   */
  analyze(content: string): AnalysisResult;

  /**
   * Load keyword map for analysis
   * @param keywords - KeywordMap configuration
   */
  setKeywords(keywords: KeywordMap): void;

  /**
   * Get current keyword map
   */
  getKeywords(): KeywordMap;

  /**
   * Set sensitivity multiplier (0.1 - 2.0)
   * Lower = less sensitive, Higher = more sensitive
   */
  setSensitivity(multiplier: number): void;

  /**
   * Get current sensitivity setting
   */
  getSensitivity(): number;

  /**
   * Enable/disable the engine
   */
  setEnabled(enabled: boolean): void;

  /**
   * Check if engine is enabled
   */
  isEnabled(): boolean;

  /**
   * Reset analysis state (for new book/chapter)
   */
  reset(): void;
}
