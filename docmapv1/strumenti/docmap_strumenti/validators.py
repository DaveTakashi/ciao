"""Value parsers and validators shared by «extract» and «check» (Italian documents first)."""

from __future__ import annotations

import re
from datetime import date

MONTHS = {"gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4, "maggio": 5, "giugno": 6, "luglio": 7, "agosto": 8,
          "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12, "gen": 1, "feb": 2, "mar": 3, "apr": 4,
          "mag": 5, "giu": 6, "lug": 7, "ago": 8, "set": 9, "ott": 10, "nov": 11, "dic": 12,
          "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6, "july": 7, "august": 8,
          "september": 9, "october": 10, "november": 11, "december": 12}
DATE_RES = [
    re.compile(r"(?<!\d)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)"),                       # 2024-03-12
    re.compile(r"(?<!\d)(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2,4})(?!\d)"),                 # 12/03/2024, 12.3.24
    re.compile(r"(?<!\d)(\d{1,2})\s*(?:°\s*)?([A-Za-zàèéìòù]{3,9})\.?\s+(\d{2,4})(?!\d)", re.I),  # 12 marzo 2024
]
AMOUNT_RE = re.compile(r"(?<![\d.,])(€\s*)?(-?\d{1,3}(?:[.\s']\d{3})+(?:,\d{1,2})?|-?\d+(?:[.,]\d{1,2})?)(\s*€|\s*EUR)?(?![\d])", re.I)


def parse_date(s: str) -> list[str]:
    """Every date in ``s`` as ISO strings (yyyy-mm-dd), in order of appearance."""
    found = []
    for i, rx in enumerate(DATE_RES):
        for m in rx.finditer(s or ""):
            try:
                if i == 0:
                    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
                elif i == 1:
                    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
                else:
                    d, y = int(m.group(1)), int(m.group(3))
                    mo = MONTHS.get(m.group(2).lower().rstrip("."))
                    if not mo:
                        continue
                if y < 100:
                    y += 2000 if y < 70 else 1900
                found.append((m.start(), date(y, mo, d).isoformat()))
            except ValueError:
                continue
    seen, out = set(), []
    for _, v in sorted(found):
        if v not in seen:
            seen.add(v)
            out.append(v)
    return out


def parse_amount(s: str) -> float | None:
    s = (s or "").strip().replace("€", "").replace("EUR", "").strip()
    if not s:
        return None
    s = s.replace(" ", "").replace("'", "")
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    elif re.fullmatch(r"-?\d{1,3}(\.\d{3})+", s):
        s = s.replace(".", "")
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def amounts(s: str) -> list[float]:
    """Money amounts: numbers with cents, thousands separators or a currency sign (years and plain counts are not)."""
    out = []
    for m in AMOUNT_RE.finditer(s or ""):
        num = m.group(2)
        if not (m.group(1) or m.group(3) or re.search(r"[.,]\d{1,2}$", num) or re.search(r"\d[.\s']\d{3}", num)):
            continue
        v = parse_amount(num)
        if v is not None:
            out.append(v)
    return out


def piva_ok(v: str) -> bool:
    v = re.sub(r"\s", "", str(v or "")).upper().removeprefix("IT")
    if not re.fullmatch(r"\d{11}", v):
        return False
    tot = 0
    for i, ch in enumerate(v[:10]):
        n = int(ch)
        if i % 2:
            n *= 2
            n = n - 9 if n > 9 else n
        tot += n
    return (10 - tot % 10) % 10 == int(v[10])


_CF_ODD = {**{str(i): v for i, v in enumerate([1, 0, 5, 7, 9, 13, 15, 17, 19, 21])},
           **dict(zip("ABCDEFGHIJKLMNOPQRSTUVWXYZ", [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12,
                                                    14, 16, 10, 22, 25, 24, 23]))}


def cf_ok(v: str) -> bool:
    v = re.sub(r"\s", "", str(v or "")).upper()
    if re.fullmatch(r"\d{11}", v):
        return piva_ok(v)   # companies use the VAT number as tax code
    if not re.fullmatch(r"[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]", v):
        return False
    tot = 0
    for i, ch in enumerate(v[:15]):
        if i % 2 == 0:
            tot += _CF_ODD[ch]
        else:
            tot += int(ch) if ch.isdigit() else ord(ch) - 65
    return chr(65 + tot % 26) == v[15]


def iban_ok(v: str) -> bool:
    v = re.sub(r"\s", "", str(v or "")).upper()
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{10,30}", v):
        return False
    if v.startswith("IT") and len(v) != 27:
        return False
    num = "".join(str(int(c, 36)) for c in v[4:] + v[:4])
    return int(num) % 97 == 1


PATTERNS = {
    "piva": re.compile(r"(?<![\dA-Z])(?:IT\s?)?(\d{11})(?!\d)", re.I),
    "cf": re.compile(r"(?<![A-Z0-9])([A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z])(?![A-Z0-9])", re.I),
    "iban": re.compile(r"(?<![A-Z0-9])([A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30})"),
    "email": re.compile(r"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})"),
    "cap": re.compile(r"(?<!\d)(\d{5})(?!\d)"),
}
CHECKS = {"piva": piva_ok, "cf": cf_ok, "iban": iban_ok,
          "email": lambda v: bool(PATTERNS["email"].fullmatch(str(v or "")))}


def validate(rule: str, v) -> tuple[bool, str]:
    """``piva`` · ``cf`` · ``iban`` · ``email`` · ``date`` · ``regex:…`` · ``range:1-9999`` · ``len:6-12`` ·
    ``in:a,b,c`` · ``number``. Returns (ok, reason)."""
    s = "" if v is None else str(v).strip()
    rule = (rule or "").strip()
    if rule in CHECKS:
        return (CHECKS[rule](s), f"{rule} non valido")
    if rule == "date":
        return (bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", s)) or bool(parse_date(s)), "data non valida")
    if rule == "number":
        return (parse_amount(s) is not None, "non è un numero")
    if rule.startswith("regex:"):
        return (re.fullmatch(rule[6:], s) is not None, "formato non valido")
    if rule.startswith("range:"):
        a, _, b = rule[6:].partition("-")
        n = parse_amount(s)
        lo = float(a) if a.strip() else float("-inf")
        hi = float(b) if b.strip() else float("inf")
        return (n is not None and lo <= n <= hi, f"fuori dall'intervallo {rule[6:]}")
    if rule.startswith("len:"):
        a, _, b = rule[4:].partition("-")
        return (int(a or 0) <= len(s) <= int(b or a or 10**9), f"lunghezza non tra {rule[4:]}")
    if rule.startswith("in:"):
        return (s.lower() in [x.strip().lower() for x in rule[3:].split(",")], "valore non previsto")
    raise ValueError(f"regola di controllo sconosciuta: {rule}")
