"""v0.10.1: the hub finds the DocMap tree (tools/, installer-windows/, server-python/) when its folder was copied or
extracted apart from the rest of the zip, and says where it looked when it cannot."""

import tempfile
import unittest
from pathlib import Path
from unittest import mock

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from docmap_hub import runner as R  # noqa: E402


def tree(root: Path) -> None:
    (root / "tools").mkdir(parents=True)
    (root / "tools" / "build_deploy.py").write_text("# stub\n")
    (root / "installer-windows").mkdir()


class FindTree(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def _hub_at(self, hub_dir: Path):
        pkg = hub_dir / "docmap_hub"
        pkg.mkdir(parents=True)
        return mock.patch.multiple(R, HUB_PKG=pkg, DOCMAPV1=pkg.parent.parent)

    def test_zip_layout(self):
        base = self.tmp / "DocMapHub" / "DocMap-hub-0.10.1"
        tree(base)
        with self._hub_at(base / "hub"):
            self.assertEqual(R.build_deploy_script(None), (base / "tools" / "build_deploy.py").resolve())

    def test_hub_folder_copied_next_to_the_zip(self):
        top = self.tmp / "DocMapHub"
        tree(top / "DocMap-hub-0.10.1")
        with self._hub_at(top / "hub"):          # C:\DocMapHub\hub copied out of the zip folder
            self.assertEqual(R.build_deploy_script(None),
                             (top / "DocMap-hub-0.10.1" / "tools" / "build_deploy.py").resolve())

    def test_windows_extract_all_nesting(self):
        top = self.tmp / "DocMapHub"
        tree(top / "DocMap-hub-0.10.1" / "DocMap-hub-0.10.1")
        with self._hub_at(top / "hub"):
            self.assertTrue(str(R.build_deploy_script(None)).endswith("build_deploy.py"))

    def test_not_found_says_where(self):
        with self._hub_at(self.tmp / "solo" / "hub"):
            with self.assertRaises(R.RunnerError) as cm:
                R.build_deploy_script(None)
        self.assertIn("Cercato in", str(cm.exception))
        self.assertIn("settings set docmap_dir", str(cm.exception))


if __name__ == "__main__":
    unittest.main()
