import RNFS from 'react-native-fs';
import JSZip from 'jszip';

export class EpubCoverExtractor {
  async extractCover(
    epubPath: string,
    bookId: string,
    outputDir: string
  ): Promise<string | null> {
    try {
      const exists = await RNFS.exists(epubPath);
      if (!exists) return null;

      const base64 = await RNFS.readFile(epubPath, 'base64');
      const zip = await JSZip.loadAsync(base64, { base64: true });

      const opfFile = zip.file(/\.opf$/i)[0];
      if (!opfFile) return null;

      const opfXml = await opfFile.async('string');
      const basePath = this.getBasePath(opfFile.name);

      // Strategy 1: <meta name="cover" content="id"/>
      const coverIdMatch =
        opfXml.match(/<meta[^>]+name=["']cover["'][^>]+content=["']([^"']+)["']/i) ||
        opfXml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']cover["']/i);

      if (coverIdMatch) {
        const coverId = coverIdMatch[1];
        const hrefMatch =
          opfXml.match(new RegExp(`<item[^>]+id=["']${coverId}["'][^>]+href=["']([^"']+)["']`, 'i')) ||
          opfXml.match(new RegExp(`<item[^>]+href=["']([^"']+)["'][^>]+id=["']${coverId}["']`, 'i'));
        if (hrefMatch) {
          const path = await this.saveImage(zip, basePath, hrefMatch[1], bookId, outputDir);
          if (path) return path;
        }
      }

      // Strategy 2: first image in manifest
      const imgMatch =
        opfXml.match(/<item[^>]+media-type=["']image\/[^"']+["'][^>]+href=["']([^"']+)["']/i) ||
        opfXml.match(/<item[^>]+href=["']([^"']+\.(jpg|jpeg|png|gif|webp))["']/i);
      if (imgMatch) {
        const path = await this.saveImage(zip, basePath, imgMatch[1], bookId, outputDir);
        if (path) return path;
      }

      return null;
    } catch {
      return null;
    }
  }

  private getBasePath(opfName: string): string {
    const lastSlash = opfName.lastIndexOf('/');
    return lastSlash >= 0 ? opfName.substring(0, lastSlash + 1) : '';
  }

  private async saveImage(
    zip: JSZip,
    basePath: string,
    href: string,
    bookId: string,
    outputDir: string
  ): Promise<string | null> {
    const file =
      zip.file(basePath + href) ||
      zip.file(href) ||
      zip.file(decodeURIComponent(basePath + href));
    if (!file) return null;

    const ext = (href.split('.').pop()?.toLowerCase() || 'jpg').replace(/[^a-z]/g, '') || 'jpg';
    const destPath = `${outputDir}/${bookId}_cover.${ext}`;

    const data = await file.async('base64');
    await RNFS.writeFile(destPath, data, 'base64');
    return destPath;
  }
}

export const epubCoverExtractor = new EpubCoverExtractor();
