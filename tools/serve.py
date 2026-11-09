"""Local preview server for site/ with caching disabled, so edits show up on reload.
Usage: python3 tools/serve.py [port]"""
import functools, http.server, os, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8010
root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'site')
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(NoCache, directory=root)).serve_forever()
