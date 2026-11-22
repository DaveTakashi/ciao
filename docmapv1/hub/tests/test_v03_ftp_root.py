"""v0.3.1: FTP account closed in its home folder (SiteGround): the panel path
/docmap.example.it/public_html/studio-de must resolve to /studio-de, not be created as a new tree."""
import tempfile
import unittest
from pathlib import Path

try:
    from test_v02_deploy import HAVE_FTP, start_ftp
except Exception:  # pragma: no cover
    HAVE_FTP = False

from docmap_hub.deploy import FTPRemote


@unittest.skipUnless(HAVE_FTP, "pyftpdlib non installato")
class FtpRootTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)  # = /docmap.example.it/public_html/ on the hosting
        (self.home / "studio-de" / "server-php").mkdir(parents=True)
        (self.home / "studio-de" / "DEPLOY-MANIFEST.txt").write_text("x", "utf-8")
        self.srv, self.port, self.stop = start_ftp(self.home)

    def tearDown(self):
        self.stop()
        self.tmp.cleanup()

    def remote(self, root):
        return FTPRemote("127.0.0.1", self.port, "dave", "pw-ftp-test", root, tls=False)

    def test_panel_path_resolves_to_chroot_path(self):
        r = self.remote("/docmap.example.it/public_html/studio-de/")
        try:
            self.assertEqual(r.root, "/studio-de")
            self.assertIn("/studio-de", r.root_note)
            self.assertIn("DEPLOY-MANIFEST.txt", r.list_files())
        finally:
            r.close()
        self.assertFalse((self.home / "docmap.example.it").exists())

    def test_correct_path_has_no_note(self):
        r = self.remote("/studio-de")
        try:
            self.assertEqual((r.root, r.root_note), ("/studio-de", None))
        finally:
            r.close()

    def test_missing_folder_is_kept_with_warning(self):
        r = self.remote("/studio-nuovo")
        try:
            self.assertEqual(r.root, "/studio-nuovo")
            self.assertIn("verrà creata", r.root_note)
        finally:
            r.close()


if __name__ == "__main__":
    unittest.main()
