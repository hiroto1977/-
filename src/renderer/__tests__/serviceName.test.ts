/**
 * 画面の名前に添える英語の組み立て (2026-11-20 · 「全て日本語と英語を併記して」)。
 */
import { describe, expect, it } from 'vitest';
import { englishInParens, nameWithEnglish } from '../serviceName';
import { SERVICES } from '../services';

describe('englishInParens / nameWithEnglish', () => {
  it('英語をかっこで添える', () => {
    expect(englishInParens('ギットハブ', 'GitHub')).toBe('(GitHub)');
    expect(nameWithEnglish('ギットハブ', 'GitHub')).toBe('ギットハブ (GitHub)');
  });
  it('前後の空白は落とす', () => {
    expect(englishInParens('ギットハブ', '  GitHub  ')).toBe('(GitHub)');
    expect(nameWithEnglish('ギットハブ', '  GitHub  ')).toBe('ギットハブ (GitHub)');
  });
  it('英語が空なら、名前だけ (空のかっこを出さない)', () => {
    expect(englishInParens('ホーム', '')).toBe('');
    expect(englishInParens('ホーム', '   ')).toBe('');
    expect(nameWithEnglish('ホーム', '')).toBe('ホーム');
  });
  it('英語が名前と同じ綴りなら、名前だけ (同じ語を 2 度出さない)', () => {
    expect(englishInParens('LINE', 'LINE')).toBe('');
    expect(englishInParens(' LINE ', 'LINE')).toBe('');
    expect(nameWithEnglish('LINE', 'LINE')).toBe('LINE');
  });
  it('★ 実物: どの画面も「日本語 (英語)」になる (英語が名前と同じ画面は無い)', () => {
    const plain = SERVICES.filter((s) => nameWithEnglish(s.label, s.english) === s.label).map((s) => s.id);
    expect(plain).toEqual([]);
    expect(nameWithEnglish(SERVICES[0]!.label, SERVICES[0]!.english)).toBe('ホーム (Home)');
  });
});
