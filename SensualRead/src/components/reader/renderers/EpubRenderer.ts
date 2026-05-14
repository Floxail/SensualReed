/**
 * EpubRenderer - EPUB file renderer
 *
 * Parses EPUB files (ZIP archives) and extracts text content.
 * Uses JSZip for archive reading and react-native-fs for file access.
 */

import RNFS from 'react-native-fs';
import JSZip from 'jszip';
import {
  IRenderer,
  BookMetadata,
  PageContent,
  ContentChangeCallback,
} from './IRenderer';

interface EpubChapter {
  href: string;
  title: string;
  content: string;
}

export class EpubRenderer implements IRenderer {
  private loaded: boolean = false;
  private metadata: BookMetadata | null = null;
  private currentPage: number = 1;
  private totalPages: number = 0;
  private contentListeners: Set<ContentChangeCallback> = new Set();

  private zip: JSZip | null = null;
  private chapters: EpubChapter[] = [];
  private pages: string[] = [];
  private pageOffsets: number[] = [];
  private basePath: string = '';
  private charsPerPage: number = 1500;

  constructor(charsPerPage: number = 1500) {
    this.charsPerPage = charsPerPage;
  }

  canRender(filePath: string): boolean {
    return filePath.toLowerCase().endsWith('.epub');
  }

  async load(filePath: string): Promise<void> {
    console.log(`[EpubRenderer] Loading: ${filePath}`);

    try {
      // Read EPUB file as base64
      const exists = await RNFS.exists(filePath);
      if (!exists) {
        throw new Error(`File not found: ${filePath}`);
      }

      const base64Content = await RNFS.readFile(filePath, 'base64');
      this.zip = await JSZip.loadAsync(base64Content, { base64: true });

      // Parse EPUB structure
      await this.parseContainer();
      await this.parseOpf();
      await this.extractChapters();

      // Paginate all content
      this.paginateContent();

      this.currentPage = 1;
      this.loaded = true;

      console.log(`[EpubRenderer] Loaded: ${this.metadata?.title} (${this.totalPages} pages, ${this.chapters.length} chapters)`);

      this.notifyContentChange();
    } catch (error) {
      console.error('[EpubRenderer] Load error:', error);
      throw error;
    }
  }

  unload(): void {
    this.loaded = false;
    this.metadata = null;
    this.currentPage = 1;
    this.totalPages = 0;
    this.zip = null;
    this.chapters = [];
    this.pages = [];
    this.pageOffsets = [];
    this.basePath = '';
    console.log('[EpubRenderer] Unloaded');
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
    return ['.epub'];
  }

  getChapters(): { title: string; startPage: number }[] {
    return this.chapters.map((ch, i) => ({
      title: ch.title || `Chapter ${i + 1}`,
      startPage: 1,
    }));
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
    if (this.metadata) {
      this.metadata.currentPage = this.currentPage;
      this.metadata.totalPages = this.totalPages;
    }
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

  /**
   * Parse container.xml to find the OPF file location
   */
  private async parseContainer(): Promise<void> {
    if (!this.zip) throw new Error('EPUB not loaded');

    const containerFile = this.zip.file('META-INF/container.xml');
    if (!containerFile) {
      throw new Error('Invalid EPUB: missing container.xml');
    }

    const containerXml = await containerFile.async('string');

    // Extract rootfile path using regex (simple XML parsing)
    const rootfileMatch = containerXml.match(/rootfile[^>]*full-path="([^"]+)"/);
    if (!rootfileMatch) {
      throw new Error('Invalid EPUB: cannot find rootfile');
    }

    const opfPath = rootfileMatch[1];
    this.basePath = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);

    console.log(`[EpubRenderer] OPF path: ${opfPath}, base: ${this.basePath}`);
  }

  /**
   * Parse the OPF file to extract metadata and spine
   */
  private async parseOpf(): Promise<void> {
    if (!this.zip) throw new Error('EPUB not loaded');

    // Find OPF file
    const opfFile = this.zip.file(/\.opf$/i)[0];
    if (!opfFile) {
      throw new Error('Invalid EPUB: missing OPF file');
    }

    const opfXml = await opfFile.async('string');

    // Extract metadata
    const title = this.extractXmlTag(opfXml, 'dc:title') ||
                  this.extractXmlTag(opfXml, 'title') ||
                  'Unknown Title';
    const author = this.extractXmlTag(opfXml, 'dc:creator') ||
                   this.extractXmlTag(opfXml, 'creator');
    const language = this.extractXmlTag(opfXml, 'dc:language') ||
                     this.extractXmlTag(opfXml, 'language');
    const description = this.extractXmlTag(opfXml, 'dc:description') ||
                        this.extractXmlTag(opfXml, 'description');

    // Build manifest (id -> href mapping)
    const manifest: Map<string, string> = new Map();
    const manifestRegex = /<item[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*>/gi;
    let match;
    while ((match = manifestRegex.exec(opfXml)) !== null) {
      manifest.set(match[1], match[2]);
    }

    // Also try alternate attribute order
    const manifestRegex2 = /<item[^>]*href="([^"]+)"[^>]*id="([^"]+)"[^>]*>/gi;
    while ((match = manifestRegex2.exec(opfXml)) !== null) {
      manifest.set(match[2], match[1]);
    }

    // Extract spine (reading order)
    const spineMatch = opfXml.match(/<spine[^>]*>([\s\S]*?)<\/spine>/i);
    if (spineMatch) {
      const spineContent = spineMatch[1];
      const itemrefRegex = /<itemref[^>]*idref="([^"]+)"[^>]*>/gi;
      while ((match = itemrefRegex.exec(spineContent)) !== null) {
        const idref = match[1];
        const href = manifest.get(idref);
        if (href) {
          this.chapters.push({
            href: href,
            title: '',
            content: '',
          });
        }
      }
    }

    // If no spine found, use manifest items that are HTML/XHTML
    if (this.chapters.length === 0) {
      manifest.forEach((href) => {
        if (href.match(/\.(x?html?|htm)$/i)) {
          this.chapters.push({ href, title: '', content: '' });
        }
      });
    }

    this.metadata = {
      title: title,
      author: author,
      totalPages: 0, // Will be set after pagination
      currentPage: 1,
      language: language,
      description: description,
    };

    console.log(`[EpubRenderer] Metadata: ${title} by ${author}, ${this.chapters.length} spine items`);
  }

  /**
   * Extract text content from each chapter
   */
  private async extractChapters(): Promise<void> {
    if (!this.zip) throw new Error('EPUB not loaded');

    for (const chapter of this.chapters) {
      try {
        // Try different path combinations
        let chapterFile = this.zip.file(this.basePath + chapter.href);
        if (!chapterFile) {
          chapterFile = this.zip.file(chapter.href);
        }
        if (!chapterFile) {
          // Try URL decoding
          chapterFile = this.zip.file(decodeURIComponent(this.basePath + chapter.href));
        }

        if (chapterFile) {
          const html = await chapterFile.async('string');
          chapter.content = this.htmlToText(html);
          chapter.title = this.extractHtmlTitle(html) || '';
        }
      } catch (error) {
        console.warn(`[EpubRenderer] Failed to extract chapter: ${chapter.href}`, error);
      }
    }

    // Filter out empty chapters
    this.chapters = this.chapters.filter(ch => ch.content.trim().length > 0);
    console.log(`[EpubRenderer] Extracted ${this.chapters.length} non-empty chapters`);
  }

  /**
   * Paginate all chapter content
   */
  private paginateContent(): void {
    this.pages = [];
    this.pageOffsets = [];

    // Combine all chapter content
    const allContent = this.chapters
      .map(ch => ch.content)
      .join('\n\n');

    if (!allContent || allContent.length === 0) {
      this.pages = ['No content found in this EPUB.'];
      this.totalPages = 1;
      return;
    }

    // Paginate similar to TxtRenderer
    let startIndex = 0;

    while (startIndex < allContent.length) {
      let endIndex = Math.min(startIndex + this.charsPerPage, allContent.length);

      if (endIndex < allContent.length) {
        // Try paragraph break
        const paragraphBreak = allContent.lastIndexOf('\n\n', endIndex);
        if (paragraphBreak > startIndex && paragraphBreak > endIndex - 300) {
          endIndex = paragraphBreak + 2;
        } else {
          // Try line break
          const lineBreak = allContent.lastIndexOf('\n', endIndex);
          if (lineBreak > startIndex && lineBreak > endIndex - 200) {
            endIndex = lineBreak + 1;
          } else {
            // Try sentence
            const sentenceEnd = Math.max(
              allContent.lastIndexOf('. ', endIndex),
              allContent.lastIndexOf('! ', endIndex),
              allContent.lastIndexOf('? ', endIndex)
            );
            if (sentenceEnd > startIndex && sentenceEnd > endIndex - 150) {
              endIndex = sentenceEnd + 2;
            } else {
              // Word boundary
              const lastSpace = allContent.lastIndexOf(' ', endIndex);
              if (lastSpace > startIndex) {
                endIndex = lastSpace + 1;
              }
            }
          }
        }
      }

      const pageContent = allContent.slice(startIndex, endIndex).trim();
      if (pageContent && /\S/.test(pageContent)) {
        this.pageOffsets.push(startIndex);
        this.pages.push(pageContent);
      }
      startIndex = endIndex;
    }

    this.totalPages = Math.max(1, this.pages.length);
    if (this.metadata) {
      this.metadata.totalPages = this.totalPages;
    }

    console.log(`[EpubRenderer] Paginated into ${this.totalPages} pages`);
  }

  /**
   * Convert HTML to formatted plain text with better paragraph/structure preservation
   */
  private htmlToText(html: string): string {
    let text = html;

    // Remove scripts and styles
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Handle emphasis - wrap with unicode markers for visual distinction
    // Use soft markers that look nice in plain text
    text = text.replace(/<(strong|b)([^>]*)>([\s\S]*?)<\/\1>/gi, '\u2009$3\u2009'); // thin spaces around bold
    text = text.replace(/<(em|i)([^>]*)>([\s\S]*?)<\/\1>/gi, '$3'); // italics preserved as-is

    // Convert headers with visual separation
    text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n\u2500\u2500\u2500\n$1\n\u2500\u2500\u2500\n\n');
    text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n$1\n\u2500\u2500\n\n');
    text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n$1\n\n');
    text = text.replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/gi, '\n\n$1\n');

    // Convert blockquotes with indentation marker
    text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n\n\u00AB $1 \u00BB\n\n');

    // Convert line breaks
    text = text.replace(/<br\s*\/?>/gi, '\n');

    // Convert paragraphs with proper spacing
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<p[^>]*>/gi, '');

    // Convert divs (often used as paragraphs)
    text = text.replace(/<\/div>/gi, '\n');
    text = text.replace(/<div[^>]*>/gi, '');

    // Convert list items
    text = text.replace(/<li[^>]*>/gi, '\n  \u2022 ');
    text = text.replace(/<\/li>/gi, '');

    // Remove list containers
    text = text.replace(/<\/?(ul|ol)[^>]*>/gi, '\n');

    // Table rows
    text = text.replace(/<\/tr>/gi, '\n');
    text = text.replace(/<\/?t[dhr][^>]*>/gi, ' ');
    text = text.replace(/<\/?table[^>]*>/gi, '\n');

    // Horizontal rules
    text = text.replace(/<hr[^>]*\/?>/gi, '\n\n\u2500\u2500\u2500\u2500\u2500\n\n');

    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode HTML entities
    text = this.decodeHtmlEntities(text);

    // Remove invisible Unicode chars that fool .trim() (soft-hyphen, ZWS, ZWNJ, ZWJ, word-joiner, BOM)
    text = text.replace(/[­​‌‍⁠﻿]/g, '');

    // Normalize spaces (but preserve newlines)
    text = text.replace(/[ \t]+/g, ' ');

    // Clean up excessive newlines (max 2 consecutive)
    text = text.replace(/\n{3,}/g, '\n\n');

    // Trim each line
    text = text.split('\n').map(line => line.trim()).join('\n');

    // Remove leading/trailing whitespace
    text = text.trim();

    return text;
  }

  /**
   * Decode common HTML entities
   */
  private decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      '&nbsp;': ' ',
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&mdash;': '\u2014',
      '&ndash;': '\u2013',
      '&hellip;': '\u2026',
      '&lsquo;': '\u2018',
      '&rsquo;': '\u2019',
      '&ldquo;': '\u201C',
      '&rdquo;': '\u201D',
      '&copy;': '\u00A9',
      '&reg;': '\u00AE',
      '&trade;': '\u2122',
    };

    let result = text;
    for (const [entity, char] of Object.entries(entities)) {
      result = result.replace(new RegExp(entity, 'gi'), char);
    }

    // Decode numeric entities
    result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
    result = result.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));

    return result;
  }

  /**
   * Extract title from HTML
   */
  private extractHtmlTitle(html: string): string | null {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      return this.decodeHtmlEntities(titleMatch[1]).trim();
    }

    // Try h1
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) {
      return this.decodeHtmlEntities(h1Match[1]).trim();
    }

    return null;
  }

  /**
   * Extract content of an XML tag
   */
  private extractXmlTag(xml: string, tagName: string): string | undefined {
    const regex = new RegExp(`<${tagName}[^>]*>([^<]*)<\/${tagName}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1].trim() : undefined;
  }

  private notifyContentChange(): void {
    const content = this.getCurrentContent();
    if (content) {
      this.contentListeners.forEach(listener => listener(content));
    }
  }
}
