"""v0.3.2: the hub page port is unusual (47823), moves on when busy, and is remembered."""
import socket
import tempfile
import unittest

from docmap_hub.service import Hub
from docmap_hub.web import WEB_DEFAULT_PORT, WEB_SETTING, make_server, web_port_candidates

PASS = "una-passphrase-lunga"


class WebPortTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.hub = Hub(self.tmp.name)
        self.hub.keys.generate(PASS)
        self.servers, self.blockers = [], []

    def tearDown(self):
        for s in self.servers:
            s.server_close()
        for b in self.blockers:
            b.close()
        self.hub.close()
        self.tmp.cleanup()

    def block(self, port):
        b = socket.socket()
        b.bind(("127.0.0.1", port))
        b.listen(1)
        self.blockers.append(b)

    def free_base(self):
        # a base port with the next 3 free, to keep the test independent from the machine
        from docmap_hub.ports import is_free
        for p in range(WEB_DEFAULT_PORT, WEB_DEFAULT_PORT + 500, 5):
            if all(is_free(p + i) for i in range(4)):
                return p
        self.skipTest("nessuna porta libera vicino a 47823")

    def start(self, port=None):
        s = make_server(self.hub, PASS, port=port)
        self.servers.append(s)
        return s.server_address[1]

    def test_default_is_unusual(self):
        self.assertEqual(web_port_candidates(self.hub, None)[0], 47823)

    def test_busy_port_moves_to_next_and_is_remembered(self):
        base = self.free_base()
        self.block(base)
        got = self.start(base)
        self.assertEqual(got, base + 1)
        self.assertEqual(self.hub.registry.get_setting(WEB_SETTING), str(base + 1))
        # second hub page at the same time: no clash, takes another port
        got2 = self.start()
        self.assertNotIn(got2, (base, base + 1))

    def test_remembered_port_tried_first(self):
        base = self.free_base()
        self.hub.registry.set_setting(WEB_SETTING, str(base + 2), log=False)
        self.assertEqual(self.start(), base + 2)


if __name__ == "__main__":
    unittest.main()
