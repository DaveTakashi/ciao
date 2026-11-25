"""Built-in provider modules. Importing this package registers them all (``base.PROVIDERS``).
One file per provider family; a new provider is a new file here or a plugin (docs/AI-FORNITORI.md §7)."""

from . import anthropic, gemini, local, openai_chat  # noqa: F401
