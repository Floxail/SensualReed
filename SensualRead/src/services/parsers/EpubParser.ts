/**
 * EpubParser — EPUB file parser (Phase 6 prep stub)
 *
 * Wraps JSZip + OPF spine extraction, decoupled from EpubRenderer.
 * EpubRenderer will delegate file I/O here in Phase 6.
 */

import { IParser, ParsedBook } from './IParser';

export class EpubParser implements IParser {
  getSupportedExtensions(): string[] {
    return ['.epub'];
  }

  canParse(filePath: string): boolean {
    return filePath.toLowerCase().endsWith('.epub');
  }

  async parse(_filePath: string): Promise<ParsedBook> {
    // Phase 6: extract OPF spine, parse HTML chapters, return ParsedBook
    // For now EpubRenderer handles all this directly.
    throw new Error('EpubParser.parse() not yet implemented — use EpubRenderer directly');
  }
}
