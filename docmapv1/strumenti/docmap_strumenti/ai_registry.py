"""Compatibility name (Strumenti 0.3.0): the agnostic AI layer now lives in the package ``docmap_strumenti.ai``
(one module per provider, catalogue, router with cascade / consensus, plugins). Import from there in new code."""

from __future__ import annotations

from .ai import *  # noqa: F401,F403
from .ai import PROVIDERS as ADAPTERS  # noqa: F401  (0.3.0 name)
from .ai import describe  # noqa: F401
from .ai.base import RETRY_STATUS  # noqa: F401
from .ai.catalogue import CATALOGUE_FILE  # noqa: F401
from .ai.providers.anthropic import ANTHROPIC_VERSION  # noqa: F401
