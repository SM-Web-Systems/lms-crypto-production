"""Exercise the release HTTP client against a loopback server."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
import threading
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import release_recovery as recovery


class ReleaseHttpTests(unittest.TestCase):
    def setUp(self):
        self.requests = []
        requests = self.requests

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                requests.append((self.path, self.headers.get('User-Agent')))
                if self.headers.get('User-Agent') != 'LMS-Release-Verification/1.0':
                    self.send_response(403)
                    self.end_headers()
                    return
                status = {'/redirect': 302, '/private': 401}.get(self.path, 200)
                self.send_response(status)
                if status == 302:
                    self.send_header('Location', '/redirect-target')
                self.end_headers()
                self.wfile.write(json.dumps({'status': status}).encode())

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop_server)
        self.url = 'http://127.0.0.1:' + str(self.server.server_port)

    def stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)

    def test_identified_client_passes_health_and_preserves_http_failures(self):
        for path, expected in (('/health', 200), ('/private', 401)):
            with self.subTest(path=path):
                status, body = recovery.get_http(self.url + path)
                self.assertEqual(status, expected)
                self.assertEqual(json.loads(body), {'status': expected})

    def test_identified_client_returns_redirect_without_following_it(self):
        status, body = recovery.get_http(self.url + '/redirect')
        self.assertEqual(status, 302)
        self.assertEqual(json.loads(body), {'status': 302})
        self.assertEqual(self.requests, [('/redirect', 'LMS-Release-Verification/1.0')])
