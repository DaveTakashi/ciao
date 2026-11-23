"""Price list (one source: plans.json) and per-customer quotes (overrides stored with the customer).

    listino        = plans.json → "plans.<id>.price", "modules", "services", "rules"   (same for everybody)
    preventivo     = customers.extra["preventivo"]: only what differs for that customer (plan, discount, agreed fee,
                     modules, set-up, notes, validity). Everything it does not say comes from the price list, so a
                     list price change reaches every customer without a custom quote, and never touches the ones
                     that have an agreed price.

docs/commerciale/LISTINO.md is generated from plans.json (``render_markdown``): never edit it by hand.
"""

from __future__ import annotations

import json
from pathlib import Path

from .branding import customer_extra
from .registry import RegistryError
from .service import PLANS_FILE

QUOTE_KEYS = ("plan", "billing", "monthly_eur", "discount_pct", "modules", "setup_eur", "notes", "valid_until")


def load_listino(data_dir: Path | None = None) -> dict:
    """The bundled plans.json with the plans of ``<data dir>/plans.json`` on top (prices fall back to the bundle)."""
    base = json.loads(PLANS_FILE.read_text("utf-8"))
    if data_dir is not None and (Path(data_dir) / "plans.json").exists():
        local = json.loads((Path(data_dir) / "plans.json").read_text("utf-8"))
        for pid, p in (local.get("plans") or {}).items():
            merged = dict(base["plans"].get(pid, {}))
            merged.update(p)
            if "price" not in p and "price" in base["plans"].get(pid, {}):
                merged["price"] = base["plans"][pid]["price"]
            base["plans"][pid] = merged
        for k in ("listino", "modules", "services", "rules"):
            if k in local:
                base[k] = local[k]
    return base


def _eur(v) -> str:
    if v is None:
        return "—"
    v = float(v)
    s = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return (s[:-3] if s.endswith(",00") else s) + " €"


def list_price(listino: dict, plan: str, billing: str = "monthly") -> float | None:
    p = (listino["plans"].get(plan) or {}).get("price") or {}
    return p.get("yearly_eur" if billing == "yearly" else "monthly_eur")


def quote(listino: dict, customer: dict) -> dict:
    """Computed quote of a customer: list price, agreed price and what makes the difference."""
    q = dict(customer_extra(customer).get("preventivo") or {})
    plan = q.get("plan") or "studio"
    if plan not in listino["plans"]:
        raise RegistryError(f"Piano sconosciuto nel preventivo: {plan}")
    billing = q.get("billing") or "monthly"
    lp = list_price(listino, plan, billing) or 0
    mods = []
    for m in q.get("modules") or []:
        md = listino.get("modules", {}).get(m)
        if md is None:
            raise RegistryError(f"Modulo sconosciuto nel preventivo: {m}")
        mods.append({"id": m, "label": md["label"], "eur": md.get("yearly_eur" if billing == "yearly" else "monthly_eur") or 0})
    list_total = lp + sum(m["eur"] for m in mods)
    if q.get("monthly_eur") is not None:
        agreed, how = float(q["monthly_eur"]) * (10 if billing == "yearly" else 1), "canone concordato"
    elif q.get("discount_pct"):
        agreed, how = round(list_total * (1 - float(q["discount_pct"]) / 100), 2), f"sconto {float(q['discount_pct']):g}%"
    else:
        agreed, how = list_total, "listino"
    setup = q.get("setup_eur")
    if setup is None:
        setup = (listino["plans"][plan].get("price") or {}).get("setup_eur")
    return {"customer": customer.get("name"), "plan": plan, "plan_label": listino["plans"][plan].get("label", plan),
            "billing": billing, "list_eur": list_total, "agreed_eur": agreed, "how": how, "modules": mods,
            "setup_eur": setup, "notes": q.get("notes") or "", "valid_until": q.get("valid_until") or "",
            "custom": bool(q)}


def set_quote(reg, customer_id: str, changes: dict, clear: bool = False) -> dict:
    """Store (merge) the quote of a customer; ``None`` values remove a field; ``clear`` removes the whole quote."""
    c = reg.get_customer(customer_id)
    q = {} if clear else dict(customer_extra(c).get("preventivo") or {})
    for k, v in changes.items():
        if k not in QUOTE_KEYS:
            raise RegistryError(f"Campo del preventivo sconosciuto: {k}")
        if v is None:
            q.pop(k, None)
        else:
            q[k] = v
    if q.get("billing") not in (None, "monthly", "yearly"):
        raise RegistryError("billing: monthly oppure yearly")
    if q.get("discount_pct") is not None and not 0 <= float(q["discount_pct"]) <= 100:
        raise RegistryError("Sconto fra 0 e 100")
    reg.update_customer(customer_id, extra={"preventivo": q or None})
    return q


def render_markdown(listino: dict, brand_name: str) -> str:
    """docs/commerciale/LISTINO.md (generated)."""
    L = listino.get("listino", {})
    out = [f"# Listino {brand_name} ({L.get('status', 'bozza')})", "",
           "> **File generato** da `hub/docmap_hub/plans.json` (unica fonte dei prezzi): non modificarlo a mano.",
           "> Cambia i prezzi in `plans.json`, poi: `python -m docmap_hub listino --md ../docs/commerciale/LISTINO.md`.",
           f"> {L.get('vat_note', '')} {L.get('yearly_note', '')} Aggiornato al {L.get('updated', '')}.",
           "> I prezzi concordati con un singolo cliente non vanno qui: sono il suo **preventivo** (`cliente preventivo`).",
           "", "## Piani", "", "| Piano | Per chi | Incluso | Al mese | All'anno |", "|---|---|---|---|---|"]
    order = L.get("order") or list(listino["plans"])
    for pid in order:
        p = listino["plans"].get(pid)
        if not p or "price" not in p:
            continue
        pr = p["price"]
        extra = ""
        if pr.get("setup_eur"):
            extra = f" + {_eur(pr['setup_eur'])} una tantum"
        if pr.get("tiers"):
            extra += "; " + ", ".join(f"fino a {t['up_to_instances']} istanze {_eur(t['monthly_eur'])}/mese" for t in pr["tiers"])
            if pr.get("extra_instance_monthly_eur"):
                extra += f", oltre {_eur(pr['extra_instance_monthly_eur'])}/mese per istanza"
        out.append(f"| **{p.get('label', pid)}** (`{pid}`) | {pr.get('for', '')} | {pr.get('included', '')}{extra} | "
                   f"**{_eur(pr.get('monthly_eur'))}** | {_eur(pr.get('yearly_eur'))} |")
    out += ["", "## Moduli aggiuntivi", "", "| Modulo | Al mese | All'anno | Note |", "|---|---|---|---|"]
    for mid, m in (listino.get("modules") or {}).items():
        out.append(f"| {m['label']} (`{mid}`) | {_eur(m.get('monthly_eur'))} | {_eur(m.get('yearly_eur'))} | {m.get('note', '')} |")
    out += ["", "## Servizi", "", "| Servizio | Prezzo |", "|---|---|"]
    for sid, s in (listino.get("services") or {}).items():
        price = _eur(s.get("from_eur")) + (f" – {_eur(s['to_eur'])}" if s.get("to_eur") else "") + " una tantum"
        if not s.get("to_eur"):
            price = "da " + _eur(s.get("from_eur"))
        out.append(f"| {s['label']} | {price}{' (' + s['note'] + ')' if s.get('note') else ''} |")
    out += ["", "## Regole", ""] + [f"- {r}" for r in listino.get("rules") or []]
    out += ["", "## Prezzi per cliente (preventivo)", "",
            "Il preventivo di un cliente contiene solo quello che cambia rispetto al listino: piano, fatturazione",
            "(mensile o annuale), sconto in % **oppure** canone concordato, moduli, avvio, note, validità. Tutto il resto",
            "viene da qui. Comandi: `cliente preventivo <cliente>` (mostra), `cliente preventivo <cliente> --piano studio_pro",
            "--sconto 10 --moduli retention,handover` (imposta), `--azzera` (torna al listino). Guida: docs/MARCHIO.md §5.", ""]
    return "\n".join(out)
