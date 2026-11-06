"""App 26.12.6: static checks of docmapv1/tools/aggiorna-app.ps1 + AGGIORNA-DOCMAP.bat (the PC app updater), with the
same lint as the installer scripts (no Windows here), plus the version pattern against the real 02-core.js."""
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import test_powershell_lint as PL  # noqa: E402

APP = os.path.dirname(os.path.dirname(HERE))
PS = os.path.join(APP, "tools", "aggiorna-app.ps1")
BAT = os.path.join(APP, "AGGIORNA-DOCMAP.bat")
EXTRA = {"Select-String", "Write-Host", "Read-Host", "Expand-Archive", "Get-Item", "Remove-Item", "Copy-Item", "New-Item"}


class UpdaterLint(unittest.TestCase):
    def test_encoding(self):
        raw = PL.read(PS)
        self.assertTrue(raw.startswith(b"\xef\xbb\xbf"))
        for f in (PS, BAT):
            r = PL.read(f)
            self.assertNotIn(b"\n", r.replace(b"\r\n", b""), f)
            r.decode("utf-8")

    def test_syntax_and_commands(self):
        src = PL.read(PS).decode("utf-8-sig").replace("\r\n", "\n")
        code, strings, errors = PL.tokenize(src)
        self.assertEqual(errors, [])
        self.assertIsNone(PL.balance(code))
        for bad in (r"&&", r"\|\|", r"\?\?", r"\?\."):
            self.assertIsNone(re.search(bad, code), bad)
        defined = set(re.findall(r"(?im)^\s*function\s+([A-Za-z]+-[A-Za-z]+)", code))
        used = set(re.findall(r"(?<![\w$.:-])([A-Z][a-z]+-[A-Z][A-Za-z]+)\b", code))
        self.assertEqual(used - defined - PL.KNOWN_CMDLETS - EXTRA, set())

    def test_no_drive_style_variable_in_strings(self):
        """"$x: text" is a parse error in PowerShell ($x: = drive/scope syntax): write "${x}: text"."""
        _, strings, _ = PL.tokenize(PL.read(PS).decode("utf-8-sig").replace("\r\n", "\n"))
        for s in strings:
            self.assertIsNone(re.search(r"\$(?!env:|script:|global:)[A-Za-z_]\w*:", s), s)

    def test_version_pattern_matches_the_app(self):
        src = PL.read(PS).decode("utf-8-sig")
        pat = re.search(r"-Pattern \"(.+?)\"", src).group(1)
        with open(os.path.join(APP, "assets", "js", "02-core.js"), encoding="utf-8") as f:
            core = f.read()
        m = re.search(pat, core)
        self.assertIsNotNone(m)
        self.assertRegex(m.group(1), r"^\d+\.\d+\.\d+$")

    def test_never_touches_browser_data_and_backs_up_first(self):
        src = PL.read(PS).decode("utf-8-sig")
        self.assertLess(src.index("DocMap-copie"), src.index("File nuovi nella stessa cartella"))
        self.assertNotRegex(src, r"(?i)Remove-Item[^\n]*\$app")          # never deletes the app folder
        self.assertIn("tools\\aggiorna-app.ps1", PL.read(BAT).decode("utf-8"))


if __name__ == "__main__":
    unittest.main()
