"""Controlli statici sugli script PowerShell (qui non c'è Windows né pwsh: vedi PROGRESS.md).

Non sostituisce il parser di PowerShell. Controlla quello che più spesso rompe uno script su Windows PowerShell 5.1:
  - UTF-8 con BOM (senza BOM la 5.1 legge le lettere accentate come ANSI) e righe CRLF;
  - parentesi (), {}, [] bilanciate fuori da stringhe e commenti; stringhe chiuse;
  - niente sintassi solo di PowerShell 7 (&&, ||, ??, ?., -Parallel, ternario);
  - ogni comando Verbo-Nome usato è un cmdlet noto oppure una funzione definita (refusi nei nomi);
  - ogni `Invoke-Tools @('comando'…)` esiste in docmap_tools.py; i file elencati nel pacchetto esistono;
  - ogni script con `param` carica comune.ps1 dopo il blocco param.
Se `pwsh` è disponibile, in più ogni file passa da [System.Management.Automation.Language.Parser]::ParseFile.
"""
import glob
import os
import re
import shutil
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
INST = os.path.dirname(HERE)
sys.path.insert(0, INST)
import docmap_tools as T  # noqa: E402

SCRIPTS = sorted(glob.glob(os.path.join(INST, "*.ps1")))

KNOWN_CMDLETS = {
    "Add-Content", "Copy-Item", "ConvertFrom-Json", "Disable-ScheduledTask", "Enable-ScheduledTask", "Expand-Archive",
    "ForEach-Object", "Get-ChildItem", "Get-CimInstance", "Get-Command", "Get-Content", "Get-Date", "Get-Item",
    "Get-Location", "Get-NetConnectionProfile", "Get-NetFirewallRule", "Get-ScheduledTask", "Import-Certificate",
    "Join-Path", "Move-Item", "New-Item", "New-NetFirewallRule", "New-Object", "New-ScheduledTaskAction",
    "New-ScheduledTaskPrincipal", "New-ScheduledTaskSettingsSet", "New-ScheduledTaskTrigger", "New-TimeSpan", "Out-Null",
    "Read-Host", "Register-ScheduledTask", "Remove-Item", "Remove-NetFirewallRule", "Resolve-Path", "Select-Object",
    "Set-Content", "Set-Location", "Set-NetConnectionProfile", "Set-StrictMode", "Sort-Object", "Split-Path",
    "Start-Process", "Start-ScheduledTask", "Start-Sleep", "Stop-Process", "Stop-ScheduledTask", "Test-Path",
    "Unregister-ScheduledTask", "Where-Object", "Write-Host",
}


def tokenize(src):
    """Restituisce (codice senza stringhe/commenti, lista di stringhe, errori). Gestisce '..' (con ''), "..." (con `
    e ""), commenti # e <# #>, here-string @' '@ / @" "@."""
    code, strings, errors = [], [], []
    i, n, line = 0, len(src), 1
    while i < n:
        c = src[i]
        if c == "\n":
            line += 1
        if src.startswith("<#", i):
            j = src.find("#>", i + 2)
            if j < 0:
                errors.append("commento <# non chiuso (riga %d)" % line)
                break
            line += src.count("\n", i, j)
            code.append("\n" * src.count("\n", i, j))
            i = j + 2
            continue
        if c == "#":
            j = src.find("\n", i)
            i = n if j < 0 else j
            continue
        if src.startswith("@'", i) or src.startswith('@"', i):
            q = src[i + 1]
            j = src.find("\n" + q + "@", i)
            if j < 0:
                errors.append("here-string non chiusa (riga %d)" % line)
                break
            strings.append(src[i + 2:j])
            line += src.count("\n", i, j + 2)
            code.append(" S ")
            i = j + 3
            continue
        if c == "'":
            j, buf = i + 1, []
            while j < n:
                if src[j] == "'" and j + 1 < n and src[j + 1] == "'":
                    buf.append("'")
                    j += 2
                    continue
                if src[j] == "'":
                    break
                buf.append(src[j])
                j += 1
            if j >= n:
                errors.append("stringa ' non chiusa (riga %d)" % line)
                break
            strings.append("".join(buf))
            line += "".join(buf).count("\n")
            code.append(" S ")
            i = j + 1
            continue
        if c == '"':
            j, buf, depth = i + 1, [], 0
            while j < n:
                ch = src[j]
                if ch == "`":
                    buf.append(src[j:j + 2])
                    j += 2
                    continue
                if ch == "$" and src.startswith("$(", j):
                    depth += 1
                    buf.append("$(")
                    j += 2
                    continue
                if depth and ch == ")":
                    depth -= 1
                if ch == '"' and not depth:
                    if j + 1 < n and src[j + 1] == '"':
                        buf.append('"')
                        j += 2
                        continue
                    break
                buf.append(ch)
                j += 1
            if j >= n:
                errors.append('stringa " non chiusa (riga %d)' % line)
                break
            strings.append("".join(buf))
            line += "".join(buf).count("\n")
            code.append(" S ")
            i = j + 1
            continue
        if c == "`" and i + 1 < n:      # continuazione di riga o carattere escapato
            code.append(" ")
            i += 2
            continue
        code.append(c)
        i += 1
    return "".join(code), strings, errors


def balance(code):
    pairs = {")": "(", "}": "{", "]": "["}
    stack, line = [], 1
    for ch in code:
        if ch == "\n":
            line += 1
        elif ch in "({[":
            stack.append((ch, line))
        elif ch in ")}]":
            if not stack or stack[-1][0] != pairs[ch]:
                return "'%s' in più o sbagliata alla riga %d" % (ch, line)
            stack.pop()
    if stack:
        return "'%s' aperta alla riga %d non chiusa" % stack[-1]
    return None


def read(path):
    with open(path, "rb") as f:
        return f.read()


class PowerShellLint(unittest.TestCase):
    def test_scripts_present(self):
        names = {os.path.basename(s) for s in SCRIPTS}
        self.assertTrue({"installa.ps1", "comune.ps1", "backup.ps1", "ripristina.ps1", "aggiorna.ps1", "disinstalla.ps1",
                         "licenza.ps1"} <= names, names)
        for f in T.INSTALLER_FILES:
            self.assertTrue(os.path.isfile(os.path.join(INST, f)), f)

    def test_encoding_and_line_endings(self):
        for s in SCRIPTS + [os.path.join(INST, "installa.bat")]:
            raw = read(s)
            if s.endswith(".ps1"):
                self.assertTrue(raw.startswith(b"\xef\xbb\xbf"), "%s: manca il BOM UTF-8" % s)
            self.assertNotIn(b"\n", raw.replace(b"\r\n", b""), "%s: righe non CRLF" % s)
            raw.decode("utf-8")

    def test_syntax_basics(self):
        for s in SCRIPTS:
            src = read(s).decode("utf-8-sig").replace("\r\n", "\n")
            code, strings, errors = tokenize(src)
            self.assertEqual(errors, [], s)
            self.assertIsNone(balance(code), s)
            for bad, why in ((r"&&", "&& (solo PS7)"), (r"\|\|", "|| (solo PS7)"), (r"\?\?", "?? (solo PS7)"),
                             (r"\?\.", "?. (solo PS7)"), (r"-Parallel\b", "-Parallel (solo PS7)"),
                             (r"\s\?\s[^{]*\s:\s", "operatore ternario (solo PS7)")):
                m = re.search(bad, code)
                self.assertIsNone(m, "%s: %s" % (os.path.basename(s), why))

    def test_commands_known_or_defined(self):
        defined = set()
        for s in SCRIPTS:
            code, _, _ = tokenize(read(s).decode("utf-8-sig").replace("\r\n", "\n"))
            defined |= set(re.findall(r"(?im)^\s*function\s+([A-Za-z]+-[A-Za-z]+)", code))
        self.assertIn("Invoke-Tools", defined)
        for s in SCRIPTS:
            code, _, _ = tokenize(read(s).decode("utf-8-sig").replace("\r\n", "\n"))
            used = set(re.findall(r"(?<![\w$.:-])([A-Z][a-z]+-[A-Z][A-Za-z]+)\b", code))
            unknown = used - defined - KNOWN_CMDLETS
            self.assertEqual(unknown, set(), "%s: comandi sconosciuti (refuso?)" % os.path.basename(s))

    def test_common_loaded_after_param(self):
        for s in SCRIPTS:
            if s.endswith("comune.ps1"):
                continue
            code, _, _ = tokenize(read(s).decode("utf-8-sig").replace("\r\n", "\n"))
            self.assertRegex(code, r"(?m)^\.\s+S\s*$", s)                  # . "$PSScriptRoot\comune.ps1"
            src = read(s).decode("utf-8-sig")
            if "param(" in src:
                self.assertLess(src.index("param("), src.index('. "$PSScriptRoot\\comune.ps1"'), s)
            self.assertIn("Test-Admin", src, s)

    def test_tools_subcommands_exist(self):
        src_tools = read(os.path.join(INST, "docmap_tools.py")).decode("utf-8")
        cmds = set(re.findall(r'sub\.add_parser\("([a-z-]+)"', src_tools))
        used = set()
        for s in SCRIPTS:
            src = read(s).decode("utf-8-sig")
            used |= set(re.findall(r"Invoke-Tools\s+@\('([a-z-]+)'", src))
            if re.search(r"Invoke-Tools\s+\$impArgs", src):          # $impArgs = @('impostazioni', ...)
                used.add("impostazioni")
            used |= set(re.findall(r"\$tools,\s*'([a-z-]+)'", src))
        self.assertTrue(used, "nessun comando trovato")
        used = {u for u in used if not u.startswith("-")}
        self.assertEqual(used - cmds, set())
        for c in ("backup", "ripristina", "verifica-zip", "ping", "config-js", "cert", "pagina-indirizzo", "controlla-pacchetto"):
            self.assertIn(c, used)

    def test_install_copies_every_package_file(self):
        src = read(os.path.join(INST, "comune.ps1")).decode("utf-8-sig")
        m = re.search(r"foreach \(\$f in @\(('[^)]*)\)\)", src, re.S)
        listed = set(re.findall(r"'([^']+)'", m.group(1)))
        self.assertEqual(set(T.INSTALLER_FILES) - listed, set())

    def test_bat_wrapper(self):
        bat = read(os.path.join(INST, "installa.bat")).decode("ascii")
        self.assertIn("-ExecutionPolicy Bypass", bat)
        self.assertIn('-File "%~dp0installa.ps1"', bat)

    def test_tokenizer_self_check(self):
        code, strings, errors = tokenize("Write-Host 'a''b (' \"x $($p.A) `\" )\" # ( commento\n<# { #> $a = @(1)\n")
        self.assertEqual(errors, [])
        self.assertIsNone(balance(code))
        self.assertEqual(strings[0], "a'b (")
        self.assertIsNotNone(balance(tokenize("if ($a) { Write-Host 'x' \n")[0]))
        self.assertTrue(tokenize("Write-Host 'aperta\n")[2])

    @unittest.skipUnless(shutil.which("pwsh"), "pwsh non disponibile")
    def test_pwsh_parser(self):
        for s in SCRIPTS:
            cmd = ("$e=$null; $t=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('%s',[ref]$t,[ref]$e); "
                   "if ($e) { $e | ForEach-Object { $_.ToString() }; exit 1 }" % s.replace("'", "''"))
            r = subprocess.run(["pwsh", "-NoProfile", "-Command", cmd], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, "%s: %s" % (s, r.stdout + r.stderr))


if __name__ == "__main__":
    unittest.main()
