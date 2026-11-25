"""Workstation gateway: the small server that runs on each of your GPU workstations (Linux, e.g. Kubuntu).

It sits in front of the local model servers (vLLM, Ollama, llama.cpp, SGLang… anything that speaks the OpenAI Chat
Completions dialect) and gives the rest of the system one stable, protected door:

* ``GET  /dm/v1/ping``              no token: is it alive (for monitors)
* ``GET  /dm/v1/health``            token: name, version, published models, queue, GPUs
* ``GET  /v1/models``               token: OpenAI-style list of the published model names
* ``POST /v1/chat/completions``     token: OpenAI-compatible, routed to the backend of the model, with a queue
* ``POST /dm/v1/read``              token: high-level reading (``ocr`` → text, ``json`` → object) for simple clients

Standard library only. Protocol: docs/WORKSTATION-API.md. Install: workstation/README.md.
"""

__version__ = "0.1.1"
API_VERSION = "docmap-workstation/1"
