/**
 * KeywordAnalyzer - Regex-based keyword detection
 *
 * MVP implementation using simple keyword matching.
 * Future: Replace with sentiment analysis ML model.
 */

import {
  ITriggerEngine,
  KeywordMap,
  KeywordEntry,
  AnalysisResult,
} from './ITriggerEngine';

export class KeywordAnalyzer implements ITriggerEngine {
  private keywords: KeywordMap = { keywords: [] };
  private sensitivity: number = 1.0;
  private enabled: boolean = true;
  private consecutiveMatches: number = 0;
  private lastMatchTime: number = 0;

  // Time window for consecutive match bonus (ms)
  private static readonly CONSECUTIVE_WINDOW = 5000;

  constructor(initialKeywords?: KeywordMap) {
    if (initialKeywords) {
      this.keywords = initialKeywords;
    }
  }

  analyze(content: string): AnalysisResult {
    const timestamp = Date.now();

    if (!this.enabled || this.keywords.keywords.length === 0) {
      return {
        score: 0,
        matchedKeywords: [],
        rawScore: 0,
        timestamp,
      };
    }

    const matchedKeywords: string[] = [];
    let rawScore = 0;

    // Normalize content for matching
    const normalizedContent = this.keywords.caseSensitive
      ? content
      : content.toLowerCase();

    // Check each keyword
    for (const entry of this.keywords.keywords) {
      const searchWord = this.keywords.caseSensitive
        ? entry.word
        : entry.word.toLowerCase();

      // Use word boundary regex for accurate matching
      const regex = new RegExp(`\\b${this.escapeRegex(searchWord)}\\b`, 'gi');
      const matches = normalizedContent.match(regex);

      if (matches && matches.length > 0) {
        matchedKeywords.push(entry.word);
        // Add score for each occurrence
        rawScore += entry.score * matches.length;
      }
    }

    // Apply consecutive match bonus
    if (matchedKeywords.length > 0) {
      const timeSinceLastMatch = timestamp - this.lastMatchTime;
      if (timeSinceLastMatch < KeywordAnalyzer.CONSECUTIVE_WINDOW) {
        this.consecutiveMatches++;
        const bonus = this.keywords.consecutiveBonus ?? 1.1;
        rawScore *= Math.pow(bonus, Math.min(this.consecutiveMatches, 5));
      } else {
        this.consecutiveMatches = 0;
      }
      this.lastMatchTime = timestamp;
    }

    // Apply sensitivity multiplier
    rawScore *= this.sensitivity;

    // Cap final score at 100
    const score = Math.min(100, Math.max(0, Math.round(rawScore)));

    return {
      score,
      matchedKeywords,
      rawScore,
      timestamp,
    };
  }

  setKeywords(keywords: KeywordMap): void {
    this.keywords = keywords;
  }

  getKeywords(): KeywordMap {
    return this.keywords;
  }

  setSensitivity(multiplier: number): void {
    this.sensitivity = Math.min(2.0, Math.max(0.1, multiplier));
  }

  getSensitivity(): number {
    return this.sensitivity;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  reset(): void {
    this.consecutiveMatches = 0;
    this.lastMatchTime = 0;
  }

  /**
   * Escape special regex characters in keyword
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
