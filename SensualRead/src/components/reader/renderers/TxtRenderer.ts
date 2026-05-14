/**
 * TxtRenderer - Plain text file renderer
 *
 * Reads .txt files and paginates content for display.
 * Uses react-native-fs for file system access.
 */

import RNFS from 'react-native-fs';
import {
  IRenderer,
  BookMetadata,
  PageContent,
  ContentChangeCallback,
} from './IRenderer';

export class TxtRenderer implements IRenderer {
  private loaded: boolean = false;
  private metadata: BookMetadata | null = null;
  private currentPage: number = 1;
  private totalPages: number = 0;
  private contentListeners: Set<ContentChangeCallback> = new Set();
  private textContent: string = '';
  private pages: string[] = [];
  private filePath: string = '';
  private pageOffsets: number[] = [];

  // Characters per page (configurable)
  private charsPerPage: number = 1500;

  constructor(charsPerPage: number = 1500) {
    this.charsPerPage = charsPerPage;
  }

  canRender(filePath: string): boolean {
    return filePath.toLowerCase().endsWith('.txt');
  }

  async load(filePath: string): Promise<void> {
    console.log(`[TxtRenderer] Loading: ${filePath}`);

    try {
      // Check if file exists
      const exists = await RNFS.exists(filePath);
      if (!exists) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Read file content and strip invisible chars
      const raw = await RNFS.readFile(filePath, 'utf8');
      this.textContent = raw.replace(/[­​‌‍⁠﻿]/g, '');
      this.filePath = filePath;

      // Paginate content
      this.paginateContent();

      // Extract filename as title
      const fileName = filePath.split(/[/\\]/).pop() || 'Unknown';
      const title = fileName.replace(/\.txt$/i, '');

      this.metadata = {
        title: title,
        totalPages: this.totalPages,
        currentPage: 1,
      };
      this.currentPage = 1;
      this.loaded = true;

      console.log(`[TxtRenderer] Loaded: ${title} (${this.totalPages} pages, ${this.textContent.length} chars)`);

      this.notifyContentChange();
    } catch (error) {
      console.error('[TxtRenderer] Load error:', error);
      throw error;
    }
  }

  unload(): void {
    this.loaded = false;
    this.metadata = null;
    this.currentPage = 1;
    this.totalPages = 0;
    this.textContent = '';
    this.pages = [];
    this.pageOffsets = [];
    this.filePath = '';
    console.log('[TxtRenderer] Unloaded');
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getMetadata(): BookMetadata | null {
    return this.metadata;
  }

  getCurrentContent(): PageContent | null {
    if (!this.loaded || this.pages.length === 0) return null;

    return {
      text: this.pages[this.currentPage - 1] || '',
      pageNumber: this.currentPage,
    };
  }

  nextPage(): boolean {
    if (!this.loaded || this.currentPage >= this.totalPages) {
      return false;
    }
    this.currentPage++;
    if (this.metadata) {
      this.metadata.currentPage = this.currentPage;
    }
    this.notifyContentChange();
    return true;
  }

  prevPage(): boolean {
    if (!this.loaded || this.currentPage <= 1) {
      return false;
    }
    this.currentPage--;
    if (this.metadata) {
      this.metadata.currentPage = this.currentPage;
    }
    this.notifyContentChange();
    return true;
  }

  goToPage(page: number): boolean {
    if (!this.loaded || page < 1 || page > this.totalPages) {
      return false;
    }
    this.currentPage = page;
    if (this.metadata) {
      this.metadata.currentPage = this.currentPage;
    }
    this.notifyContentChange();
    return true;
  }

  getCurrentPage(): number {
    return this.currentPage;
  }

  getTotalPages(): number {
    return this.totalPages;
  }

  onContentChange(callback: ContentChangeCallback): () => void {
    this.contentListeners.add(callback);
    return () => {
      this.contentListeners.delete(callback);
    };
  }

  getSupportedExtensions(): string[] {
    return ['.txt'];
  }

  setCharsPerPage(chars: number): void {
    this.charsPerPage = Math.max(500, Math.min(5000, chars));
    if (!this.loaded) return;
    const progress = this.totalPages > 1
      ? (this.currentPage - 1) / (this.totalPages - 1)
      : 0;
    this.paginateContent();
    this.currentPage = Math.max(1, Math.min(
      Math.round(progress * (this.totalPages - 1)) + 1,
      this.totalPages
    ));
    if (this.metadata) this.metadata.currentPage = this.currentPage;
    this.notifyContentChange();
  }

  getPageText(pageNumber: number): string | null {
    if (!this.loaded || pageNumber < 1 || pageNumber > this.totalPages) return null;
    return this.pages[pageNumber - 1] ?? null;
  }

  getCurrentCharOffset(): number {
    if (!this.loaded || this.pageOffsets.length === 0) return 0;
    return this.pageOffsets[this.currentPage - 1] ?? 0;
  }

  goToCharOffset(offset: number): boolean {
    if (!this.loaded || this.pageOffsets.length === 0) return false;
    let targetPage = 1;
    for (let i = 0; i < this.pageOffsets.length; i++) {
      if (this.pageOffsets[i] <= offset) {
        targetPage = i + 1;
      } else {
        break;
      }
    }
    return this.goToPage(targetPage);
  }

  getSourceType(): 'text' | 'binary' {
    return 'text';
  }

  /**
   * Get full text content (for search, etc.)
   */
  getFullText(): string {
    return this.textContent;
  }

  /**
   * Split text content into pages
   * Tries to break at paragraph or sentence boundaries
   */
  private paginateContent(): void {
    this.pages = [];
    this.pageOffsets = [];
    const content = this.textContent;

    if (!content || content.length === 0) {
      this.pages = [''];
      this.totalPages = 1;
      return;
    }

    let startIndex = 0;

    while (startIndex < content.length) {
      let endIndex = Math.min(startIndex + this.charsPerPage, content.length);

      // If we're not at the end, try to find a good break point
      if (endIndex < content.length) {
        // First, try to break at a paragraph (double newline)
        const paragraphBreak = content.lastIndexOf('\n\n', endIndex);
        if (paragraphBreak > startIndex && paragraphBreak > endIndex - 300) {
          endIndex = paragraphBreak + 2;
        } else {
          // Try to break at a single newline
          const lineBreak = content.lastIndexOf('\n', endIndex);
          if (lineBreak > startIndex && lineBreak > endIndex - 200) {
            endIndex = lineBreak + 1;
          } else {
            // Try to break at a sentence end (. ! ?)
            const sentenceEnd = Math.max(
              content.lastIndexOf('. ', endIndex),
              content.lastIndexOf('! ', endIndex),
              content.lastIndexOf('? ', endIndex)
            );
            if (sentenceEnd > startIndex && sentenceEnd > endIndex - 150) {
              endIndex = sentenceEnd + 2;
            } else {
              // Last resort: break at word boundary
              const lastSpace = content.lastIndexOf(' ', endIndex);
              if (lastSpace > startIndex) {
                endIndex = lastSpace + 1;
              }
            }
          }
        }
      }

      const pageContent = content.slice(startIndex, endIndex).trim();
      if (pageContent && /\S/.test(pageContent)) {
        this.pageOffsets.push(startIndex);
        this.pages.push(pageContent);
      }
      startIndex = endIndex;
    }

    this.totalPages = Math.max(1, this.pages.length);
    console.log(`[TxtRenderer] Paginated into ${this.totalPages} pages`);
  }

  private notifyContentChange(): void {
    const content = this.getCurrentContent();
    if (content) {
      this.contentListeners.forEach(listener => listener(content));
    }
  }
}
