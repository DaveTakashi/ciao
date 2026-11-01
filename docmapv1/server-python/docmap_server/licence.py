"""Licence hook (to be integrated later by the licensing work).

`current_mode()` is called by api.handle() after authentication for every WRITE route (push, patch, token_create,
token_revoke, journal_restore). It returns:
  'full'      → normal behaviour (the default: identical to server-php/api.php)
  'read_only' → the write is refused with HTTP 403, error.code 'licence_read_only' (reads keep working)

Replace the body of current_mode() (e.g. read a licence file next to the config, verify its signature, cache the
result) without touching api.py. Keep it fast: it runs on every write request.
"""
from __future__ import annotations

from typing import Literal

READ_ONLY_MESSAGE = "licence expired or missing: the server is in read-only mode"


def current_mode() -> Literal["full", "read_only"]:
    return "full"
