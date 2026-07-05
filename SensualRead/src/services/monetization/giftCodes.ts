// IMPORTANT : seuls les hashes SHA-256 sont stockés ici.
// Pour générer un hash : node -e "const {createHash}=require('crypto'); console.log(createHash('sha256').update('TONCODE'.toUpperCase()).digest('hex'))"

export const GIFT_CODE_HASHES: string[] = [
  // Add SHA-256 hashes here before release — never add plaintext codes
];
