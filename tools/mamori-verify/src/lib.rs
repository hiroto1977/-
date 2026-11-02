//! Mamori の M0 (禁じた綴り) を、TypeScript のコンパイラとは**独立に**検める第 2 の実装。
//!
//! 目的は検算である: 同じ `.mamori` の原文を 2 つの別々の実装で読み、
//! 「こちらは断る・TypeScript は通す」が出たら、どちらかに穴がある。
//! 読むのは**原文の綴りだけ**。来歴 (M1〜M5) は見ない。
//!
//! 返り値 (0 = 禁じた綴りは無い・**0 以外はすべて「断る」**。呼び手は `!== 0` で拒むこと):
//!   1 `as`   2 `any`   3 `eval`   4 バッククォート (テンプレート)   5 `/* … */` の注記
//!   6 `.constructor` / `.prototype` / `.__proto__` ほか原型に届く道 (字面の添字 `["constructor"]` も)
//!   7 `...` (展開)   8 制御・不可視・方向を変える字が裸で在る (Trojan Source)
//!   9 知らない字 (コードの位置の非 ASCII・制御文字・記号)   10 `__proto__` の鍵   11 閉じていない文字列・正規表現
//!   0xFFFF_FFFF 入力が置き場より大きく、検められなかった
//!
//! ABI (0.2 · 解析エージェントの報告 D1/D2/D3 を受けて作り直した):
//!   アロケータを持たない。置き場は静的な固定長 `INPUT` ただ 1 つで、ホストは `input_ptr()` から UTF-8 で書き、
//!   **書いた byte 数**を `verify(len)` に渡す。ptr は渡さない (範囲外を指せない)。
//!   以前の `alloc` は 8 MiB を超えると null (= アドレス 0 = 有効なメモリ) を返し、整数も折り返した。
//!
//! 依存 crate は 0・panic は trap (無限ループにしない)。

#![no_std]

/// 入力の置き場所の大きさ。
pub const INPUT_CAP: usize = 8 * 1024 * 1024;
static mut INPUT: [u8; INPUT_CAP] = [0; INPUT_CAP];

/// 検められなかった (長すぎる)。
pub const ERR_TOO_LARGE: u32 = 0xFFFF_FFFF;

#[cfg(not(test))]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    // 無限ループではなく trap (JS には RuntimeError で届く)。
    core::arch::wasm32::unreachable()
}

#[no_mangle]
pub extern "C" fn input_ptr() -> *mut u8 {
    core::ptr::addr_of_mut!(INPUT).cast::<u8>()
}

#[no_mangle]
pub extern "C" fn input_cap() -> u32 {
    INPUT_CAP as u32
}

const FORBIDDEN_AFTER_DOT: [&[u8]; 7] = [
    b"constructor",
    b"prototype",
    b"__proto__",
    b"__defineGetter__",
    b"__defineSetter__",
    b"__lookupGetter__",
    b"__lookupSetter__",
];

fn is_ident_start(c: u8) -> bool {
    c == b'_' || c == b'$' || c.is_ascii_alphabetic()
}

fn is_ident_part(c: u8) -> bool {
    is_ident_start(c) || c.is_ascii_digit()
}

fn forbidden_member(word: &[u8]) -> bool {
    FORBIDDEN_AFTER_DOT.iter().any(|f| *f == word)
}

/// 行を終える字 (LF / CR / U+2028 / U+2029) の長さ。無ければ 0。
fn line_terminator(s: &[u8], i: usize) -> usize {
    match s[i] {
        b'\n' | b'\r' => 1,
        0xE2 if i + 2 < s.len() && s[i + 1] == 0x80 && (s[i + 2] == 0xA8 || s[i + 2] == 0xA9) => 3,
        _ => 0,
    }
}

/// 裸で置けない字 (制御・不可視・方向を変える字) か。TS の HIDDEN_CHARS と同じ集合。
fn hidden_at(s: &[u8], i: usize) -> bool {
    let c = s[i];
    if c <= 0x08 || (0x0B..=0x1F).contains(&c) || c == 0x7F {
        return true;
    }
    let get = |k: usize| if i + k < s.len() { s[i + k] } else { 0 };
    match c {
        // C1 (U+0080〜U+009F)
        0xC2 => (0x80..=0x9F).contains(&get(1)),
        0xE2 => {
            let (b1, b2) = (get(1), get(2));
            if b1 == 0x80 {
                // U+200B / U+200E / U+200F / U+2028 / U+2029 / U+202A〜U+202E
                matches!(b2, 0x8B | 0x8E | 0x8F | 0xA8 | 0xA9) || (0xAA..=0xAE).contains(&b2)
            } else if b1 == 0x81 {
                // U+2060〜U+2064 / U+2066〜U+2069
                (0xA0..=0xA4).contains(&b2) || (0xA6..=0xA9).contains(&b2)
            } else {
                false
            }
        }
        // U+FEFF
        0xEF => get(1) == 0xBB && get(2) == 0xBF,
        _ => false,
    }
}

/// `s[a..b]` に裸の隠し字が在るか (行の終端は呼び手が先に判じる)。
fn any_hidden(s: &[u8], a: usize, b: usize) -> bool {
    let mut k = a;
    while k < b {
        if hidden_at(s, k) {
            return true;
        }
        k += 1;
    }
    false
}

fn hex_val(c: u8) -> Option<u32> {
    match c {
        b'0'..=b'9' => Some((c - b'0') as u32),
        b'a'..=b'f' => Some((c - b'a' + 10) as u32),
        b'A'..=b'F' => Some((c - b'A' + 10) as u32),
        _ => None,
    }
}

/// 文字列の中身 `s[a..b]` を JS の規則で戻し、`out` へ置く。長さを返す。16 byte を超える・
/// ASCII でない字を含むときは、どの禁じた名前にもなりえないので 0xFF を詰めて返す。
fn decode_string(s: &[u8], a: usize, b: usize, out: &mut [u8; 24]) -> usize {
    let mut n = 0usize;
    let mut k = a;
    while k < b {
        let c = s[k];
        let mut ch: u32 = c as u32;
        if c == b'\\' && k + 1 < b {
            k += 1;
            let e = s[k];
            match e {
                b'n' => ch = 10,
                b't' => ch = 9,
                b'r' => ch = 13,
                b'b' => ch = 8,
                b'f' => ch = 12,
                b'v' => ch = 11,
                b'0' => ch = 0,
                b'x' => {
                    let h = if k + 2 < b { (hex_val(s[k + 1]), hex_val(s[k + 2])) } else { (None, None) };
                    if let (Some(x), Some(y)) = h {
                        ch = x * 16 + y;
                        k += 2;
                    } else {
                        ch = e as u32;
                    }
                }
                b'u' => {
                    if k + 1 < b && s[k + 1] == b'{' {
                        let mut v: u32 = 0;
                        let mut j = k + 2;
                        let mut ok = false;
                        while j < b && s[j] != b'}' {
                            match hex_val(s[j]) {
                                Some(x) if v < 0x11_0000 => {
                                    v = v * 16 + x;
                                    ok = true;
                                }
                                _ => {
                                    ok = false;
                                    break;
                                }
                            }
                            j += 1;
                        }
                        if ok && j < b {
                            ch = v;
                            k = j;
                        } else {
                            ch = e as u32;
                        }
                    } else if k + 4 < b {
                        let h = [hex_val(s[k + 1]), hex_val(s[k + 2]), hex_val(s[k + 3]), hex_val(s[k + 4])];
                        if let [Some(a1), Some(b1), Some(c1), Some(d1)] = h {
                            ch = ((a1 * 16 + b1) * 16 + c1) * 16 + d1;
                            k += 4;
                        } else {
                            ch = e as u32;
                        }
                    } else {
                        ch = e as u32;
                    }
                }
                _ => ch = e as u32,
            }
        } else if c >= 0x80 {
            ch = 0xFF;
        }
        if n >= out.len() {
            return out.len() + 1;
        }
        out[n] = if ch < 0x80 { ch as u8 } else { 0xFF };
        n += 1;
        k += 1;
    }
    n
}

/// 次の空白でない字の位置 (行注記は飛ばさない —— 字面の添字・鍵の直後にだけ使う)。
fn skip_ws(s: &[u8], mut i: usize) -> usize {
    while i < s.len() && matches!(s[i], b' ' | b'\t' | b'\r' | b'\n') {
        i += 1;
    }
    i
}

/// 原文を検める。禁じた綴りが無ければ 0、在れば最初の 1 つの規則の番号。
pub fn verify_bytes(s: &[u8]) -> u32 {
    let n = s.len();
    let mut i = 0usize;
    // 直前の意味のある字句について: `/` が正規表現の始まりか (TS の regexAllowedAfter と同じ)。
    let mut allow_regex = true;
    let mut after_dot = false;
    while i < n {
        let c = s[i];
        if matches!(c, b' ' | b'\t' | b'\r' | b'\n') {
            i += 1;
            continue;
        }
        // 行注記 (JS が行を終える字すべてで終わる)
        if c == b'/' && i + 1 < n && s[i + 1] == b'/' {
            let a = i;
            while i < n && line_terminator(s, i) == 0 {
                i += 1;
            }
            if any_hidden(s, a, i) {
                return 8;
            }
            continue;
        }
        if c == b'/' && i + 1 < n && s[i + 1] == b'*' {
            return 5;
        }
        // 文字列
        if c == b'"' || c == b'\'' {
            let q = c;
            let a = i + 1;
            let mut j = a;
            loop {
                if j >= n {
                    return 11;
                }
                if s[j] == q {
                    break;
                }
                if s[j] == b'\n' {
                    return 11;
                }
                j += if s[j] == b'\\' { 2 } else { 1 };
            }
            let end = if j > n { n } else { j };
            if any_hidden(s, i, end + 1) {
                return 8;
            }
            let mut buf = [0u8; 24];
            let len = decode_string(s, a, end, &mut buf);
            let after = skip_ws(s, end + 1);
            if len <= 24 {
                let word = &buf[..len];
                // 字面の添字 `x["constructor"]`
                if after < n && s[after] == b']' && last_value_before_bracket(s, i) && forbidden_member(word) {
                    return 6;
                }
                // 字面の鍵 `{ "__proto__": … }`
                if after < n && s[after] == b':' && word == b"__proto__" {
                    return 10;
                }
            }
            i = end + 1;
            allow_regex = false;
            after_dot = false;
            continue;
        }
        if c == b'`' {
            return 4;
        }
        // 数
        if c.is_ascii_digit() {
            if c == b'0' && i + 1 < n && (s[i + 1] == b'x' || s[i + 1] == b'X') {
                i += 2;
                while i < n && hex_val(s[i]).is_some() {
                    i += 1;
                }
            } else {
                while i < n && (s[i].is_ascii_digit() || s[i] == b'_') {
                    i += 1;
                }
                if i + 1 < n && s[i] == b'.' && s[i + 1].is_ascii_digit() {
                    i += 1;
                    while i < n && s[i].is_ascii_digit() {
                        i += 1;
                    }
                }
            }
            allow_regex = false;
            after_dot = false;
            continue;
        }
        // 名前
        if is_ident_start(c) {
            let start = i;
            while i < n && is_ident_part(s[i]) {
                i += 1;
            }
            let word = &s[start..i];
            if after_dot {
                if forbidden_member(word) {
                    return 6;
                }
            } else if word == b"as" {
                return 1;
            } else if word == b"any" {
                return 2;
            } else if word == b"eval" {
                return 3;
            }
            let k = skip_ws(s, i);
            if k < n && s[k] == b':' && word == b"__proto__" {
                return 10;
            }
            allow_regex = matches!(word, b"return" | b"typeof" | b"await");
            after_dot = false;
            continue;
        }
        // 正規表現
        if c == b'/' && allow_regex {
            let a = i;
            i += 1;
            let mut in_class = false;
            loop {
                if i >= n || s[i] == b'\n' {
                    return 11;
                }
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
            while i < n && s[i].is_ascii_lowercase() {
                i += 1;
            }
            let end = if i > n { n } else { i };
            if any_hidden(s, a, end) {
                return 8;
            }
            allow_regex = false;
            after_dot = false;
            continue;
        }
        if c == b'.' && i + 2 < n && s[i + 1] == b'.' && s[i + 2] == b'.' {
            return 7;
        }
        // 記号 (TS の PUNCT と同じ文字だけ)
        if matches!(
            c,
            b'(' | b')' | b'{' | b'}' | b'[' | b']' | b'<' | b'>' | b',' | b';' | b':' | b'.' | b'=' | b'!' | b'+' | b'-' | b'*' | b'/' | b'%' | b'?' | b'|' | b'&' | b'^' | b'~'
        ) {
            if c == b'?' && i + 1 < n && s[i + 1] == b'.' {
                after_dot = true;
                allow_regex = true;
                i += 2;
                continue;
            }
            after_dot = c == b'.';
            allow_regex = !matches!(c, b')' | b']' | b'}');
            i += 1;
            continue;
        }
        // 知らない字 (非 ASCII・制御・未知の記号)
        return if hidden_at(s, i) { 8 } else { 9 };
    }
    0
}

/// `[` の直前の字句が値 (名前・`)`・`]`・文字列) か —— 添字で、配列の字面ではない。
/// `str_start` は文字列の開き引用符の位置。その前の `[` を探して、さらにその前を見る。
fn last_value_before_bracket(s: &[u8], str_start: usize) -> bool {
    let mut k = str_start;
    // 開き引用符の直前の空白を飛ばして `[` を探す
    while k > 0 && matches!(s[k - 1], b' ' | b'\t' | b'\r' | b'\n') {
        k -= 1;
    }
    if k == 0 || s[k - 1] != b'[' {
        return false;
    }
    k -= 1;
    while k > 0 && matches!(s[k - 1], b' ' | b'\t' | b'\r' | b'\n') {
        k -= 1;
    }
    if k == 0 {
        return false;
    }
    let p = s[k - 1];
    if p == b')' || p == b']' || p == b'"' || p == b'\'' || p == b'.' {
        // `?.[` の `.` も添字
        return true;
    }
    if is_ident_part(p) {
        // 直前の語が return / typeof / await なら配列の字面
        let mut b = k;
        while b > 0 && is_ident_part(s[b - 1]) {
            b -= 1;
        }
        let w = &s[b..k];
        return !matches!(w, b"return" | b"typeof" | b"await");
    }
    false
}

/// ホストは `input_ptr()` から `len` byte を UTF-8 で置いて呼ぶ。ptr は渡さない。
/// 返り値が 0 以外ならすべて拒むこと (JS は u32 を符号付きで受けるので `!== 0` で比べる)。
#[no_mangle]
pub extern "C" fn verify(len: u32) -> u32 {
    let len = len as usize;
    if len > INPUT_CAP {
        return ERR_TOO_LARGE;
    }
    let s = unsafe { core::slice::from_raw_parts(core::ptr::addr_of!(INPUT).cast::<u8>(), len) };
    verify_bytes(s)
}
