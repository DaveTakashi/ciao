"""setup refuses to pair an existing docmap.sqlite with a new key (v12.4 rule, same as setup.php)."""
import os, subprocess, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SRV = os.path.dirname(HERE)


def run(*a):
    return subprocess.run([sys.executable, "-m", "docmap_server", "setup", *a], cwd=SRV, capture_output=True, text=True)


class SetupTest(unittest.TestCase):
    def test_refuses_existing_database(self):
        with tempfile.TemporaryDirectory() as t:
            d = os.path.join(t, "dati"); os.makedirs(d)
            open(os.path.join(d, "docmap.sqlite"), "wb").close()
            r = run("--config", os.path.join(t, "config.json"), "--data-dir", d, "--user", "dave,admin")
            self.assertEqual(r.returncode, 4, r.stderr)
            self.assertIn("docmap.sqlite", r.stderr)
            self.assertFalse(os.path.exists(os.path.join(t, "config.json")))

    def test_empty_folder_ok(self):
        with tempfile.TemporaryDirectory() as t:
            r = run("--config", os.path.join(t, "config.json"), "--data-dir", os.path.join(t, "dati"), "--user", "dave,admin")
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertTrue(os.path.exists(os.path.join(t, "config.json")))


if __name__ == "__main__":
    unittest.main()
