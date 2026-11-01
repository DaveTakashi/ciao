"""PHP value semantics needed to reproduce server-php/api.php byte for byte.

PHP arrays are modelled as Python dicts whose keys are int or str (a JSON list becomes {0: .., 1: ..}, a numeric
string key "12" becomes the int 12, exactly as json_decode($x, true) does). `jenc()` re-encodes them like
json_encode(): a dict whose keys are 0..n-1 in order (or an empty dict) is a JSON array, anything else an object.
Python lists are accepted by jenc() too (handy for responses built here).
"""
from __future__ import annotations

import base64
import binascii
import calendar
import json
import math
import re
import time
from decimal import Decimal
from functools import cmp_to_key

INT_MAX = 2 ** 63 - 1
INT_MIN = -(2 ** 63)


class PhpWarning(Exception):
    """A PHP warning / notice / TypeError: api.php turns every warning into an exception (500 server_error)."""


# ---------------------------------------------------------------- json_decode($raw, true)
_INT_KEY = re.compile(r"(?:0|-?[1-9][0-9]*)\Z")


def php_key(k):
    if isinstance(k, str) and _INT_KEY.match(k):
        n = int(k)
        if INT_MIN <= n <= INT_MAX:
            return n
    return k


def _reject_constant(name):
    raise ValueError("invalid JSON constant " + name)


def _parse_int(s):
    n = int(s)
    return n if INT_MIN <= n <= INT_MAX else float(s)


def _pairs(pairs):
    d = {}
    for k, v in pairs:
        d[php_key(k)] = v
    return d


def _to_php(v, depth):
    if isinstance(v, dict):
        if depth > 512:
            raise ValueError("depth")
        for k in list(v.keys()):
            v[k] = _to_php(v[k], depth + 1)
        return v
    if isinstance(v, list):
        if depth > 512:
            raise ValueError("depth")
        return {i: _to_php(x, depth + 1) for i, x in enumerate(v)}
    if isinstance(v, str):
        v.encode("utf-8")   # a lone surrogate (\ud800) is an error for PHP (JSON_ERROR_UTF16)
    return v


def json_decode(raw):
    """json_decode($raw, true); raises ValueError where PHP returns null on error.
    raw: bytes or str. Returns the PHP value (dict model)."""
    if isinstance(raw, (bytes, bytearray)):
        raw = bytes(raw).decode("utf-8")      # invalid UTF-8 → UnicodeDecodeError (a ValueError) like PHP
    v = json.loads(raw, object_pairs_hook=_pairs, parse_int=_parse_int, parse_constant=_reject_constant)
    return _to_php(v, 1)


# ---------------------------------------------------------------- json_encode(JSON_UNESCAPED_UNICODE|SLASHES|INVALID_UTF8_SUBSTITUTE)
def _digits_shortest(x):
    """zend_dtoa mode 0: shortest round-trip digits and decpt (value = 0.DIGITS × 10^decpt)."""
    sign, digs, exp = Decimal(repr(abs(x))).as_tuple()
    s = "".join(map(str, digs)).rstrip("0")
    if not s:
        return "0", 1
    return s, len(digs) + exp


def _digits_prec(x, prec):
    """zend_dtoa mode 2 with `prec` significant digits (trailing zeros removed)."""
    if x == 0:
        return "0", 1
    m = "%.*e" % (prec - 1, abs(x))
    mant, e = m.split("e")
    s = mant.replace(".", "").rstrip("0") or "0"
    return s, int(e) + 1


def _gcvt(x, ndigit, digits, decpt, echar):
    neg = x < 0 or (x == 0 and math.copysign(1.0, x) < 0)
    out = "-" if neg else ""
    if (decpt < -3) if decpt < 0 else (decpt > ndigit):
        e = decpt - 1
        esign = "-" if e < 0 else "+"
        e = abs(e)
        out += digits[0] + "." + (digits[1:] if len(digits) > 1 else "0") + echar + esign + str(e)
    elif decpt < 0:
        out += "0." + "0" * (-decpt) + digits
    else:
        if decpt == 0:
            ip = ""
        else:
            ip = digits[:decpt] + "0" * max(0, decpt - len(digits))
        frac = digits[decpt:] if len(digits) > decpt else ""
        if frac:
            out += (ip if ip else "0") + "." + frac
        else:
            out += ip if ip else "0"
    return out


def php_json_float(x):
    """json_encode() of a float (serialize_precision -1)."""
    if math.isinf(x) or math.isnan(x):
        raise PhpWarning("Inf and NaN cannot be JSON encoded")
    digits, decpt = _digits_shortest(x)
    return _gcvt(x, 17, digits, decpt, "e")


def php_float_str(x):
    """(string)$float with precision = 14 (php.ini default)."""
    if math.isnan(x):
        return "NAN"
    if math.isinf(x):
        return "INF" if x > 0 else "-INF"
    digits, decpt = _digits_prec(x, 14)
    return _gcvt(x, 14, digits, decpt, "E")


def is_php_list(d):
    i = 0
    for k in d:
        if type(k) is not int or k != i:
            return False
        i += 1
    return True


def _jstr(s):
    return json.dumps(s, ensure_ascii=False).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def jenc(v):
    """json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE)."""
    parts = []
    _enc(v, parts)
    return "".join(parts)


def _enc(v, out):
    if v is None:
        out.append("null")
    elif v is True:
        out.append("true")
    elif v is False:
        out.append("false")
    elif isinstance(v, int):
        out.append(str(v))
    elif isinstance(v, float):
        out.append(php_json_float(v))
    elif isinstance(v, str):
        out.append(_jstr(v))
    elif isinstance(v, (list, tuple)):
        out.append("[")
        first = True
        for x in v:
            if not first:
                out.append(",")
            first = False
            _enc(x, out)
        out.append("]")
    elif isinstance(v, dict):
        if is_php_list(v):
            _enc(list(v.values()), out)
            return
        out.append("{")
        first = True
        for k, x in v.items():
            if not first:
                out.append(",")
            first = False
            out.append(_jstr(str(k)))
            out.append(":")
            _enc(x, out)
        out.append("}")
    else:
        raise TypeError("cannot encode " + type(v).__name__)


# ---------------------------------------------------------------- casts and helpers
def is_arr(v):
    return isinstance(v, (dict, list))


def php_str(v):
    """(string)$v; arrays raise (PHP: 'Array to string conversion' warning → exception)."""
    if v is None or v is False:
        return ""
    if v is True:
        return "1"
    if isinstance(v, str):
        return v
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return php_float_str(v)
    raise PhpWarning("Array to string conversion")


_WS = " \t\n\r\v\f"
_NUM_PREFIX = re.compile(r"[ \t\n\r\v\f]*([+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)")
_NUM_FULL = re.compile(r"[ \t\n\r\v\f]*([+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)[ \t\n\r\v\f]*\Z")


def _num_value(s):
    if any(c in s for c in ".eE"):
        return float(s)
    n = int(s)
    if INT_MIN <= n <= INT_MAX:
        return n
    return float(s)


def numeric_string(s):
    """is_numeric_string() (PHP 8, whole string, leading/trailing whitespace allowed): number or None."""
    m = _NUM_FULL.match(s)
    return _num_value(m.group(1)) if m else None


def _dval_to_lval(d, cap=False):
    if math.isnan(d) or math.isinf(d):
        if cap and math.isinf(d):
            return INT_MAX if d > 0 else INT_MIN
        return 0
    if not (-9.223372036854775808e18 <= d < 9.223372036854775808e18):
        if cap:
            return INT_MAX if d > 0 else INT_MIN
        return 0
    return int(d)


def php_int(v):
    """(int)$v."""
    if v is None or v is False:
        return 0
    if v is True:
        return 1
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return _dval_to_lval(v)
    if isinstance(v, str):
        m = _NUM_PREFIX.match(v)
        if not m:
            return 0
        x = _num_value(m.group(1))
        return x if isinstance(x, int) else _dval_to_lval(x, cap=True)
    if isinstance(v, (dict, list)):
        return 1 if v else 0
    return 0


def php_truthy(v):
    if v is None or v is False:
        return False
    if v is True:
        return True
    if isinstance(v, (int, float)):
        return v != 0
    if isinstance(v, str):
        return v not in ("", "0")
    if isinstance(v, (dict, list)):
        return len(v) > 0
    return True


def php_empty(v):
    return not php_truthy(v)


def elvis(*vals):
    """$a ?: $b ?: $c"""
    for v in vals[:-1]:
        if php_truthy(v):
            return v
    return vals[-1]


def is_scalar(v):
    return isinstance(v, (bool, int, float, str))


def pget(arr, key, default=None):
    """$arr[$key] ?? $default (non-array containers give the default, null counts as missing)."""
    if isinstance(arr, dict):
        v = arr.get(key)
        return default if v is None else v
    return default


def akey(arr, key):
    """array_key_exists($key, $arr)"""
    return isinstance(arr, dict) and key in arr


def php_array_values(v):
    """foreach ((array)$v as $x)"""
    if v is None:
        return []
    if isinstance(v, dict):
        return list(v.values())
    if isinstance(v, list):
        return list(v)
    return [v]


def php_trim(s, chars=" \t\n\r\0\x0b"):
    return s.strip(chars)


_UP = {i: i - 32 for i in range(97, 123)}
_LO = {i: i + 32 for i in range(65, 91)}


def ascii_upper(s):
    return s.translate(_UP)


def ascii_lower(s):
    return s.translate(_LO)


def substr_bytes(s, n, start=0):
    """substr($s, start, n) on the UTF-8 bytes (a cut character becomes U+FFFD, as json_encode would print it)."""
    b = s.encode("utf-8")
    if len(b) <= n and start == 0:
        return s
    return b[start:start + n].decode("utf-8", "replace")


def b64decode_strict(s):
    """base64_decode($s, true): whitespace skipped, any other foreign char or bad padding → None."""
    t = "".join(ch for ch in s if ch not in " \t\r\n")
    m = re.match(r"([A-Za-z0-9+/]*)(=*)\Z", t)
    if not m:
        return None
    body, pad = m.group(1), m.group(2)
    if len(body) % 4 == 1:
        return None
    if pad and (len(pad) > 2 or (len(body) + len(pad)) % 4 != 0):
        return None
    try:
        return base64.b64decode(body + "=" * (-len(body) % 4))
    except (binascii.Error, ValueError):
        return None


# ---------------------------------------------------------------- comparisons (ksort, strnatcasecmp)
def _bin_strcmp(a, b):
    ab, bb = a.encode("utf-8"), b.encode("utf-8")
    return (ab > bb) - (ab < bb)


def _num_cmp(x, y):
    return (x > y) - (x < y)


def _smart_strcmp(a, b):
    na, nb = numeric_string(a), numeric_string(b)
    if na is not None and nb is not None:
        if isinstance(na, int) and isinstance(nb, int):
            return _num_cmp(na, nb)
        return _num_cmp(float(na), float(nb))
    return _bin_strcmp(a, b)


def _long_str_cmp(n, s):
    ns = numeric_string(s)
    if ns is not None:
        if isinstance(ns, int):
            return _num_cmp(n, ns)
        return _num_cmp(float(n), ns)
    return _bin_strcmp(str(n), s)


def php_key_cmp(a, b):
    """ksort() SORT_REGULAR key comparison (PHP 8)."""
    ia, ib = isinstance(a, int), isinstance(b, int)
    if ia and ib:
        return 1 if a > b else -1
    if not ia and not ib:
        return _smart_strcmp(a, b)
    if ia:
        return _long_str_cmp(a, b)
    return -_long_str_cmp(b, a)


_KSORT_KEY = cmp_to_key(php_key_cmp)


def ksorted_keys(d):
    return sorted(d.keys(), key=_KSORT_KEY)


_SPACE = b" \t\n\v\f\r"
_DIGIT = b"0123456789"


def strnatcmp_ex(a: str, b: str, fold=True):
    """Port of strnatcmp_ex() of ext/standard/strnatcmp.c (PHP 8)."""
    A, B = a.encode("utf-8"), b.encode("utf-8")
    la, lb = len(A), len(B)
    if la == 0 or lb == 0:
        return 0 if la == lb else (1 if la > lb else -1)
    at = lambda i: A[i] if i < la else 0   # noqa: E731  (the C string is NUL-terminated)
    bt = lambda i: B[i] if i < lb else 0   # noqa: E731
    isd = lambda c: 48 <= c <= 57          # noqa: E731
    ap = bp = 0
    leading = True
    while True:
        ca, cb = at(ap), bt(bp)
        while leading and ca == 48 and ap + 1 < la and isd(A[ap + 1]):
            ap += 1
            ca = A[ap]
        while leading and cb == 48 and bp + 1 < lb and isd(B[bp + 1]):
            bp += 1
            cb = B[bp]
        leading = False
        while ca in _SPACE and ca != 0:
            ap += 1
            ca = at(ap)
        while cb in _SPACE and cb != 0:
            bp += 1
            cb = bt(bp)
        if isd(ca) and isd(cb):
            fractional = ca == 48 or cb == 48
            if fractional:
                # compare_left
                while True:
                    ea = ap >= la or not isd(A[ap])
                    eb = bp >= lb or not isd(B[bp])
                    if ea and eb:
                        result = 0
                        break
                    if ea:
                        result = -1
                        break
                    if eb:
                        result = 1
                        break
                    if A[ap] < B[bp]:
                        result = -1
                        break
                    if A[ap] > B[bp]:
                        result = 1
                        break
                    ap += 1
                    bp += 1
            else:
                # compare_right
                bias = 0
                while True:
                    ea = ap >= la or not isd(A[ap])
                    eb = bp >= lb or not isd(B[bp])
                    if ea and eb:
                        result = bias
                        break
                    if ea:
                        result = -1
                        break
                    if eb:
                        result = 1
                        break
                    if A[ap] < B[bp]:
                        if not bias:
                            bias = -1
                    elif A[ap] > B[bp]:
                        if not bias:
                            bias = 1
                    ap += 1
                    bp += 1
            if result != 0:
                return result
            elif ap == la and bp == lb:
                return 0
            elif ap == la:
                return -1
            elif bp == lb:
                return 1
            else:
                ca, cb = A[ap], B[bp]
        if fold:
            if 97 <= ca <= 122:
                ca -= 32
            if 97 <= cb <= 122:
                cb -= 32
        if ca < cb:
            return -1
        if ca > cb:
            return 1
        ap += 1
        bp += 1
        if ap >= la and bp >= lb:
            return 0
        if ap >= la:
            return -1
        if bp >= lb:
            return 1


def strnatcasecmp(a, b):
    return strnatcmp_ex(a, b, True)


# ---------------------------------------------------------------- canonical JSON (canon() of api.php)
CANON_SKIP = ("updated_at", "short_url", "location_code", "selected_for_print")


def canon(v, top=True):
    if isinstance(v, list):
        v = {i: x for i, x in enumerate(v)}
    if isinstance(v, dict):
        keys = list(v.keys())
        is_list = not keys or is_php_list(v)
        if not is_list:
            keys = ksorted_keys(v)
            if top:
                keys = [k for k in keys if k not in CANON_SKIP]
            keys = [k for k in keys if not (isinstance(k, str) and k != "" and k[0] == "_")]
        return {k: canon(v[k], False) for k in keys}
    if v is None:
        return ""
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, (int, float)):
        return php_str(v)
    return v


# ---------------------------------------------------------------- time
def now_iso():
    t = time.time()
    s = math.floor(t)
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(s)) + ".%03dZ" % int(math.floor((t - s) * 1000))


def iso_ms(ms: int) -> str:
    sec = int(ms / 1000) if ms >= 0 else -int(-ms / 1000)   # intdiv truncates toward zero
    rem = ms - sec * 1000
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(sec)) + ".%03dZ" % rem


_ISO = re.compile(
    r"[ \t\n]*([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})"
    r"(?:(?:[Tt]|[ \t]+)([0-9]{1,2}):([0-9]{2})(?::([0-9]{2})(?:[.,]([0-9]+))?)?)?"
    r"[ \t]*(Z|UTC|GMT|[+-][0-9]{1,2}(?::?[0-9]{2})?)?[ \t\n]*\Z", re.I)


def ts_ms(iso) -> int:
    """ts_ms() of api.php: (int)(new DateTimeImmutable($iso))->format('Uv'), 0 for anything unparseable.
    Covers the ISO 8601 forms DocMap clients send (date, date+time, fraction, Z / UTC / ±hh[:mm]); PHP's relative
    formats ("now", "tomorrow", "@123"…) are not reproduced (they give 0 here)."""
    if not isinstance(iso, str) or php_trim(iso) == "":
        return 0
    m = _ISO.match(iso)
    if not m:
        return 0
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1 <= mo <= 12) or d > 31:
        return 0
    h = int(m.group(4) or 0)
    mi = int(m.group(5) or 0)
    s = int(m.group(6) or 0)
    if h > 24 or mi > 59 or s > 60:
        return 0
    frac = m.group(7) or ""
    if len(frac) <= 6:
        us = int(frac or "0") * 10 ** (6 - len(frac))
    else:
        us = int(frac[:6])
    tz = (m.group(8) or "").upper()
    off = 0
    if tz and tz not in ("Z", "UTC", "GMT"):
        sign = -1 if tz[0] == "-" else 1
        t = tz[1:].replace(":", "")
        if len(t) <= 2:
            oh, om = int(t), 0
        else:
            oh, om = int(t[:-2]), int(t[-2:])
        if oh > 24 or om > 59:
            return 0
        off = sign * (oh * 3600 + om * 60)
    days = calendar.timegm((y, mo, 1, 0, 0, 0)) // 86400 + (d - 1)
    sec = days * 86400 + h * 3600 + mi * 60 + s - off
    ms = us // 1000
    return int(str(sec) + "%03d" % ms)
