//! Mamori の M0 (禁じた綴り) を、TypeScript のコンパイラとは**独立に**検める第 2 の実装。
//!
//! 目的は検算である: 同じ `.mamori` の原文を 2 つの別々の実装で読み、
//! 「こちらは断る・TypeScript は通す」が出たら、どちらかに穴がある。
//! 読むのは**原文の綴りだけ** (文字列・注記・正規表現の中身は見ない)。来歴 (M1〜M5) は見ない。
//!
//! 規則の番号は返り値で、0 = 禁じた綴りは無い。
//!   1 `as`   2 `any`   3 `eval`   4 バッククォート (テンプレート)   5 `/* … */` の注記
//!   6 `.constructor` / `.prototype` / `.__proto__` ほか原型に届く道   7 `...` (展開)
//!
//! 依存 crate は 0・panic は abort・メモリは呼び出し側が `alloc` で確保して渡す。

#![no_std]

use core::panic::PanicInfo;

#[panic_handler]
fn panic(_: &PanicInfo) -> ! {
    loop {}
}

extern crate alloc as core_alloc;
use core_alloc::alloc::{alloc as raw_alloc, Layout};

/// 呼び出し側が原文を置くための領域を確保する (JS から `memory` へ書く)。
#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    if len == 0 {
        return core::ptr::null_mut();
    }
    unsafe { raw_alloc(Layout::from_size_align_unchecked(len, 1)) }
}

#[global_allocator]
static ALLOC: Bump = Bump;

/// 確保したら返さない単純な bump アロケータ (1 回の検算は短命)。
struct Bump;
static mut HEAP: [u8; 8 * 1024 * 1024] = [0; 8 * 1024 * 1024];
static mut NEXT: usize = 0;

unsafe impl core::alloc::GlobalAlloc for Bump {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let align = layout.align();
        let start = (NEXT + align - 1) & !(align - 1);
        let end = start + layout.size();
        if end > HEAP.len() {
            return core::ptr::null_mut();
        }
        NEXT = end;
        core::ptr::addr_of_mut!(HEAP).cast::<u8>().add(start)
    }
    unsafe fn dealloc(&self, _: *mut u8, _: Layout) {}
}

/// 次の検算のために bump を巻き戻す。
#[no_mangle]
pub extern "C" fn reset() {
    unsafe {
        NEXT = 0;
    }
}

const FORBIDDEN_AFTER_DOT: [&[u8]; 8] = [
    b"constructor",
    b"prototype",
    b"__proto__",
    b"__defineGetter__",
    b"__defineSetter__",
    b"__lookupGetter__",
    b"__lookupSetter__",
    b"__proto__",
];

fn is_ident_start(c: u8) -> bool {
    c == b'_' || c == b'$' || c.is_ascii_alphabetic() || c >= 0x80
}
fn is_ident_part(c: u8) -> bool {
    is_ident_start(c) || c.is_ascii_digit()
}

/// 直前の意味のある字で `/` が正規表現の始まりか割り算かを決める。
fn regex_allowed(prev: Option<u8>, prev_word: &[u8]) -> bool {
    match prev {
        None => true,
        Some(c) => {
            if is_ident_part(c) {
                // 識別子・数の後ろは割り算。ただし `return` などの語の後ろは正規表現。
                matches!(prev_word, b"return" | b"typeof" | b"case" | b"throw" | b"await")
            } else {
                !matches!(c, b')' | b']' | b'"' | b'\'')
            }
        }
    }
}

/// 原文を検める。禁じた綴りが無ければ 0、在れば最初の 1 つの規則の番号。
pub fn verify_bytes(s: &[u8]) -> u32 {
    let n = s.len();
    let mut i = 0usize;
    let mut prev: Option<u8> = None;
    let mut prev_word: &[u8] = b"";
    let mut after_dot = false;
    while i < n {
        let c = s[i];
        // 行注記
        if c == b'/' && i + 1 < n && s[i + 1] == b'/' {
            while i < n && s[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        // ブロック注記は禁止
        if c == b'/' && i + 1 < n && s[i + 1] == b'*' {
            return 5;
        }
        // 文字列 ('…' と "…")
        if c == b'"' || c == b'\'' {
            let q = c;
            i += 1;
            while i < n && s[i] != q && s[i] != b'\n' {
                if s[i] == b'\\' {
                    i += 1;
                }
                i += 1;
            }
            i += 1;
            prev = Some(q);
            prev_word = b"";
            after_dot = false;
            continue;
        }
        if c == b'`' {
            return 4;
        }
        // 正規表現リテラル
        if c == b'/' && regex_allowed(prev, prev_word) {
            i += 1;
            let mut in_class = false;
            while i < n && s[i] != b'\n' {
                if s[i] == b'\\' {
                    i += 2;
                    continue;
                }
                if s[i] == b'[' {
                    in_class = true;
                } else if s[i] == b']' {
                    in_class = false;
                } else if s[i] == b'/' && !in_class {
                    break;
                }
                i += 1;
            }
            i += 1;
            while i < n && is_ident_part(s[i]) {
                i += 1;
            }
            prev = Some(b'"');
            prev_word = b"";
            after_dot = false;
            continue;
        }
        // 展開
        if c == b'.' && i + 2 < n && s[i + 1] == b'.' && s[i + 2] == b'.' {
            return 7;
        }
        if is_ident_start(c) {
            let start = i;
            while i < n && is_ident_part(s[i]) {
                i += 1;
            }
            let word = &s[start..i];
            if after_dot {
                for f in FORBIDDEN_AFTER_DOT {
                    if word == f {
                        return 6;
                    }
                }
            } else {
                if word == b"as" {
                    return 1;
                }
                if word == b"any" {
                    return 2;
                }
                if word == b"eval" {
                    return 3;
                }
            }
            prev = Some(s[i - 1]);
            prev_word = word;
            after_dot = false;
            continue;
        }
        if c == b'.' {
            after_dot = true;
            prev = Some(b'.');
            prev_word = b"";
            i += 1;
            continue;
        }
        if c == b'?' && i + 1 < n && s[i + 1] == b'.' && !(i + 2 < n && s[i + 2].is_ascii_digit()) {
            // `?.` も `.` と同じ (後ろの名前を見る)
            after_dot = true;
            prev = Some(b'.');
            prev_word = b"";
            i += 2;
            continue;
        }
        if !c.is_ascii_whitespace() {
            prev = Some(c);
            prev_word = b"";
            after_dot = false;
        }
        i += 1;
    }
    0
}

/// JS から呼ぶ口。`ptr` から `len` byte を UTF-8 の原文として検める。
#[no_mangle]
pub extern "C" fn verify(ptr: *const u8, len: usize) -> u32 {
    let s = unsafe { core::slice::from_raw_parts(ptr, len) };
    verify_bytes(s)
}
