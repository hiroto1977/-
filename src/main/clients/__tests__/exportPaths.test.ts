import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { exportRoot, isSafeExportPath } from '../exportPaths';

// 2026-07 security audit: every renderer-supplied export path must land inside
// ~/.local/business-hub. Before this module the four per-service copies of the
// guard accepted anything under $HOME, giving a compromised renderer an
// arbitrary-write primitive across the home tree (and a file to plant for
// app:openPath to launch).
// Fixtures are written POSIX-style; `path.resolve` maps them onto the host's
// root (a drive letter on Windows), so the same assertions hold on every OS
// the release build runs on.
const abs = (p: string): string => path.resolve(p);
const HOME = abs('/home/user');
const ROOT = path.join(HOME, '.local', 'business-hub');
const inRoot = (rel: string): string => path.join(ROOT, rel);

describe('exportRoot', () => {
  it('is ~/.local/business-hub for the given home', () => {
    expect(exportRoot(HOME)).toBe(ROOT);
  });

  it('resolves a non-normalized home', () => {
    expect(exportRoot('/home/user/../user')).toBe(ROOT);
  });
});

describe('isSafeExportPath', () => {
  it('accepts files inside the export root at any depth', () => {
    expect(isSafeExportPath(inRoot('data/dashboard.html'), HOME, '.html')).toBe(true);
    expect(isSafeExportPath(inRoot('data/templates/card.svg'), HOME, '.svg')).toBe(true);
    expect(isSafeExportPath(inRoot('a/b/c/deep.md'), HOME, '.md')).toBe(true);
  });

  it('rejects paths elsewhere under $HOME (the capability this closes)', () => {
    expect(isSafeExportPath(abs('/home/user/x.html'), HOME, '.html')).toBe(false);
    expect(isSafeExportPath(abs('/home/user/.config/autostart/evil.html'), HOME, '.html')).toBe(false);
    expect(isSafeExportPath(abs('/home/user/.local/other/x.html'), HOME, '.html')).toBe(false);
    expect(isSafeExportPath(abs('/home/user/Documents/notes.md'), HOME, '.md')).toBe(false);
  });

  it('rejects paths outside $HOME, including traversal out of the root', () => {
    expect(isSafeExportPath(abs('/etc/passwd.html'), HOME, '.html')).toBe(false);
    expect(isSafeExportPath(inRoot('../../../etc/x.html'), HOME, '.html')).toBe(false);
    expect(isSafeExportPath(abs('/home/other/.local/business-hub/x.html'), HOME, '.html')).toBe(false);
  });

  it('rejects the export root itself (it is a directory, never a target)', () => {
    expect(isSafeExportPath(ROOT, HOME, '')).toBe(false);
  });

  it('requires the exact extension', () => {
    expect(isSafeExportPath(inRoot('x.html'), HOME, '.md')).toBe(false);
    expect(isSafeExportPath(inRoot('x.svg'), HOME, '.html')).toBe(false);
    expect(isSafeExportPath(inRoot('x.html.exe'), HOME, '.html')).toBe(false);
  });

  it('rejects control characters, empties, non-strings and oversize paths', () => {
    expect(isSafeExportPath(inRoot('a\0b.html'), HOME, '.html')).toBe(false);
    expect(isSafeExportPath(inRoot('a\nb.html'), HOME, '.html')).toBe(false);
    expect(isSafeExportPath(inRoot('a\rb.html'), HOME, '.html')).toBe(false);
    expect(isSafeExportPath('', HOME, '.html')).toBe(false);
    expect(isSafeExportPath(undefined as unknown as string, HOME, '.html')).toBe(false);
    expect(isSafeExportPath(inRoot('a'.repeat(1100) + '.html'), HOME, '.html')).toBe(false);
  });

  it('is not fooled by a sibling directory sharing the root prefix', () => {
    // `/home/user/.local/business-hub-evil/x.html` starts with the root string
    // but is a different directory — the separator check must catch it.
    expect(isSafeExportPath(abs('/home/user/.local/business-hub-evil/x.html'), HOME, '.html')).toBe(false);
  });
});
