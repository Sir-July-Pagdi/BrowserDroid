#!/usr/bin/env python3
"""Static dev server that sends the COOP/COEP headers BrowserDroid needs (mirrors _headers).
Usage: python3 scripts/serve.py [port]   -> http://localhost:8080  (localhost counts as a secure context)
For testing on the iPad itself use a real HTTPS origin (e.g. a Cloudflare Pages preview deployment); plain http://<LAN-IP> is NOT a secure context."""
import http.server, os, sys, mimetypes
mimetypes.add_type("application/wasm", ".wasm"); mimetypes.add_type("text/javascript", ".js"); mimetypes.add_type("application/manifest+json", ".webmanifest")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()
if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f"Serving {ROOT} with COOP/COEP on http://localhost:{port}")
    http.server.ThreadingHTTPServer(("0.0.0.0", port), H).serve_forever()
