"""Reads the configuration: the PHP `config.php` written by setup.php (or by hand from config.sample.php), or a
`config.json` with the same keys.

config.php is not executed: the parser finds the top-level `return` and evaluates the literal that follows —
`array(...)` / `[...]`, nested, with 'single' / "double" quoted strings, ints (dec/hex/octal/binary), floats,
true / false / null, `=>` keys, trailing commas and comments (//, #, /* */). That is everything var_export() (setup.php)
and the hand-written / test-written files use. The result uses the same PHP array model as phpcompat (lists become
dicts with int keys), so `cfg:<index>` token ids come out exactly as in api.php.
"""
from __future__ import annotations

import json
import os
import re

from .phpcompat import _to_php, php_key


class ConfigSyntaxError(Exception):
    pass


_TOKEN = re.compile(r"""
    (?P<ws>\s+)
  | (?P<comment>//[^\n]*|\#[^\n]*|/\*.*?\*/)
  | (?P<sq>'(?:[^'\\]|\\.)*')
  | (?P<dq>"(?:[^"\\]|\\.)*")
  | (?P<num>[+-]?(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:[0-9][0-9_]*)?\.[0-9][0-9_]*(?:[eE][+-]?[0-9]+)?|[0-9][0-9_]*\.?(?:[eE][+-]?[0-9]+)?))
  | (?P<arrow>=>)
  | (?P<ident>[A-Za-z_\\][A-Za-z0-9_\\]*)
  | (?P<punct>.)
""", re.S | re.X)

_DQ_ESC = re.compile(r"\\(?:([nrtvef\\$\"])|([0-7]{1,3})|x([0-9A-Fa-f]{1,2})|u\{([0-9A-Fa-f]+)\})")
_DQ_MAP = {"n": "\n", "r": "\r", "t": "\t", "v": "\v", "e": "\x1b", "f": "\f", "\\": "\\", "$": "$", '"': '"'}


def _dq(body: str) -> str:
    def rep(m):
        if m.group(1):
            return _DQ_MAP[m.group(1)]
        if m.group(2):
            return chr(int(m.group(2), 8) & 0xFF)
        if m.group(3):
            return chr(int(m.group(3), 16))
        return chr(int(m.group(4), 16))
    if re.search(r"\$[A-Za-z_{]", body):
        raise ConfigSyntaxError("variables inside double-quoted strings are not supported")
    return _DQ_ESC.sub(rep, body)


def _sq(body: str) -> str:
    return re.sub(r"\\([\\'])", r"\1", body)


def _tokens(src: str):
    out = []
    pos = 0
    while pos < len(src):
        m = _TOKEN.match(src, pos)
        if not m:
            raise ConfigSyntaxError("unexpected character at %d" % pos)
        pos = m.end()
        kind = m.lastgroup
        if kind in ("ws", "comment"):
            continue
        out.append((kind, m.group()))
    return out


def _num(t: str):
    s = t.replace("_", "")
    sign = 1
    if s[0] in "+-":
        sign = -1 if s[0] == "-" else 1
        s = s[1:]
    low = s.lower()
    if low.startswith("0x"):
        return sign * int(low[2:], 16)
    if low.startswith("0b"):
        return sign * int(low[2:], 2)
    if low.startswith("0o"):
        return sign * int(low[2:], 8)
    if any(c in low for c in ".e"):
        return sign * float(s)
    if len(s) > 1 and s[0] == "0":
        return sign * int(s, 8)
    return sign * int(s)


class _Parser:
    def __init__(self, toks):
        self.t = toks
        self.i = 0

    def peek(self, k=0):
        return self.t[self.i + k] if self.i + k < len(self.t) else (None, None)

    def take(self):
        tok = self.peek()
        self.i += 1
        return tok

    def expect(self, val):
        k, v = self.take()
        if v != val:
            raise ConfigSyntaxError("expected %r, got %r" % (val, v))

    def value(self):
        kind, v = self.take()
        if kind == "sq":
            return _sq(v[1:-1])
        if kind == "dq":
            return _dq(v[1:-1])
        if kind == "num":
            return _num(v)
        if kind == "punct" and v == "-" and self.peek()[0] == "num":
            return -_num(self.take()[1])
        if kind == "punct" and v == "[":
            return self.array("]")
        if kind == "ident":
            low = v.lower()
            if low == "array" and self.peek()[1] == "(":
                self.take()
                return self.array(")")
            if low == "true":
                return True
            if low == "false":
                return False
            if low == "null":
                return None
        if kind == "punct" and v == "(":
            x = self.value()
            self.expect(")")
            return x
        raise ConfigSyntaxError("unsupported expression near %r" % v)

    def array(self, close):
        out = {}
        nxt = 0
        while True:
            if self.peek()[1] == close:
                self.take()
                return out
            first = self.value()
            if self.peek()[0] == "arrow":
                self.take()
                key = first
                val = self.value()
                if isinstance(key, bool):
                    key = int(key)
                elif isinstance(key, float):
                    key = int(key)
                elif key is None:
                    key = ""
                elif isinstance(key, str):
                    key = php_key(key)
                out[key] = val
                if isinstance(key, int) and key >= nxt:
                    nxt = key + 1
            else:
                out[nxt] = first
                nxt += 1
            k, v = self.take()
            if v == close:
                return out
            if v != ",":
                raise ConfigSyntaxError("expected , or %s, got %r" % (close, v))


def parse_php_config(src: str):
    """Returns the value of the top-level `return <literal>;` of a config.php."""
    i = src.find("<?php")
    if i >= 0:
        src = src[i + 5:]
    toks = _tokens(src)
    depth = 0
    for n, (kind, v) in enumerate(toks):
        if kind == "punct" and v in "({[":
            depth += 1
        elif kind == "punct" and v in ")}]":
            depth -= 1
        elif kind == "ident" and v.lower() == "return" and depth == 0:
            p = _Parser(toks)
            p.i = n + 1
            return p.value()
    raise ConfigSyntaxError("no top-level return in config.php")


def read_config_file(path: str):
    """Raw configuration value (PHP array model) from config.php or config.json; raises FileNotFoundError /
    ConfigSyntaxError / ValueError."""
    with open(path, "r", encoding="utf-8-sig") as f:
        src = f.read()
    if path.lower().endswith(".json"):
        return _to_php(json.loads(src), 1)
    return parse_php_config(src)


def default_config_path() -> str:
    for name in ("config.json", "config.php"):
        if os.path.isfile(name):
            return os.path.abspath(name)
    return os.path.abspath("config.json")
