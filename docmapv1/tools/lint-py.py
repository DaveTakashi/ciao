#!/usr/bin/env python3
"""DocMap — static checks of the Python code (hub, server-python, installer-windows, tools).

Fails only on messages that are always bugs: undefined names, names used before assignment, a function redefined
in the same module, `return`/`yield` outside a function, duplicate dict keys, `is` against a literal, broken
format strings. Unused imports and f-strings without placeholders are reported as a count (not an error): cleaning
them is welcome but not urgent.

Run:  python3 docmapv1/tools/lint-py.py        (needs `pip install pyflakes`; without it only compiles the files)
"""
import os
import sys
import py_compile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIRS = ['hub', 'server-python', 'installer-windows', 'tools', 'strumenti']
SKIP_DIRS = {'__pycache__', '.venv', 'venv', 'node_modules', 'dati', 'data'}


def py_files():
    for d in DIRS:
        for base, dirs, files in os.walk(os.path.join(ROOT, d)):
            dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
            for f in files:
                if f.endswith('.py'):
                    yield os.path.join(base, f)


def main():
    files = sorted(py_files())
    errors, notes = [], 0
    try:
        from pyflakes import api, messages as M, reporter
    except ImportError:
        api = None
    if api is None:
        for f in files:
            try:
                py_compile.compile(f, doraise=True, cfile=os.devnull)
            except py_compile.PyCompileError as e:
                errors.append(str(e))
        for e in errors:
            print('  ✗', e)
        print('lint-py: pyflakes not installed (pip install pyflakes): only compiled %d files' % len(files))
        print(('✗ lint-py: %d problems' % len(errors)) if errors else 'OK lint-py: compiled')
        return 1 if errors else 0

    SERIOUS = tuple(getattr(M, n) for n in (
        'UndefinedName', 'UndefinedLocal', 'UndefinedExport', 'RedefinedWhileUnused', 'ReturnOutsideFunction',
        'YieldOutsideFunction', 'ContinueOutsideLoop', 'BreakOutsideLoop', 'MultiValueRepeatedKeyLiteral',
        'MultiValueRepeatedKeyVariable', 'IsLiteral', 'PercentFormatInvalidFormat', 'PercentFormatMixedPositionalAndNamed',
        'PercentFormatPositionalCountMismatch', 'PercentFormatMissingArgument', 'StringDotFormatMissingArgument',
        'StringDotFormatInvalidFormat', 'DuplicateArgument', 'DoctestSyntaxError',
        'ForwardAnnotationSyntaxError', 'RaiseNotImplemented', 'InvalidPrintSyntax', 'DefaultExceptNotLast',
        'TooManyExpressionsInStarredAssignment', 'TwoStarredExpressions', 'AssertTuple', 'IfTuple',
    ) if hasattr(M, n))

    class Collect(reporter.Reporter):
        def __init__(self):
            pass

        def unexpectedError(self, filename, msg):
            errors.append('%s: %s' % (os.path.relpath(filename, ROOT), msg))

        def syntaxError(self, filename, msg, lineno, offset, text):
            errors.append('%s:%s: syntax error: %s' % (os.path.relpath(filename, ROOT), lineno, msg))

        def flake(self, message):
            nonlocal notes
            if isinstance(message, SERIOUS):
                errors.append('%s:%s: %s' % (os.path.relpath(message.filename, ROOT), message.lineno,
                                             message.message % message.message_args))
            else:
                notes += 1

    rep = Collect()
    for f in files:
        with open(f, encoding='utf-8') as fh:
            api.check(fh.read(), f, rep)
    errors += brand_literals(files)
    for e in errors:
        print('  ✗', e)
    print('  %d Python files, %d minor notes (unused imports, …): run `python3 -m pyflakes hub` to see them'
          % (len(files), notes))
    print(('✗ lint-py: %d problems' % len(errors)) if errors else 'OK lint-py: no problems')
    return 1 if errors else 0


def brand_literals(files):
    """White label: a product name written in a string of the program (tests and the brand tools aside)."""
    if sys.version_info < (3, 12):
        return []   # the checker needs the f-string tokens of 3.12+
    sys.path.insert(0, os.path.join(ROOT, 'tools'))
    import brand_sweep_py as B
    out = []
    for f in files:
        rel = os.path.relpath(f, ROOT).replace(os.sep, '/')
        if '/tests/' in rel or rel.startswith('tools/brand') or rel == 'tools/make_pdf_fonts.py':
            continue
        with open(f, encoding='utf-8') as fh:
            src = fh.read()
        for a, b, kind in B.findings(src):
            out.append('%s:%s: product name written in a string: use the brand reader (tools/brand_sweep_py.py)' % (rel, a[0]))
    return out


if __name__ == '__main__':
    sys.exit(main())
