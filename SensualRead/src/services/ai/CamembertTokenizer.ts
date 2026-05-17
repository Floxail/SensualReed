import RNFS from 'react-native-fs';

interface TokenizerJSON {
  model: {
    vocab: Record<string, number>;
    merges: string[];
  };
  post_processor?: {
    cls?: [string, number];
    sep?: [string, number];
  };
  padding?: {
    pad_id: number;
  };
}

export class CamembertTokenizer {
  private vocab: Map<string, number>;
  private mergeRanks: Map<string, number>;
  readonly clsId: number;
  readonly sepId: number;
  readonly padId: number;
  readonly unkId: number;

  constructor(config: TokenizerJSON) {
    this.vocab = new Map(Object.entries(config.model.vocab));
    this.mergeRanks = new Map(
      config.model.merges.map((m, rank) => [m, rank])
    );
    this.clsId = config.post_processor?.cls?.[1] ?? this.vocab.get('<s>') ?? 5;
    this.sepId = config.post_processor?.sep?.[1] ?? this.vocab.get('</s>') ?? 6;
    this.padId = config.padding?.pad_id ?? this.vocab.get('<pad>') ?? 1;
    this.unkId = this.vocab.get('<unk>') ?? 3;
  }

  static async fromAssets(assetName = 'tokenizer.json'): Promise<CamembertTokenizer> {
    const dest = `${RNFS.DocumentDirectoryPath}/${assetName}`;
    if (!(await RNFS.exists(dest))) {
      await RNFS.copyFileAssets(assetName, dest);
    }
    return CamembertTokenizer.fromPath(dest);
  }

  static async fromPath(filePath: string): Promise<CamembertTokenizer> {
    const raw = await RNFS.readFile(filePath, 'utf8');
    return new CamembertTokenizer(JSON.parse(raw) as TokenizerJSON);
  }

  encode(text: string, maxLength: number): { input_ids: number[]; attention_mask: number[] } {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const ids: number[] = [this.clsId];

    for (let wi = 0; wi < words.length && ids.length < maxLength - 1; wi++) {
      const word = '▁' + words[wi]; // ▁ prefix (Metaspace)
      const tokens = this.bpe(word);
      for (const id of tokens) {
        if (ids.length >= maxLength - 1) break;
        ids.push(id);
      }
    }
    ids.push(this.sepId);

    const seqLen = ids.length;
    const pad = maxLength - seqLen;
    return {
      input_ids: [...ids, ...new Array(pad).fill(this.padId)],
      attention_mask: [...new Array(seqLen).fill(1), ...new Array(pad).fill(0)],
    };
  }

  private bpe(word: string): number[] {
    let syms = [...word]; // Unicode-safe split

    while (syms.length > 1) {
      let bestRank = Infinity;
      let bi = -1;
      for (let i = 0; i < syms.length - 1; i++) {
        const rank = this.mergeRanks.get(`${syms[i]} ${syms[i + 1]}`);
        if (rank !== undefined && rank < bestRank) {
          bestRank = rank;
          bi = i;
        }
      }
      if (bi === -1) break;
      syms = [...syms.slice(0, bi), syms[bi] + syms[bi + 1], ...syms.slice(bi + 2)];
    }

    return syms.map(s => this.vocab.get(s) ?? this.unkId);
  }
}
