"""Profiles, routing by task, and the strategies that use several models at once.

A **profile** (``ai.profiles.<name>``) is one of:

* **single** (default): ``{"provider", "model", "base_url"?, "api_key"?, "effort"?, "temperature"?, "extra_body"?,
  "fallback": ["other profile", …]}``: one model; if it is busy/down/unfit the next profile of ``fallback`` answers.
* **cascade**: ``{"strategy": "cascade", "steps": ["locale", "qualita"], "min_conf": 0.8}``: the first step answers;
  if its confidence is below ``min_conf`` the next step reads again (cheap/local first, best model only when unsure).
* **consensus**: ``{"strategy": "consensus", "members": ["a", "b", "c"], "min_agree": 2}``: the members read the same
  thing **in parallel**; every field gets the value most members agree on, its confidence drops when they disagree
  (cross-check: two different models agreeing are worth more than one sure model).

Which profile answers: the profile named by the caller (a recipe step) → ``ai.tasks[<task>]`` (``ocr``, ``extract``,
``classify``, ``analyze``) → a profile with the same name as the task → ``ai.default_profile`` →
``predefinito`` (the old single AI setting).
"""

from __future__ import annotations

import re
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher

from .base import PROVIDERS, AIError, Request
from .catalogue import caps, resolve_model

DEFAULT_PROFILE = "predefinito"
STRATEGIES = ("single", "cascade", "consensus")
MAX_DEPTH = 3
_RESERVED = ("profiles", "keys", "aliases", "models", "default_profile", "tasks", "mock_response", "plugins_dir")


def profiles(settings: dict) -> dict:
    """All the profiles of this installation. ``predefinito`` always exists (it is the old single AI setting)."""
    a = settings.get("ai") or {}
    out = {DEFAULT_PROFILE: {k: v for k, v in a.items() if k not in _RESERVED and v not in (None, "")}}
    for name, p in (a.get("profiles") or {}).items():
        if isinstance(p, dict) and re.match(r"^[\w\-]{1,40}$", str(name)):
            out[str(name)] = dict(p)
    return out


def pick(settings: dict, name: str | None = None, task: str = "") -> str:
    a = settings.get("ai") or {}
    ps = profiles(settings)
    # the caller's profile → the task's profile (ai.tasks) → a profile named like the task → the default
    for n in (name, (a.get("tasks") or {}).get(task) if task else None, task or None, a.get("default_profile")):
        if n and n in ps:
            return n
    return DEFAULT_PROFILE


def profile(settings: dict, name: str | None) -> dict:
    ps = profiles(settings)
    n = name if name in ps else pick(settings, name)
    p = dict(ps[n])
    p["_name"] = n
    return p


def chain(settings: dict, name: str | None) -> list[dict]:
    """A single profile, then its ``fallback`` profiles, without loops; at most 4 tries."""
    out, seen = [], set()
    todo = [name or pick(settings)]
    while todo and len(out) < 4:
        p = profile(settings, todo.pop(0))
        if p["_name"] in seen:
            continue
        seen.add(p["_name"])
        if p.get("provider") or p.get("strategy") in ("cascade", "consensus"):
            out.append(p)
        fb = p.get("fallback") or []
        todo.extend([fb] if isinstance(fb, str) else [x for x in fb if isinstance(x, str)])
    return out


def enabled(settings: dict, name: str | None = None, task: str = "") -> bool:
    def ok(p, depth=0):
        if depth > MAX_DEPTH:
            return False
        st = p.get("strategy") or "single"
        if st == "single":
            return p.get("provider") in PROVIDERS
        names = p.get("steps") if st == "cascade" else p.get("members")
        return any(ok(profile(settings, n), depth + 1) for n in (names or []) if isinstance(n, str))
    return any(ok(p) for p in chain(settings, pick(settings, name, task)))


# -- confidence and agreement ---------------------------------------------------------------------------------------

def confidence(res: dict) -> float | None:
    """Overall confidence of an answer: ``confidence``, else the lowest per-field ``{"confidence"}``, else the mean of
    ``field_conf``."""
    if not isinstance(res, dict):
        return None
    c = res.get("confidence")
    if isinstance(c, (int, float)):
        return float(c)
    sub = [v["confidence"] for v in res.values() if isinstance(v, dict) and isinstance(v.get("confidence"), (int, float))]
    if sub:
        return float(min(sub))
    fc = res.get("field_conf")
    if isinstance(fc, dict) and fc:
        vals = [float(v) for v in fc.values() if isinstance(v, (int, float))]
        return sum(vals) / len(vals) if vals else None
    return None


def _norm(v) -> str:
    if isinstance(v, list):
        return "|".join(sorted(_norm(x) for x in v))
    s = unicodedata.normalize("NFKD", str(v if v is not None else "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[\W_]+", " ", s).strip()


def _same(a: str, b: str) -> bool:
    if a == b:
        return True
    if len(a) > 40 or len(b) > 40:   # long texts (transcriptions): close enough is the same reading
        return SequenceMatcher(None, a, b).ratio() >= 0.9
    return False


def _vote(values: list) -> tuple[object, int]:
    """The value most members agree on (by normalised text) and how many agree."""
    groups: list[list] = []
    for v in values:
        n = _norm(v)
        for g in groups:
            if _same(g[0], n):
                g[1].append(v)
                break
        else:
            groups.append([n, [v]])
    best = max(groups, key=lambda g: (len(g[1]), len(g[0])))
    return best[1][0], len(best[1])


def merge(results: list[dict], min_agree: int = 2) -> dict:
    """Consensus of several answers to the same request (same JSON shape). Every field: the majority value; a field
    ``{"value", "confidence"}`` keeps that shape; ``confidence`` / ``field_conf`` are recomputed from the agreement."""
    m = len(results)
    keys: list = []
    for r in results:
        keys.extend(k for k in r if k not in keys and k not in ("confidence", "field_conf") and not str(k).startswith("_c"))
    out: dict = {}
    fields: dict = {}
    for k in keys:
        vals = [r[k] for r in results if k in r]
        if vals and all(isinstance(v, dict) and "value" in v for v in vals):
            val, n = _vote([v.get("value") for v in vals])
            confs = [float(v.get("confidence")) for v in vals if isinstance(v.get("confidence"), (int, float)) and _same(_norm(v.get("value")), _norm(val))]
            c = (sum(confs) / len(confs) if confs else 0.5) * (n / m)
            if n < min_agree:
                c = min(c, 0.49)
            out[k] = {"value": val, "confidence": round(c, 3)}
        elif vals and all(isinstance(v, (str, int, float, bool, list)) or v is None for v in vals):
            out[k], n = _vote(vals)
        else:
            out[k], n = vals[0] if vals else None, 1
        fields[k] = {"agree": n, "of": m, "values": [r.get(k) for r in results][:5] if n < m else None}
    agree = [f["agree"] / m for f in fields.values()] or [1.0]
    base = [c for c in (confidence(r) for r in results) if c is not None]
    overall = (sum(base) / len(base) if base else 1.0) * (sum(agree) / len(agree))
    if any(f["agree"] < min_agree for f in fields.values()):
        overall = min(overall, 0.49)
    out["confidence"] = round(overall, 3)
    if any(isinstance(r.get("field_conf"), dict) for r in results):
        fc: dict = {}
        for r in results:
            for k in (r.get("field_conf") or {}):
                fc.setdefault(k, 0.0)
        for k in fc:
            src = ["year_from", "year_to"] if k == "years" else [k]
            fs = [fields[x] for x in src if x in fields]
            mean = [float((r.get("field_conf") or {}).get(k) or 0) for r in results]
            fc[k] = round(min(f["agree"] for f in fs) / m * (sum(mean) / len(mean)), 3) if fs else 0.0
        out["field_conf"] = fc
    out["_consensus"] = {k: {"agree": v["agree"], "of": v["of"], **({"values": v["values"]} if v["values"] else {})}
                         for k, v in fields.items()}
    return out


# -- execution ------------------------------------------------------------------------------------------------------

def _single(p: dict, settings: dict, req: Request) -> dict:
    prov = PROVIDERS.get(p.get("provider") or "")
    if not prov:
        raise AIError(f"fornitore sconosciuto: {p.get('provider')!r}", retry=True)
    model = resolve_model(prov.id, p.get("model") or "", settings)
    if req.image and model and caps(prov.id, model, settings, prov.caps).get("vision") is False:
        raise AIError(f"il modello «{model}» non legge le immagini", retry=True)
    t0 = time.monotonic()
    r = prov.call(p, settings, req)
    r.setdefault("provider", prov.id)
    r["ms"] = int((time.monotonic() - t0) * 1000)
    return r


def _run(settings: dict, name: str, req: Request, depth: int) -> dict:
    """One profile name, with its fallbacks."""
    if depth > MAX_DEPTH:
        raise AIError("profili annidati troppo in profondità")
    attempts, last = [], None
    for p in chain(settings, name):
        t0 = time.monotonic()
        try:
            st = p.get("strategy") or "single"
            if st == "cascade":
                r = _cascade(p, settings, req, depth)
            elif st == "consensus":
                r = _consensus(p, settings, req, depth)
            else:
                r = _single(p, settings, req)
        except AIError as e:
            attempts.append({"profile": p["_name"], "provider": p.get("provider") or p.get("strategy"), "error": str(e)[:200],
                             "ms": int((time.monotonic() - t0) * 1000)})
            attempts.extend(getattr(e, "attempts", []) or [])
            last = e
            if not e.retry:
                break
            continue
        r["profile"] = p["_name"]
        r["attempts"] = attempts + (r.get("attempts") or [])
        return r
    err = (AIError("nessun fornitore AI ha risposto: " + "; ".join(f"{a['profile']} ({a['provider']}): {a['error']}" for a in attempts if 'profile' in a),
                   retry=bool(last and last.retry))
           if len(attempts) > 1 else (last or AIError("AI spenta: sceglila in Impostazioni › AI")))
    err.attempts = attempts
    raise err


def _sum_usage(rs: list[dict]) -> dict:
    out = {"in": 0, "out": 0}
    for r in rs:
        for k in out:
            out[k] += int((r.get("usage") or {}).get(k) or 0)
    return out


def _cascade(p: dict, settings: dict, req: Request, depth: int) -> dict:
    steps = [s for s in (p.get("steps") or []) if isinstance(s, str)]
    if not steps:
        raise AIError(f"profilo «{p['_name']}»: la cascata non ha passi")
    min_conf = float(p.get("min_conf") or 0.8)
    done, best, errors = [], None, []
    for s in steps:
        try:
            r = _run(settings, s, req, depth + 1)
        except AIError as e:
            errors.append({"profile": s, "provider": "cascade", "error": str(e)[:200]})
            continue
        done.append(r)
        c = confidence(r["result"])
        if best is None or (c or 0) > (confidence(best["result"]) or 0):
            best = r
        if c is not None and c >= min_conf:
            best = r
            break
    if best is None:
        e = AIError(f"cascata «{p['_name']}»: nessun passo ha risposto", retry=True)
        e.attempts = errors
        raise e
    out = dict(best)
    out["usage"] = _sum_usage(done)
    out["steps"] = [{"profile": r.get("profile"), "provider": r.get("provider"), "model": r.get("model"),
                     "confidence": confidence(r["result"]), "ms": r.get("ms")} for r in done]
    out["attempts"] = errors
    return out


def _consensus(p: dict, settings: dict, req: Request, depth: int) -> dict:
    members = [s for s in (p.get("members") or []) if isinstance(s, str)]
    if len(members) < 2:
        raise AIError(f"profilo «{p['_name']}»: il confronto vuole almeno due profili")
    min_agree = int(p.get("min_agree") or 2)

    def one(n):
        try:
            return _run(settings, n, req, depth + 1)
        except AIError as e:
            return e
    t0 = time.monotonic()
    if p.get("parallel", True):
        with ThreadPoolExecutor(len(members)) as ex:
            res = list(ex.map(one, members))
    else:
        res = [one(n) for n in members]
    ok = [r for r in res if not isinstance(r, AIError)]
    errors = [{"profile": n, "provider": "consensus", "error": str(r)[:200]} for n, r in zip(members, res) if isinstance(r, AIError)]
    if not ok:
        e = AIError(f"confronto «{p['_name']}»: nessun membro ha risposto", retry=True)
        e.attempts = errors
        raise e
    merged = merge([r["result"] for r in ok], min_agree) if len(ok) > 1 else dict(ok[0]["result"])
    if len(ok) < min_agree:   # not enough voices: never «sure»
        merged["confidence"] = min(float(confidence(merged) or 0.49), 0.49)
        merged["_consensus_partial"] = True
    return {"provider": "consensus", "model": " + ".join(str(r.get("model")) for r in ok), "result": merged,
            "usage": _sum_usage(ok), "ms": int((time.monotonic() - t0) * 1000), "attempts": errors,
            "members": [{"profile": r.get("profile"), "provider": r.get("provider"), "model": r.get("model"),
                         "confidence": confidence(r["result"]), "ms": r.get("ms")} for r in ok]}


def call(settings: dict, prompt: str, image=None, schema: dict | None = None, profile_name: str | None = None,
         task: str = "") -> dict:
    """Asks the right profile and returns ``{"provider", "model", "profile", "result", "usage", "ms", "attempts"}``
    (+ ``steps`` for a cascade, ``members`` and ``result._consensus`` for a consensus)."""
    if not chain(settings, pick(settings, profile_name, task)):
        raise AIError("AI spenta: sceglila in Impostazioni › AI")
    t0 = time.monotonic()
    r = _run(settings, pick(settings, profile_name, task), Request(prompt, image, schema, task), 0)
    r["ms_total"] = int((time.monotonic() - t0) * 1000)
    r.setdefault("ms", r["ms_total"])
    return r
