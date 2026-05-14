/**
 * IParser — Phase 6 prep interface
 *
 * Separates raw file I/O from text extraction.
 * Renderers own layout + pagination; Parsers own file reading + content extraction.
 */

export interface ParsedPage {
  /** Plain text content of this page */
  text: string;
  /** Raw binary data for image/PDF pages (Phase 6) */
  binaryData?: Uint8Array;
  /** 0-based index in the source file */
  index: number;
}

export interface ParsedBook {
  title: string;
  author?: string;
  language?: string;
  format: 'epub' | 'txt' | 'pdf' | 'cbz' | 'cbr';
  pages: ParsedPage[];
  /** Cover image as base64 data URI */
  coverDataUri?: string;
}

export interface IParser {
  /** File extensions this parser handles */
  getSupportedExtensions(): string[];

  /** Returns true if this parser can handle the file at path */
  canParse(filePath: string): boolean;

  /**
   * Parse the file and return structured book content.
   * Heavy I/O — call off the main thread or before rendering.
   */
  parse(filePath: string): Promise<ParsedBook>;
}
