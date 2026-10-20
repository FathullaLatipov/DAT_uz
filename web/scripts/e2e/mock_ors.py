"""A stand-in for the OpenRouteService directions API, for the end-to-end scenario.
Run it, then start the app with  ORS_API_KEY=test-key ORS_URL=http://127.0.0.1:3199/v2/directions/driving-hgv/geojson
GET /stats returns how many directions requests it has served (to prove the app caches)."""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

CALLS = []

class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        self._send(200, {"calls": len(CALLS), "last": CALLS[-1] if CALLS else None})

    def do_POST(self):
        n = int(self.headers.get("content-length", 0))
        body = json.loads(self.rfile.read(n) or b"{}")
        if self.headers.get("authorization") != "test-key":
            return self._send(403, {"error": {"code": 2003, "message": "Access to this API has been disallowed"}})
        CALLS.append(body)
        (x1, y1), (x2, y2) = body["coordinates"]
        restr = ((body.get("options") or {}).get("profile_params") or {}).get("restrictions") or {}
        if restr.get("height", 0) >= 4.5:
            return self._send(404, {"error": {"code": 2010, "message": "Could not find routable point"}})
        coords = [[x1 + (x2 - x1) * i / 20, y1 + (y2 - y1) * i / 20 + (0.2 if 5 < i < 15 else 0)] for i in range(21)]
        # A restricted truck is sent the long way round: the restrictions are visibly in the answer.
        dist, dur = (400_000, 18_000) if restr else (300_000, 12_000)
        self._send(200, {"features": [{"geometry": {"coordinates": coords}, "properties": {"summary": {"distance": dist, "duration": dur}, "extras": {"tollways": {"values": [[0, 10, 0], [10, 20, 1]]}}}}]})

HTTPServer(("127.0.0.1", 3199), H).serve_forever()
