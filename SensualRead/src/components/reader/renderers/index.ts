/**
 * Renderers - Strategy pattern implementations
 */

export * from './IRenderer';
export * from './EpubRenderer';
export * from './TxtRenderer';

import { IRenderer } from './IRenderer';
import { EpubRenderer } from './EpubRenderer';
import { TxtRenderer } from './TxtRenderer';

/**
 * Get appropriate renderer for a file
 * @param filePath - Path to the file
 * @returns Renderer instance or null if unsupported
 */
export function getRendererForFile(filePath: string): IRenderer | null {
  const renderers: IRenderer[] = [
    new EpubRenderer(),
    new TxtRenderer(),
    // TODO: Add PdfRenderer, CbzRenderer, CbrRenderer
  ];

  for (const renderer of renderers) {
    if (renderer.canRender(filePath)) {
      return renderer;
    }
  }

  return null;
}

/**
 * Get list of all supported file extensions
 */
export function getSupportedExtensions(): string[] {
  return ['.epub', '.txt'];
  // TODO: Add .pdf, .cbz, .cbr when implemented
}
