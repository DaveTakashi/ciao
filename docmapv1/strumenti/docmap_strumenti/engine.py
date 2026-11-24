"""Recipe engine: runs the steps of a recipe over the items, saving the state after every step.

* **Preview** (``preview=True``): one sample file, a temporary folder, a snapshot of every step for the editor.
* **Job**: whole input folder; intermediate files in ``<job>/lavoro/<NN-step>/`` (kept, so every step can be
  inspected), results in the output folder. The state (``stato.json``) is saved after each step: a job that stops at a
  «review» step, or is interrupted, resumes from the next step with the values corrected by people.
* Items in ``error`` or ``skip`` are carried along untouched; an error in one file never stops the others.
"""

from __future__ import annotations

import fnmatch
import json
import os
import re
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import recipe as RC
from . import registry as R
from .items import ERROR, OK, REVIEW, SKIP, Item

HEAVY = {"ocr", "ai", "http", "convert", "image"}   # map blocks worth running on several threads


class Cancelled(Exception):
    pass


class JobError(RuntimeError):
    pass


def natural_key(s: str):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def list_inputs(input_dir: Path, patterns: list, recursive: bool = True, exclude: list | None = None,
                skip_dirs: list | None = None) -> list[Path]:
    input_dir = Path(input_dir)
    if not input_dir.is_dir():
        raise JobError(f"cartella di partenza non trovata: {input_dir}")
    skip = [Path(p).resolve() for p in (skip_dirs or [])]
    pats = [p.lower() for p in (patterns or ["*"])]
    exc = [p.lower() for p in (exclude or [])]
    out = []
    walker = os.walk(input_dir) if recursive else [(str(input_dir), [], [f.name for f in input_dir.iterdir() if f.is_file()])]
    for base, dirs, files in walker:
        b = Path(base).resolve()
        dirs[:] = sorted(d for d in dirs if not d.startswith(".") and (b / d).resolve() not in skip
                         and not any(str((b / d).resolve()).startswith(str(s)) for s in skip))
        for f in files:
            fl = f.lower()
            if f.startswith(".") or fl in ("thumbs.db", "desktop.ini"):
                continue
            if any(fnmatch.fnmatch(fl, p) for p in pats) and not any(fnmatch.fnmatch(fl, p) for p in exc):
                out.append(Path(base) / f)
    return sorted(out, key=lambda p: natural_key(str(p.relative_to(input_dir))))


class Context:
    """What a block can use: folders, settings (providers), metering, counters, cancellation."""

    def __init__(self, job_dir: Path, input_dir: Path | None, output_dir: Path, settings: dict | None = None,
                 preview: bool = False, meter=None, cancel: threading.Event | None = None, progress=None,
                 variables: dict | None = None):
        self.job_dir = Path(job_dir)
        self.input_dir = Path(input_dir) if input_dir else None
        self.output_dir = Path(output_dir)
        self.settings = settings or {}
        self.preview = preview
        self._meter = meter
        self.cancel = cancel or threading.Event()
        self._progress = progress
        self.vars = dict(variables or {})
        self.step = ""
        self.step_index = 0
        self.meters: dict[str, int] = {}
        self._counters: dict[str, int] = {}
        self._lock = threading.Lock()
        self.reports: list[str] = []
        self.cache: dict = {}
        self.all_items: list = []

    def step_dir(self) -> Path:
        d = self.job_dir / "lavoro" / f"{self.step_index:02d}-{self.step}"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def meter(self, kind: str, n: int = 1) -> None:
        with self._lock:
            self.meters[kind] = self.meters.get(kind, 0) + n
        if self._meter:
            self._meter(kind, n)     # may raise (credits finished): the item fails with a clear message

    def counter(self, name: str = "n", start: int = 1) -> int:
        with self._lock:
            v = self._counters.get(name, start - 1) + 1
            self._counters[name] = v
            return v

    def check(self) -> None:
        if self.cancel.is_set():
            raise Cancelled()

    def progress(self, done: int, total: int) -> None:
        if self._progress:
            self._progress(self.step_index, self.step, done, total)


def _save_json(path: Path, data) -> None:
    tmp = path.with_name("." + path.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), "utf-8")
    os.replace(tmp, path)


class Engine:
    def __init__(self, recipe: dict, ctx: Context):
        self.recipe = RC.validate(recipe)
        self.ctx = ctx
        self.snapshots: list[dict] = []

    # -- inputs ---------------------------------------------------------------------------------------------------
    def collect(self, files: list[Path] | None = None) -> list[Item]:
        inp = self.recipe["input"]
        if files is None:
            if self.ctx.input_dir is None:
                raise JobError("manca la cartella di partenza")
            files = list_inputs(self.ctx.input_dir, inp["patterns"], inp["recursive"], inp["exclude"],
                                skip_dirs=[self.ctx.output_dir, self.ctx.job_dir])
        items = []
        for i, f in enumerate(files, 1):
            f = Path(f).resolve()
            try:
                rel = str(f.relative_to(self.ctx.input_dir.resolve())) if self.ctx.input_dir else f.name
            except ValueError:
                rel = f.name
            it = Item(id=f"{i:06d}", path=str(f), src=rel.replace("\\", "/"))
            try:
                it.meta["size"] = f.stat().st_size
            except OSError:
                pass
            items.append(it)
        return items

    # -- run ------------------------------------------------------------------------------------------------------
    def run(self, items: list[Item], start: int = 0, state_file: Path | None = None, on_step=None) -> dict:
        steps = self.recipe["steps"]
        status = "done"
        next_step = len(steps)
        for idx in range(start, len(steps)):
            s = steps[idx]
            self.ctx.check()
            if s.get("enabled") is False:
                continue
            b = R.get(s["block"])
            params = b.resolve(s.get("with"))
            self.ctx.step, self.ctx.step_index = s["id"], idx + 1
            t0 = time.time()
            items = self._run_step(b, params, s, items)
            stat = {"step": s["id"], "block": b.name, "seconds": round(time.time() - t0, 3), **count(items)}
            if self.ctx.preview:
                self.snapshots.append({**stat, "sample": [it.to_dict() for it in items[:20]]})
            if on_step:
                on_step(stat)
            waiting = [it for it in items if it.status == REVIEW and it.meta.get("gate") == s["id"]
                       and not it.meta.get("reviewed")]
            if b.name == "review" and waiting and not self.ctx.preview:
                status, next_step = "waiting_review", idx + 1
                if state_file:
                    _save_json(state_file, self.state(items, next_step, status))
                return self.state(items, next_step, status)
            if state_file:
                _save_json(state_file, self.state(items, idx + 1, "running"))
        res = self.state(items, next_step, status)
        if state_file:
            _save_json(state_file, res)
        return res

    def _run_step(self, b: R.Block, params: dict, s: dict, items: list[Item]) -> list[Item]:
        self.ctx.all_items = items
        cond = RC.parse_condition(s["when"]) if s.get("when") else None
        active = [it for it in items if it.status in (OK, REVIEW) and (cond is None or RC.matches(it, cond))]
        if b.kind == "batch":
            ids = {id(it) for it in active}
            try:
                res = b.fn(active, params, self.ctx) or []
            except Cancelled:
                raise
            except R.ParamError:
                raise
            except Exception as e:   # a batch block failing stops the job: its output is not trustworthy
                raise JobError(f"passo «{s['id']}» ({b.label}): {e}") from e
            # keep the position of the untouched items, put the block results where its first input was
            out, placed = [], False
            for it in items:
                if id(it) in ids:
                    if not placed:
                        out.extend(res)
                        placed = True
                else:
                    out.append(it)
            if not placed:
                out.extend(res)
            return out

        total = len(active)
        done = [0]
        results: dict[int, list[Item]] = {}

        def one(it: Item) -> list[Item]:
            self.ctx.check()
            try:
                r = b.fn(it, params, self.ctx)
            except Cancelled:
                raise
            except Exception as e:  # one bad file never stops the others
                it.status = ERROR
                it.flags.append(f"{s['id']}: {e}"[:300])
                it.note(s["id"], f"errore: {e}")
                r = it
            if r is None:
                return []
            return r if isinstance(r, list) else [r]

        threads = int(self.ctx.settings.get("threads") or 2) if b.name in HEAVY else 1
        if threads > 1 and total > 1:
            with ThreadPoolExecutor(max_workers=threads) as ex:
                futs = {id(it): ex.submit(one, it) for it in active}
                for it in active:
                    results[id(it)] = futs[id(it)].result()
                    done[0] += 1
                    self.ctx.progress(done[0], total)
        else:
            for it in active:
                results[id(it)] = one(it)
                done[0] += 1
                self.ctx.progress(done[0], total)
        out = []
        for it in items:
            out.extend(results.get(id(it), [it]) if id(it) in results else [it])
        return out

    def state(self, items: list[Item], next_step: int, status: str) -> dict:
        return {"recipe": self.recipe, "next_step": next_step, "status": status, "items": [it.to_dict() for it in items],
                "totals": count(items), "meters": dict(self.ctx.meters), "reports": list(self.ctx.reports)}


def count(items: list[Item]) -> dict:
    c = {"items": len(items), OK: 0, REVIEW: 0, ERROR: 0, SKIP: 0}
    for it in items:
        c[it.status] = c.get(it.status, 0) + 1
    return c


def load_state(state_file: Path) -> tuple[dict, list[Item]]:
    st = json.loads(Path(state_file).read_text("utf-8"))
    return st, [Item.from_dict(d) for d in st.get("items", [])]


def preview(recipe: dict, sample: Path, settings: dict | None = None, work_dir: Path | None = None,
            upto: int | None = None) -> dict:
    """Runs the recipe on ONE file in a temporary folder and returns what every step produced."""
    import tempfile
    base = Path(work_dir) if work_dir else Path(tempfile.mkdtemp(prefix="docmap-prova-"))
    base.mkdir(parents=True, exist_ok=True)
    rec = RC.validate(recipe)
    # the recipe works on a copy of the sample (and of its «.txt» companion): the original is never touched
    camp = base / "campione"
    camp.mkdir(parents=True, exist_ok=True)
    sample = Path(sample)
    shutil.copy2(sample, camp / sample.name)
    for side in (sample.with_name(sample.name + ".txt"), sample.with_suffix(".txt")):
        if side.is_file() and side != sample:
            shutil.copy2(side, camp / side.name)
    sample = camp / sample.name
    if upto is not None:
        rec = dict(rec, steps=rec["steps"][: max(1, upto)])
    ctx = Context(base, Path(sample).parent, base / "uscita", settings, preview=True)
    eng = Engine(rec, ctx)
    items = eng.collect([Path(sample)])
    try:
        res = eng.run(items)
        err = ""
    except (JobError, R.ParamError) as e:
        res, err = {"items": [], "totals": {}, "meters": ctx.meters}, str(e)
    outputs = []
    if (base / "uscita").is_dir():
        for p in sorted((base / "uscita").rglob("*")):
            if p.is_file():
                outputs.append(str(p.relative_to(base / "uscita")).replace("\\", "/"))
    return {"steps": eng.snapshots, "items": res.get("items", []), "totals": res.get("totals", {}),
            "meters": res.get("meters", {}), "outputs": outputs, "work_dir": str(base), "error": err}


def clean_dir(d: Path) -> None:
    shutil.rmtree(d, ignore_errors=True)
