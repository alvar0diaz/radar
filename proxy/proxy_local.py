#!/usr/bin/env python3
"""
Proxy local de PRUEBAS (solo para probar la app en tu ordenador).
Hace lo mismo que proxy/worker.js: reenvía /airplanes/... y /adsblol/...
a las APIs reales y añade la cabecera CORS.

Uso:  python3 proxy/proxy_local.py      (escucha en http://localhost:8781)
"""
import re
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DESTINOS = {"airplanes": "https://api.airplanes.live", "adsblol": "https://api.adsb.lol"}
PATRON = re.compile(r"^/(airplanes|adsblol)(/v2/point/-?\d{1,3}(?:\.\d+)?/-?\d{1,3}(?:\.\d+)?/\d{1,3})$")


class Manejador(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        m = PATRON.match(self.path)
        if not m:
            self.send_response(404); self._cors(); self.end_headers(); return
        peticion = urllib.request.Request(
            DESTINOS[m.group(1)] + m.group(2),
            headers={"Accept": "application/json", "User-Agent": "radar-tablet-pwa (proxy local de pruebas)"},
        )
        try:
            with urllib.request.urlopen(peticion, timeout=10) as r:
                estado, cuerpo = r.status, r.read()
        except urllib.error.HTTPError as e:
            estado, cuerpo = e.code, e.read()
        except Exception as e:  # sin conexión, timeout...
            estado, cuerpo = 502, str(e).encode()
        self.send_response(estado)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(cuerpo)

    def log_message(self, fmt, *args):  # registro breve en consola
        print(self.address_string(), fmt % args)


if __name__ == "__main__":
    print("Proxy local en http://localhost:8781")
    ThreadingHTTPServer(("127.0.0.1", 8781), Manejador).serve_forever()
