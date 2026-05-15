/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';
if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

import {
  decodeMnemonic,
  encodeMnemonic,
  generateEntropy,
  getWordlist,
  looksLikeValidMnemonic,
  normalizeMnemonic,
} from '../mnemonic';
import { BIP39_ENGLISH } from '../bip39-wordlist';

describe('BIP39 wordlist', () => {
  it('contains exactly 2048 words', () => {
    expect(BIP39_ENGLISH).toHaveLength(2048);
  });

  it('first word is "abandon" and last is "zoo" (official BIP-39 ordering)', () => {
    expect(BIP39_ENGLISH[0]).toBe('abandon');
    expect(BIP39_ENGLISH[2047]).toBe('zoo');
  });

  it('all words are lowercase ASCII and unique', () => {
    const set = new Set<string>();
    for (const w of BIP39_ENGLISH) {
      expect(w).toMatch(/^[a-z]+$/);
      expect(set.has(w)).toBe(false);
      set.add(w);
    }
  });

  it('getWordlist() returns the same 2048 words', () => {
    expect(getWordlist()).toBe(BIP39_ENGLISH);
  });
});

describe('encodeMnemonic / decodeMnemonic — round-trip', () => {
  it('all-zero entropy → known reference mnemonic ending with "wrong"', async () => {
    // Per BIP-39 test vectors:
    // 0x0000...0000 (32 bytes) →
    //   abandon abandon ... abandon art (12-word version) for 16-byte entropy
    // 32-byte (24-word) version is officially:
    //   abandon abandon abandon abandon abandon abandon abandon abandon abandon
    //   abandon abandon abandon abandon abandon abandon abandon abandon abandon
    //   abandon abandon abandon abandon abandon art
    const entropy = new Uint8Array(32); // all zeros
    const mnemonic = await encodeMnemonic(entropy);
    const words = mnemonic.split(' ');
    expect(words).toHaveLength(24);
    expect(words[0]).toBe('abandon');
    expect(words[22]).toBe('abandon');
    // The last word encodes the SHA-256 checksum of zeros (top 8 bits = 0x66).
    // Reference vector last word for 24-word zero-entropy: "art".
    expect(words[23]).toBe('art');
  });

  it('all-FF entropy → known reference mnemonic', async () => {
    const entropy = new Uint8Array(32).fill(0xff);
    const mnemonic = await encodeMnemonic(entropy);
    const words = mnemonic.split(' ');
    expect(words).toHaveLength(24);
    expect(words[0]).toBe('zoo');
    expect(words[22]).toBe('zoo');
    // SHA-256(0xff..ff)[0] top 8 bits → known last word "vote".
    expect(words[23]).toBe('vote');
  });

  // Official Trezor BIP-39 vectors (24-word / 32-byte entropy entries only):
  // https://github.com/trezor/python-mnemonic/blob/master/vectors.json
  //
  // Each vector was independently verified against a stand-alone SHA-256 +
  // wordlist projection (no project code reused) before being hardcoded —
  // see /tmp/verify-vectors.mjs in the PR description. Hardcoding is
  // intentional: these vectors serve as a TRIPWIRE that catches any
  // accidental drift in encodeMnemonic / the wordlist / the checksum byte
  // selection. A round-trip-only test would happily pass even if the
  // algorithm were silently wrong.
  it.each([
    {
      label: '0x7f * 32',
      entropy: '7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f',
      expected:
        'legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth title',
    },
    {
      label: '0x80 * 32',
      entropy: '8080808080808080808080808080808080808080808080808080808080808080',
      expected:
        'letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic bless',
    },
    {
      label: 'Trezor sample (68a7…ce7c)',
      entropy: '68a79eaca2324873eacc50cb9c6eca8cc68ea5d936f98787c60c7ebc74e6ce7c',
      expected:
        'hamster diagram private dutch cause delay private meat slide toddler razor book happy fancy gospel tennis maple dilemma loan word shrug inflict delay length',
    },
  ])('Trezor vector $label → known mnemonic + clean round-trip', async ({ entropy, expected }) => {
    const bytes = new Uint8Array(entropy.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(entropy.slice(i * 2, i * 2 + 2), 16);
    }
    const got = await encodeMnemonic(bytes);
    expect(got).toBe(expected);
    // Round-trip back to the same 32 bytes.
    const back = await decodeMnemonic(got);
    expect(Array.from(back)).toEqual(Array.from(bytes));
  });

  it('round-trips random entropy through encode → decode', async () => {
    for (let i = 0; i < 5; i++) {
      const entropy = generateEntropy();
      const mnemonic = await encodeMnemonic(entropy);
      const decoded = await decodeMnemonic(mnemonic);
      expect(decoded).toEqual(entropy);
    }
  });

  it('rejects entropy of wrong length', async () => {
    await expect(encodeMnemonic(new Uint8Array(16))).rejects.toThrow(/32 bytes/);
    await expect(encodeMnemonic(new Uint8Array(31))).rejects.toThrow(/32 bytes/);
    await expect(encodeMnemonic(new Uint8Array(33))).rejects.toThrow(/32 bytes/);
  });

  it('decodeMnemonic rejects mnemonics with wrong word count', async () => {
    await expect(decodeMnemonic('abandon')).rejects.toThrow(/24 words/);
    await expect(decodeMnemonic('abandon '.repeat(23).trim())).rejects.toThrow(/24 words/);
    await expect(decodeMnemonic('abandon '.repeat(25).trim())).rejects.toThrow(/24 words/);
  });

  it('decodeMnemonic rejects unknown words', async () => {
    const valid = await encodeMnemonic(new Uint8Array(32));
    const words = valid.split(' ');
    words[5] = 'notarealword';
    await expect(decodeMnemonic(words.join(' '))).rejects.toThrow(/unknown word/);
  });

  it('decodeMnemonic rejects checksum mismatch (typo in last word)', async () => {
    const valid = await encodeMnemonic(new Uint8Array(32));
    const words = valid.split(' ');
    // Flip the LAST word — checksum is embedded in the last 8 bits.
    // Change last word from "art" to any other valid word.
    words[23] = 'abandon';
    await expect(decodeMnemonic(words.join(' '))).rejects.toThrow(/checksum invalid/);
  });

  it('decodeMnemonic rejects checksum mismatch (typo in middle word)', async () => {
    const valid = await encodeMnemonic(new Uint8Array(32));
    const words = valid.split(' ');
    // Swap a middle word to a different valid word.
    words[10] = words[10] === 'ability' ? 'zoo' : 'ability';
    await expect(decodeMnemonic(words.join(' '))).rejects.toThrow(/checksum invalid/);
  });
});

describe('normalizeMnemonic', () => {
  it('lowercases + collapses whitespace', () => {
    expect(normalizeMnemonic('  Abandon  ABANDON \t art ')).toBe('abandon abandon art');
  });

  it('does not modify already-normalized input', () => {
    expect(normalizeMnemonic('a b c')).toBe('a b c');
  });

  it('NFKD-folds full-width characters (Japanese IME safety)', () => {
    // Full-width "Ａ" (U+FF21) → ASCII "a"; full-width space (U+3000) → ASCII space.
    // Without NFKD a user pasting from an IME-enabled field would get
    // "unknown word" errors.
    expect(normalizeMnemonic('ＡＢＡＮＤＯＮ　abandon')).toBe('abandon abandon');
    expect(normalizeMnemonic('ａｂａｎｄｏｎ')).toBe('abandon');
  });
});

describe('looksLikeValidMnemonic (cheap pre-check)', () => {
  it('returns true for a fresh-generated mnemonic', async () => {
    const m = await encodeMnemonic(new Uint8Array(32));
    expect(looksLikeValidMnemonic(m)).toBe(true);
  });

  it('returns false for wrong word count', () => {
    expect(looksLikeValidMnemonic('abandon')).toBe(false);
    expect(looksLikeValidMnemonic('abandon '.repeat(23).trim())).toBe(false);
  });

  it('returns false for unknown words', () => {
    const bad = 'notarealword ' + 'abandon '.repeat(23).trim();
    expect(looksLikeValidMnemonic(bad)).toBe(false);
  });

  it('handles mixed case + whitespace via normalize', async () => {
    const m = await encodeMnemonic(new Uint8Array(32));
    const messy = '  ' + m.toUpperCase().replace(/ /g, '\t') + '  ';
    expect(looksLikeValidMnemonic(messy)).toBe(true);
  });
});

describe('generateEntropy', () => {
  it('produces 32 bytes', () => {
    expect(generateEntropy()).toHaveLength(32);
  });

  it('produces different bytes on each call (cryptographically random)', () => {
    const a = generateEntropy();
    const b = generateEntropy();
    expect(a).not.toEqual(b);
  });
});
