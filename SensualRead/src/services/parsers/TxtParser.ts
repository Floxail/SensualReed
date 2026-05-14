/**
 * TxtParser — plain text file parser (Phase 6 prep stub)
 *
 * Raw file reading + paragraph splitting, decoupled from TxtRenderer pagination.
 * TxtRenderer will delegate file I/O here in Phase 6.
 */

import RNFS from 'react-native-fs';
import { IParser, ParsedBook, ParsedPage } from './IParser';

export class TxtParser implements IParser {
  getSupportedExtensions(): string[] {
    return ['.txt'];
  }

  canParse(filePath: string): boolean {
    return filePath.toLowerCase().endsWith('.txt');
  }

  async parse(filePath: string): Promise<ParsedBook> {
    const raw = await RNFS.readFile(filePath, 'utf8');
    const clean = raw.replace(/[­​‌‍⁠﻿]/g, '');
    const paragraphs = clean.split(/\n{2,}/).filter((p) => p.trim().length > 0);

    const pages: ParsedPage[] = paragraphs.map((text, index) => ({
      text: text.trim(),
      index,
    }));

    const fileName = filePath.split('/').pop() ?? filePath;
    const title = fileName.replace(/\.txt$/i, '');

    return { title, format: 'txt', pages };
  }
}
