"""Tools ("Strumenti"): recipes that chain reusable blocks to process whole folders of files.

A recipe (JSON, format ``docmap-ricetta/1``) is a list of steps; every step uses one block from the registry
(``blocks/``). The engine runs a recipe on one sample file (preview) or on whole folders (job), locally or on a
remote worker (the hub / a central server) through the same HTTP API. Design: docs/STRUMENTI.md.
"""

__version__ = "0.1.1"
RECIPE_FORMAT = "docmap-ricetta/1"
