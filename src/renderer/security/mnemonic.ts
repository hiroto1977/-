/**
 * Minimal BIP-39 implementation for 256-bit entropy (24 words English).
 *
 * Used by `vault.ts` for the recovery-key branch:
 *
 *   entropy (32 bytes) ──► encodeMnemonic ──► "abandon abandon … wrist" (24 words)
 *   "abandon abandon … wrist" ──► decodeMnemonic ──► entropy (32 bytes, throws if checksum invalid)
 *
 * Scope: 24 words / 256 bits only. 12 / 15 / 18 / 21-word mnemonics are out of
 * scope. English wordlist only. No PBKDF2 (`mnemonicToSeed`) — we only need the
 * raw entropy bytes because vault.ts re-derives via its own PBKDF2.
 *
 * Reference: https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki
 */

import { BIP39_ENGLISH } from './bip39-wordlist';

// 24 words × 11 bits = 264 bits = 256 bits entropy + 8 bits checksum.
const ENTROPY_BITS = 256;
const ENTROPY_BYTES = ENTROPY_BITS / 8; // 32
const CHECKSUM_BITS = ENTROPY_BITS / 32; // 8
const WORD_COUNT = (ENTROPY_BITS + CHECKSUM_BITS) / 11; // 24

// Pre-compute the reverse map so decode is O(1) per word.
// The .map callback is a trivial (k,v) projection — its semantics are
// implicitly verified by every decode test (any mutation that breaks
// the index → "unknown word" errors). The defensive length check below
// is unkillable in practice (wordlist IS 2048 words at build time) so
// we Stryker-disable that block.
// Stryker disable next-line ArrowFunction
const WORD_INDEX: Map<string, number> = new Map(BIP39_ENGLISH.map((w, i) => [w, i]));

// Stryker disable next-line all
if (BIP39_ENGLISH.length !== 2048) {
  // Defensive — if wordlist is corrupted at build time, fail fast.
  // Stryker disable next-line all
  throw new Error(`bip39-wordlist: expected 2048 words, got ${BIP39_ENGLISH.length}`);
}

// --- Encoding ---------------------------------------------------------

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const h = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return new Uint8Array(h);
}

/** Convert 32-byte entropy to a 24-word mnemonic. */
export async function encodeMnemonic(entropy: Uint8Array): Promise<string> {
  if (entropy.length !== ENTROPY_BYTES) {
    throw new Error(`entropy must be ${ENTROPY_BYTES} bytes`);
  }
  // Append 1 byte of SHA-256(entropy)[0] as checksum (only top CHECKSUM_BITS used).
  const hash = await sha256(entropy);
  // Build a bit-string then split into 11-bit groups.
  const combined = new Uint8Array(ENTROPY_BYTES + 1);
  combined.set(entropy);
  combined[ENTROPY_BYTES] = hash[0]!;
  // combined is 33 bytes = 264 bits. We need first 264 bits = 24 × 11.
  const words: string[] = [];
  for (let i = 0; i < WORD_COUNT; i++) {
    const startBit = i * 11;
    const idx = extractBits(combined, startBit, 11);
    words.push(BIP39_ENGLISH[idx]!);
  }
  return words.join(' ');
}

/** Extract `n` bits from `bytes` starting at `startBit`, MSB-first. */
function extractBits(bytes: Uint8Array, startBit: number, n: number): number {
  let value = 0;
  for (let i = 0; i < n; i++) {
    const bit = startBit + i;
    const byte = bytes[bit >>> 3]!;
    const off = 7 - (bit & 7);
    value = (value << 1) | ((byte >>> off) & 1);
  }
  return value;
}

// --- Decoding ---------------------------------------------------------

/** Validate + convert a 24-word mnemonic back to 32-byte entropy.
 *
 *  Throws on:
 *   - wrong word count
 *   - unknown word
 *   - checksum mismatch
 */
export async function decodeMnemonic(mnemonic: string): Promise<Uint8Array> {
  const words = normalizeMnemonic(mnemonic).split(' ');
  if (words.length !== WORD_COUNT) {
    throw new Error(`mnemonic must be ${WORD_COUNT} words (got ${words.length})`);
  }
  // Map each word to its 11-bit index.
  const indices: number[] = [];
  for (const w of words) {
    const idx = WORD_INDEX.get(w);
    if (idx === undefined) {
      throw new Error(`unknown word in mnemonic: "${w}"`);
    }
    indices.push(idx);
  }
  // Reassemble 264-bit blob.
  const combined = new Uint8Array(ENTROPY_BYTES + 1);
  // Equivalent-mutation note: `i < indices.length` and `bit < 11` can be
  // mutated to `<=` without observable behavior change — the extra iteration
  // reads `indices[24]` (undefined → 0 via `>>> ... & 1`) or shifts by -1
  // (`idx >>> 31 & 1 = 0` for any idx < 2^11). Writing 0 bits to an
  // out-of-range Uint8Array slot is silently dropped. Stryker-disable both.
  // Stryker disable next-line EqualityOperator
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i]!;
    // Stryker disable next-line EqualityOperator
    for (let bit = 0; bit < 11; bit++) {
      const value = (idx >>> (10 - bit)) & 1;
      const totalBit = i * 11 + bit;
      const byteIdx = totalBit >>> 3;
      const off = 7 - (totalBit & 7);
      combined[byteIdx] = (combined[byteIdx]! | (value << off)) & 0xff;
    }
  }
  const entropy = combined.slice(0, ENTROPY_BYTES);
  const checksumByte = combined[ENTROPY_BYTES]!;
  // Verify checksum
  const hash = await sha256(entropy);
  if ((hash[0]! & 0xff) !== checksumByte) {
    throw new Error('mnemonic checksum invalid (likely a transcription error)');
  }
  return entropy;
}

/** Invisible / formatting Unicode characters that NFKD does NOT strip but
 *  which commonly sneak in via copy-paste from PDFs, IM apps, or
 *  bidirectional text. If left in place they produce confusing
 *  "unknown word" errors because BIP-39 lookup is byte-exact.
 *
 *  Covered ranges:
 *    U+200B – U+200F  zero-width space / joiner / non-joiner / LRM / RLM
 *    U+202A – U+202E  bidi embedding / override controls
 *    U+2060 – U+206F  word joiner / invisible operators / reserved formats
 *    U+FEFF           BOM / zero-width no-break space
 *
 *  Applied AFTER NFKD so that any compatibility decomposition producing
 *  these formatting characters is also caught in a single pass. */
const INVISIBLE_RE = /[​-‏‪-‮⁠-⁯﻿]/g;

/** Convenience: NFKD normalize → strip invisible/bidi formatting →
 *  lowercase → collapse whitespace.
 *
 *  NFKD folds compatibility characters (full-width "Ａ" → ASCII "a",
 *  full-width space → ASCII space), which is necessary because Japanese
 *  IMEs frequently produce full-width input when the user paste / type
 *  the mnemonic. Without NFKD, "Ａｂａｎｄｏｎ" would fail "unknown word"
 *  even though the user typed the same 7 letters. BIP-39 English
 *  wordlist is pure ASCII so NFKD is safe.
 *
 *  The invisible-character strip handles copy-paste hazards that NFKD
 *  itself does not address (zero-width space, BOM, bidi controls). */
export function normalizeMnemonic(s: string): string {
  return s
    .normalize('NFKD')
    .replace(INVISIBLE_RE, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Wordlist accessor for UI auto-complete / suggestion. */
export function getWordlist(): readonly string[] {
  return BIP39_ENGLISH;
}

/** Cheap pre-check before paying PBKDF2 cost. Returns true if every word
 *  is in the BIP-39 list AND the count is correct. Does NOT verify the
 *  checksum (use decodeMnemonic for that). */
export function looksLikeValidMnemonic(input: string): boolean {
  const words = normalizeMnemonic(input).split(' ');
  if (words.length !== WORD_COUNT) return false;
  return words.every((w) => WORD_INDEX.has(w));
}

/** Generate fresh 256-bit entropy via WebCrypto. */
export function generateEntropy(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(ENTROPY_BYTES));
}
