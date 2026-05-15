/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  ensurePermission,
  isFsaSupported,
  pickFolder,
  writeBlobToFolder,
} from '../fsa';

interface MockWritable {
  write: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

interface MockFileHandle {
  createWritable: () => Promise<MockWritable>;
}

interface MockDirHandle {
  getFileHandle: ReturnType<typeof vi.fn>;
  queryPermission?: ReturnType<typeof vi.fn>;
  requestPermission?: ReturnType<typeof vi.fn>;
}

function makeMockHandle(opts: { initialPermission?: 'granted' | 'prompt' | 'denied' } = {}): MockDirHandle {
  const writable: MockWritable = {
    write: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const fileHandle: MockFileHandle = {
    createWritable: vi.fn().mockResolvedValue(writable),
  };
  const initial = opts.initialPermission ?? 'granted';
  return {
    getFileHandle: vi.fn().mockResolvedValue(fileHandle),
    queryPermission: vi.fn().mockResolvedValue(initial),
    requestPermission: vi.fn().mockResolvedValue('granted'),
  };
}

beforeEach(() => {
  delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
});

describe('isFsaSupported', () => {
  it('returns false when window.showDirectoryPicker is missing', () => {
    expect(isFsaSupported()).toBe(false);
  });

  it('returns true when window.showDirectoryPicker is a function', () => {
    (window as unknown as Record<string, unknown>).showDirectoryPicker = vi.fn();
    expect(isFsaSupported()).toBe(true);
  });
});

describe('pickFolder — feature detection + cancel paths', () => {
  it('returns null on non-supporting browsers', async () => {
    expect(await pickFolder()).toBeNull();
  });

  it('returns null if user cancels the picker', async () => {
    (window as unknown as Record<string, unknown>).showDirectoryPicker = vi
      .fn()
      .mockRejectedValue(new DOMException('aborted', 'AbortError'));
    expect(await pickFolder()).toBeNull();
  });
  // NOTE: The IDB-persistence happy path is covered end-to-end via the
  // standalone HTML smoke test in the build pipeline. fake-indexeddb in
  // node cannot structured-clone the vitest-mocked DirectoryHandle (it
  // contains non-cloneable function refs), so we keep happy-path coverage
  // out of unit tests.
});

describe('ensurePermission', () => {
  it('returns granted immediately when already granted', async () => {
    const handle = makeMockHandle({ initialPermission: 'granted' });
    const result = await ensurePermission(handle as unknown as FileSystemDirectoryHandle);
    expect(result).toBe('granted');
    expect(handle.requestPermission).not.toHaveBeenCalled();
  });

  it('requests permission when status is prompt', async () => {
    const handle = makeMockHandle({ initialPermission: 'prompt' });
    const result = await ensurePermission(handle as unknown as FileSystemDirectoryHandle);
    expect(result).toBe('granted');
    expect(handle.requestPermission).toHaveBeenCalled();
  });

  it('returns denied when requestPermission yields denied', async () => {
    const handle = makeMockHandle({ initialPermission: 'prompt' });
    handle.requestPermission = vi.fn().mockResolvedValue('denied');
    const result = await ensurePermission(handle as unknown as FileSystemDirectoryHandle);
    expect(result).toBe('denied');
  });

  it('returns denied when no permission APIs exist (very old browsers)', async () => {
    const handle: MockDirHandle = { getFileHandle: vi.fn() };
    const result = await ensurePermission(handle as unknown as FileSystemDirectoryHandle);
    expect(result).toBe('denied');
  });

  it('returns denied when only queryPermission exists (prompt) but no requestPermission', async () => {
    const handle: MockDirHandle = {
      getFileHandle: vi.fn(),
      queryPermission: vi.fn().mockResolvedValue('prompt'),
    };
    const result = await ensurePermission(handle as unknown as FileSystemDirectoryHandle);
    expect(result).toBe('denied');
  });
});

describe('writeBlobToFolder', () => {
  it('writes the blob via createWritable + close', async () => {
    const handle = makeMockHandle();
    await writeBlobToFolder(
      handle as unknown as FileSystemDirectoryHandle,
      'output.svg',
      new Blob(['<svg/>'], { type: 'image/svg+xml' }),
    );
    expect(handle.getFileHandle).toHaveBeenCalledWith('output.svg', { create: true });
  });

  it('rejects empty filename', async () => {
    const handle = makeMockHandle();
    await expect(
      writeBlobToFolder(handle as unknown as FileSystemDirectoryHandle, '', new Blob(['x'])),
    ).rejects.toThrow(/filename/);
  });

  it('rejects filename with forward slash', async () => {
    const handle = makeMockHandle();
    await expect(
      writeBlobToFolder(handle as unknown as FileSystemDirectoryHandle, 'a/b.svg', new Blob(['x'])),
    ).rejects.toThrow(/filename/);
  });

  it('rejects filename with backslash', async () => {
    const handle = makeMockHandle();
    await expect(
      writeBlobToFolder(handle as unknown as FileSystemDirectoryHandle, 'a\\b.svg', new Blob(['x'])),
    ).rejects.toThrow(/filename/);
  });

  it('rejects filename with null byte', async () => {
    const handle = makeMockHandle();
    await expect(
      writeBlobToFolder(handle as unknown as FileSystemDirectoryHandle, 'a\0b', new Blob(['x'])),
    ).rejects.toThrow(/filename/);
  });

  it('rejects oversize filename (> 256 chars)', async () => {
    const handle = makeMockHandle();
    await expect(
      writeBlobToFolder(handle as unknown as FileSystemDirectoryHandle, 'x'.repeat(257), new Blob(['x'])),
    ).rejects.toThrow(/filename/);
  });

  it('rejects when permission is denied', async () => {
    const handle = makeMockHandle({ initialPermission: 'denied' });
    handle.requestPermission = vi.fn().mockResolvedValue('denied');
    await expect(
      writeBlobToFolder(handle as unknown as FileSystemDirectoryHandle, 'x.svg', new Blob(['x'])),
    ).rejects.toThrow(/権限/);
  });
});
