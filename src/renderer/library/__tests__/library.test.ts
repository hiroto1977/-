/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { getLibrary, _resetLibraryForTests } from '../library';

function clearIdb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-library');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  _resetLibraryForTests();
  await clearIdb();
});

describe('Library — put + get + list', () => {
  it('returns empty list initially', async () => {
    const lib = getLibrary();
    expect(await lib.list()).toHaveLength(0);
    expect(await lib.totalBytes()).toBe(0);
  });

  it('put + get round-trips a Blob (metadata fidelity)', async () => {
    const lib = getLibrary();
    const blob = new Blob(['<svg/>'], { type: 'image/svg+xml' });
    const meta = await lib.put('templates', 'a.svg', 'image/svg+xml', blob);
    expect(meta.filename).toBe('a.svg');
    expect(meta.serviceId).toBe('templates');
    expect(meta.size).toBe(6);
    expect(meta.mime).toBe('image/svg+xml');
    const full = await lib.get(meta.id);
    expect(full).not.toBeNull();
    expect(full!.filename).toBe('a.svg');
    expect(full!.size).toBe(6);
  });

  it('list() sorts newest-first', async () => {
    const lib = getLibrary();
    await lib.put('templates', 'first.svg', 'image/svg+xml', new Blob(['1']));
    await new Promise((r) => setTimeout(r, 5));
    await lib.put('templates', 'second.svg', 'image/svg+xml', new Blob(['2']));
    const list = await lib.list();
    expect(list[0]!.filename).toBe('second.svg');
    expect(list[1]!.filename).toBe('first.svg');
  });

  it('get() returns null for unknown id', async () => {
    expect(await getLibrary().get('does-not-exist')).toBeNull();
  });

  it('get() returns null for empty / non-string id', async () => {
    expect(await getLibrary().get('')).toBeNull();
    expect(await getLibrary().get(42 as unknown as string)).toBeNull();
  });
});

describe('Library — validation', () => {
  const lib = () => getLibrary();
  const blob = new Blob(['x'], { type: 'text/plain' });

  it('rejects invalid serviceId', async () => {
    await expect(lib().put('Bad', 'a.svg', 'image/svg+xml', blob)).rejects.toThrow(/serviceId/);
    await expect(lib().put('', 'a.svg', 'image/svg+xml', blob)).rejects.toThrow(/serviceId/);
    await expect(lib().put('x'.repeat(65), 'a.svg', 'image/svg+xml', blob)).rejects.toThrow(/serviceId/);
  });

  it('rejects invalid filename', async () => {
    await expect(lib().put('templates', '', 'mime', blob)).rejects.toThrow(/filename/);
    await expect(lib().put('templates', 'a/b.svg', 'mime', blob)).rejects.toThrow(/filename/);
    await expect(lib().put('templates', 'a\0b', 'mime', blob)).rejects.toThrow(/filename/);
    await expect(lib().put('templates', 'x'.repeat(257), 'mime', blob)).rejects.toThrow(/filename/);
  });

  it('rejects invalid mime', async () => {
    await expect(lib().put('templates', 'a.svg', '', blob)).rejects.toThrow(/mime/);
    await expect(lib().put('templates', 'a.svg', 'x'.repeat(129), blob)).rejects.toThrow(/mime/);
    await expect(lib().put('templates', 'a.svg', 'mime\nname', blob)).rejects.toThrow(/mime/);
  });

  it('rejects non-Blob value', async () => {
    await expect(lib().put('templates', 'a.svg', 'mime', 'not-a-blob' as unknown as Blob)).rejects.toThrow(/blob/);
  });

  it('rejects empty blob', async () => {
    await expect(lib().put('templates', 'a.svg', 'mime', new Blob([]))).rejects.toThrow(/空の/);
  });

  it('rejects blob > 50 MB', async () => {
    const big = new Blob([new Uint8Array(50 * 1024 * 1024 + 1)]);
    await expect(lib().put('templates', 'a.svg', 'mime', big)).rejects.toThrow(/大きすぎ/);
  });
});

describe('Library — remove / clear', () => {
  it('remove() deletes a single entry', async () => {
    const lib = getLibrary();
    const m = await lib.put('templates', 'a.svg', 'image/svg+xml', new Blob(['x']));
    await lib.remove(m.id);
    expect(await lib.get(m.id)).toBeNull();
    expect(await lib.list()).toHaveLength(0);
  });

  it('remove() is a no-op for empty / non-string id', async () => {
    const lib = getLibrary();
    await lib.put('templates', 'a.svg', 'image/svg+xml', new Blob(['x']));
    await lib.remove('');
    await lib.remove(42 as unknown as string);
    expect(await lib.list()).toHaveLength(1);
  });

  it('clear() removes everything', async () => {
    const lib = getLibrary();
    await lib.put('templates', 'a.svg', 'image/svg+xml', new Blob(['x']));
    await lib.put('templates', 'b.svg', 'image/svg+xml', new Blob(['y']));
    await lib.clear();
    expect(await lib.list()).toHaveLength(0);
  });
});

describe('Library — auto-eviction (100 items / 50 MB)', () => {
  it('evicts oldest when count exceeds 100', async () => {
    const lib = getLibrary();
    // Guarantee a clean slate independent of fake-indexeddb deleteDatabase
    // timing semantics — the in-test `clear()` is fully transactional.
    await lib.clear();
    expect(await lib.list()).toHaveLength(0);
    // Insert 101 small items
    for (let i = 0; i < 101; i++) {
      await lib.put('templates', `t-${i}.svg`, 'image/svg+xml', new Blob([String(i)]));
    }
    const list = await lib.list();
    expect(list.length).toBeLessThanOrEqual(100);
    // The very oldest (t-0) should have been evicted; the newest should remain.
    expect(list.some((it) => it.filename === 't-100.svg')).toBe(true);
    expect(list.some((it) => it.filename === 't-0.svg')).toBe(false);
  });
});

describe('Library — singleton', () => {
  it('getLibrary() returns the same instance', () => {
    const a = getLibrary();
    const b = getLibrary();
    expect(a).toBe(b);
  });
});
