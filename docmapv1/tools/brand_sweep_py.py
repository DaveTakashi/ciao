#!/usr/bin/env python3
"""Python twin of tools/brand-sweep.js: a product name written inside a string becomes a call to the brand reader.

    python3 tools/brand_sweep_py.py --check [file.py …]     report only (exit 1 if something is found)
    python3 tools/brand_sweep_py.py FILE.py …              fix in place: "… DocMap …" → f"… {_bn()} …"

Docstrings, comments, raw/bytes strings, paths (C:\\DocMap), file names (DocMap-…), identifiers (DocMapHub) and data
formats ('DocMap26') are left alone, and so is a line marked «# brand: keep». Each fixed module must import ``_bn`` (the brand name reader of its package):
  hub/docmap_hub          from .branding import brand_name as _bn
  server-python           from .branding import brand_name as _bn
  installer-windows       from brand_reader import brand_name as _bn
Needs Python 3.12+ (f-string tokens); the code it writes runs on 3.11.
"""

from __future__ import annotations

import io
import re
import sys
import tokenize
from pathlib import Path

NAMES = re.compile(r"(?<![-\\/A-Za-z0-9_])(?:DocMap 2026|Doc Location 2026|DocMap|Doc Location)(?![0-9A-Za-z_-])")
CALL = "{_bn()}"


def _is_docstring(toks, i) -> bool:
    j = i - 1
    while j >= 0 and toks[j].type in (tokenize.NL, tokenize.COMMENT):
        j -= 1
    prev_ok = j < 0 or toks[j].type in (tokenize.NEWLINE, tokenize.INDENT, tokenize.DEDENT, tokenize.ENCODING)
    k = i + 1
    while k < len(toks) and toks[k].type in (tokenize.NL, tokenize.COMMENT):
        k += 1
    next_ok = k >= len(toks) or toks[k].type in (tokenize.NEWLINE, tokenize.ENDMARKER)
    return prev_ok and next_ok


def findings(src: str) -> list[tuple[tuple[int, int], tuple[int, int], str]]:
    """[(start, end, kind)] of strings to fix; kind 'str' (plain), 'fstr' (whole f-string), 'raw' (report only).
    A string on (or right after) a line with the comment «# brand: keep» is skipped (a name that is an identifier, e.g. a Windows task)."""
    lines = src.splitlines()
    return [f for f in _findings(src) if "brand: keep" not in lines[f[0][0] - 1]
            and not (f[0][0] > 1 and "brand: keep" in lines[f[0][0] - 2])]


def _findings(src: str) -> list[tuple[tuple[int, int], tuple[int, int], str]]:
    toks = list(tokenize.generate_tokens(io.StringIO(src).readline))
    out, i = [], 0
    while i < len(toks):
        t = toks[i]
        if t.type == tokenize.FSTRING_START:
            depth, j = 1, i + 1
            while depth and j < len(toks):
                if toks[j].type == tokenize.FSTRING_START:
                    depth += 1
                elif toks[j].type == tokenize.FSTRING_END:
                    depth -= 1
                j += 1
            seg = _slice(src, t.start, toks[j - 1].end)
            if NAMES.search(seg) and not _is_docstring_range(toks, i, j - 1):
                out.append((t.start, toks[j - 1].end, "raw" if "r" in t.string.lower() else "fstr"))
            i = j
            continue
        if t.type == tokenize.STRING and NAMES.search(t.string) and not _is_docstring(toks, i):
            pre = re.match(r"^[A-Za-z]*", t.string).group(0).lower()
            out.append((t.start, t.end, "raw" if ("r" in pre or "b" in pre) else "str"))
        i += 1
    return out


def _is_docstring_range(toks, i, j) -> bool:
    k = i - 1
    while k >= 0 and toks[k].type in (tokenize.NL, tokenize.COMMENT):
        k -= 1
    m = j + 1
    while m < len(toks) and toks[m].type in (tokenize.NL, tokenize.COMMENT):
        m += 1
    return (k < 0 or toks[k].type in (tokenize.NEWLINE, tokenize.INDENT, tokenize.DEDENT)) and \
        (m >= len(toks) or toks[m].type in (tokenize.NEWLINE, tokenize.ENDMARKER))


def _offsets(src: str):
    starts, pos = [0], 0
    for line in src.splitlines(keepends=True):
        pos += len(line)
        starts.append(pos)
    return lambda rc: starts[rc[0] - 1] + rc[1]


def _slice(src, a, b):
    off = _offsets(src)
    return src[off(a):off(b)]


def fix(src: str) -> tuple[str, int, list[int]]:
    off = _offsets(src)
    fs = findings(src)
    raw_lines = [a[0] for a, b, k in fs if k == "raw"]
    n = 0
    for a, b, kind in sorted(fs, key=lambda x: off(x[0]), reverse=True):
        if kind == "raw":
            continue
        s, e = off(a), off(b)
        text = src[s:e]
        if kind == "fstr":
            new = NAMES.sub(lambda m: CALL, text)
        else:
            m = re.match(r"^([A-Za-z]*)('''|\"\"\"|'|\")", text)
            pre, q = m.group(1), m.group(2)
            body = text[len(pre) + len(q):-len(q)]
            body = body.replace("{", "{{").replace("}", "}}")
            new = "f" + pre + q + NAMES.sub(lambda m: CALL, body) + q
        src = src[:s] + new + src[e:]
        n += 1
    compile(src, "<brand-sweep>", "exec")
    return src, n, raw_lines


def main(argv: list[str]) -> int:
    check = "--check" in argv
    files = [a for a in argv if not a.startswith("--")]
    total = 0
    for f in files:
        src = Path(f).read_text(encoding="utf-8")
        if check:
            for a, b, kind in findings(src):
                print(f"  ✗ {f}:{a[0]} product name written in a string" + (" (raw string: fix by hand)" if kind == "raw" else ""))
                total += 1
            continue
        new, n, raw = fix(src)
        if n:
            Path(f).write_text(new, encoding="utf-8")
        for ln in raw:
            print(f"  ! {f}:{ln} raw string: fix by hand")
        if n:
            print(f"  {f}: {n} string(s)")
        total += n
    print((f"{total} string(s) with a product name" if check else f"replaced {total} string(s)") if total else "no product name in strings")
    return 1 if check and total else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
