"""Port manager for the local environments (``local-python``) on Dave's PC.

* Ports come from a configurable range (default 18400-18999, setting
  ``ports.range`` = ``"18400-18999"``).
* Reservations live in the registry table ``port_reservations`` whose
  primary key is the port: two environments can never hold the same port,
  even with two hub processes (the database enforces it).
* A port is *free* only if nobody is listening on it and it can be bound on
  127.0.0.1 and 0.0.0.0 (and ::1 / :: where IPv6 exists). On Windows the
  bind test uses ``SO_EXCLUSIVEADDRUSE`` so that a program bound with
  ``SO_REUSEADDR`` is not missed.
* :meth:`PortManager.ensure` (called before starting an environment) keeps
  the reserved port if still free, otherwise moves the environment to a new
  free port and logs ``port.move``.
"""

from __future__ import annotations

import errno
import socket
import sqlite3
import sys
from datetime import datetime, timezone

from .licence import format_time
from .registry import Registry, RegistryError

DEFAULT_RANGE = (18400, 18999)
SETTING = "ports.range"
# Ports we never hand out even if inside the configured range.
NEVER = {8765, 8080, 8443, 3306, 5432}


class PortError(RegistryError):
    pass


def _now() -> str:
    return format_time(datetime.now(timezone.utc))


def _bind_ok(family: int, host: str, port: int) -> bool | None:
    """True = could bind, False = in use, None = address family/host not available here."""
    try:
        s = socket.socket(family, socket.SOCK_STREAM)
    except OSError:
        return None
    try:
        if sys.platform.startswith("win") and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            s.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        if family == socket.AF_INET6 and hasattr(socket, "IPV6_V6ONLY"):
            try:
                s.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
            except OSError:
                pass
        s.bind((host, port))
        return True
    except OSError as exc:
        if exc.errno in (errno.EADDRNOTAVAIL, errno.EAFNOSUPPORT, getattr(errno, "WSAEADDRNOTAVAIL", -1)):
            return None
        return False
    finally:
        s.close()


def _someone_listening(family: int, host: str, port: int, timeout: float = 0.25) -> bool:
    try:
        s = socket.socket(family, socket.SOCK_STREAM)
    except OSError:
        return False
    s.settimeout(timeout)
    try:
        return s.connect_ex((host, port)) == 0
    except OSError:
        return False
    finally:
        s.close()


def is_free(port: int) -> bool:
    """Actual availability probe (no reservation check)."""
    if not (1 <= int(port) <= 65535):
        return False
    if _someone_listening(socket.AF_INET, "127.0.0.1", port):
        return False
    if socket.has_ipv6 and _someone_listening(socket.AF_INET6, "::1", port):
        return False
    probes = [(socket.AF_INET, "127.0.0.1"), (socket.AF_INET, "0.0.0.0")]
    if socket.has_ipv6:
        probes += [(socket.AF_INET6, "::1"), (socket.AF_INET6, "::")]
    for fam, host in probes:
        if _bind_ok(fam, host, port) is False:
            return False
    return True


def parse_range(text: str | None) -> tuple[int, int]:
    if not text:
        return DEFAULT_RANGE
    try:
        a, b = (int(x) for x in str(text).replace(":", "-").split("-", 1))
    except ValueError:
        raise PortError(f"Intervallo di porte non valido: '{text}' (es. 18400-18999).")
    if not (1024 <= a < b <= 65535):
        raise PortError("L'intervallo deve stare tra 1024 e 65535 e contenere almeno due porte.")
    return a, b


class PortManager:
    def __init__(self, registry: Registry, probe=is_free):
        self.reg = registry
        self.probe = probe

    @property
    def range(self) -> tuple[int, int]:
        return parse_range(self.reg.get_setting(SETTING))

    def set_range(self, start: int, end: int) -> tuple[int, int]:
        a, b = parse_range(f"{start}-{end}")
        self.reg.set_setting(SETTING, f"{a}-{b}")
        return a, b

    def reserved(self, env_id: str) -> int | None:
        r = self.reg.conn.execute("SELECT port FROM port_reservations WHERE env_id=?", (env_id,)).fetchone()
        return int(r[0]) if r else None

    def owner(self, port: int) -> str | None:
        r = self.reg.conn.execute("SELECT env_id FROM port_reservations WHERE port=?", (port,)).fetchone()
        return r[0] if r else None

    def _candidates(self, preferred: int | None):
        a, b = self.range
        taken = {int(r[0]) for r in self.reg.conn.execute("SELECT port FROM port_reservations")}
        order = list(range(a, b + 1))
        if preferred and a <= preferred <= b:
            order.remove(preferred)
            order.insert(0, preferred)
        for p in order:
            if p not in taken and p not in NEVER:
                yield p

    def allocate(self, env_id: str, preferred: int | None = None) -> int:
        """Reserve a free port for the environment (keeps an existing reservation)."""
        self.reg.get_environment(env_id)
        cur = self.reserved(env_id)
        if cur is not None:
            return cur
        for p in self._candidates(preferred):
            if not self.probe(p):
                continue
            try:
                with self.reg.conn:
                    self.reg.conn.execute("INSERT INTO port_reservations(port, env_id, reserved_at) VALUES(?,?,?)",
                                          (p, env_id, _now()))
                    self.reg.conn.execute("UPDATE environments SET port=? WHERE id=?", (p, env_id))
                    self.reg.log("port.reserve", "environment", env_id, {"port": p}, commit=False)
                return p
            except sqlite3.IntegrityError:
                # another hub process took it in the meantime, or env already has one
                cur = self.reserved(env_id)
                if cur is not None:
                    return cur
                continue
        a, b = self.range
        raise PortError(f"Nessuna porta libera nell'intervallo {a}-{b}. Allargalo con: ports set-range …")

    def release(self, env_id: str) -> int | None:
        cur = self.reserved(env_id)
        if cur is None:
            return None
        with self.reg.conn:
            self.reg.conn.execute("DELETE FROM port_reservations WHERE env_id=?", (env_id,))
            self.reg.conn.execute("UPDATE environments SET port=NULL WHERE id=?", (env_id,))
            self.reg.log("port.release", "environment", env_id, {"port": cur}, commit=False)
        return cur

    def ensure(self, env_id: str) -> tuple[int, int | None]:
        """Port to start the environment on: ``(port, moved_from)``.

        If the reserved port is now used by another program, the reservation
        moves to a new free port (logged as ``port.move``). Call it only when
        the environment itself is not running (it would see its own port busy).
        """
        cur = self.reserved(env_id)
        if cur is None:
            return self.allocate(env_id), None
        a, b = self.range
        if a <= cur <= b and self.probe(cur):
            return cur, None
        # move: reserve the new port first, then drop the old one (never zero reservations)
        for p in self._candidates(None):
            if p == cur or not self.probe(p):
                continue
            try:
                with self.reg.conn:
                    self.reg.conn.execute("UPDATE port_reservations SET port=?, reserved_at=? WHERE env_id=?",
                                          (p, _now(), env_id))
                    self.reg.conn.execute("UPDATE environments SET port=? WHERE id=?", (p, env_id))
                    self.reg.log("port.move", "environment", env_id,
                                 {"from": cur, "to": p, "reason": "porta occupata da un altro programma"
                                  if a <= cur <= b else "porta fuori dall'intervallo"}, commit=False)
                return p, cur
            except sqlite3.IntegrityError:
                continue
        raise PortError(f"La porta {cur} è occupata e non ci sono altre porte libere nell'intervallo {a}-{b}.")

    def list(self, probe: bool = True) -> list[dict]:
        rows = [dict(r) for r in self.reg.conn.execute(
            "SELECT p.port, p.env_id, p.reserved_at, e.name AS env_name, e.status, i.label AS instance_label "
            "FROM port_reservations p JOIN environments e ON e.id=p.env_id JOIN instances i ON i.id=e.instance_id "
            "ORDER BY p.port")]
        if probe:
            for r in rows:
                r["free_now"] = self.probe(r["port"])
        return rows
