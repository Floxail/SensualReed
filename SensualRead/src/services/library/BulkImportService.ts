import RNFS from 'react-native-fs';
import { PermissionsAndroid, Platform } from 'react-native';

export interface ImportCandidate {
  name: string;
  path: string;
  type: 'epub' | 'txt';
  sizeKB: number;
}

export class BulkImportService {
  async requestStoragePermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        {
          title: 'Accès au stockage',
          message: 'SensualRead a besoin d\'accéder à vos fichiers pour importer des livres.',
          buttonPositive: 'Autoriser',
          buttonNegative: 'Refuser',
        }
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }

  async getDefaultScanDirs(): Promise<string[]> {
    const base = RNFS.ExternalStorageDirectoryPath;
    const candidates = [
      base,
      `${base}/Download`,
      `${base}/Downloads`,
      `${base}/Documents`,
      `${base}/Books`,
      `${base}/EPUB`,
      `${base}/eBooks`,
    ];
    const checks = await Promise.all(
      candidates.map(async (p) => {
        try { return (await RNFS.exists(p)) ? p : null; }
        catch { return null; }
      })
    );
    return checks.filter((p): p is string => p !== null);
  }

  async scanDirectory(dirPath: string, depth: number = 2): Promise<ImportCandidate[]> {
    if (depth < 0) return [];
    const candidates: ImportCandidate[] = [];
    try {
      const items = await RNFS.readDir(dirPath);
      for (const item of items) {
        if (item.isFile()) {
          const ext = item.name.toLowerCase().split('.').pop();
          if (ext === 'epub' || ext === 'txt') {
            candidates.push({
              name: item.name,
              path: item.path,
              type: ext as 'epub' | 'txt',
              sizeKB: Math.round(item.size / 1024),
            });
          }
        } else if (item.isDirectory() && depth > 0) {
          const sub = await this.scanDirectory(item.path, depth - 1).catch(() => []);
          candidates.push(...sub);
        }
      }
    } catch {
      // inaccessible directory — skip silently
    }
    return candidates;
  }

  async scanAllDefaultDirs(): Promise<ImportCandidate[]> {
    const dirs = await this.getDefaultScanDirs();
    const results = await Promise.all(dirs.map((d) => this.scanDirectory(d)));
    const all = results.flat();
    // Deduplicate by path
    const seen = new Set<string>();
    return all.filter((c) => {
      if (seen.has(c.path)) return false;
      seen.add(c.path);
      return true;
    });
  }
}

export const bulkImportService = new BulkImportService();
