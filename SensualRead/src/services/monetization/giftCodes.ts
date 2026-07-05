// IMPORTANT : seuls les hashes SHA-256 sont stockés ici.
// Pour générer un hash : node -e "const {createHash}=require('crypto'); console.log(createHash('sha256').update('TONCODE'.toUpperCase()).digest('hex'))"

export const GIFT_CODE_HASHES: string[] = [
  // Exemple — remplacer par tes vrais hashes avant release :
  // hash de 'FRIEND2024' :
  'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
];
