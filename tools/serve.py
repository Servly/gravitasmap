#!/usr/bin/env python3
"""
Local dev server for the system map prototype.

  python tools/serve.py          -> open http://localhost:8765

Serves prototype/system-map.html and proxies Spansh so the page can:
  GET /api/autocomplete?q=Sol       system name suggestions
  GET /api/system?name=Sol          full system (bodies, stations, factions); &lite=1: markets as null (as the site, v0.99.3)
  GET /api/system?id64=10477373803
  POST /api/report                 problem report from the page (saved in problem-reports/, e-mailed if tools/report_mail.json exists)

  python tools/serve.py --check  -> connection test with a readable diagnosis

Dumps are cached in data/cache/ for CACHE_MINUTES to keep load on Spansh low.
Standard library only.
"""
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import reports                                        # "Report a problem" (tools/reports.py)

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"                                  # built by tools/build.py (preferred)
PAGE = SITE / "index.html" if (SITE / "index.html").exists() else ROOT / "prototype" / "system-map.html"
ASSETS = SITE / "assets" if (SITE / "assets").is_dir() else ROOT / "prototype" / "assets"
TYPES = {".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".txt": "text/plain; charset=utf-8"}
CACHE = ROOT / "data" / "cache"
CACHE_MINUTES = 10
PORT = 8765
UA = {"User-Agent": "ED-SystemMap-Prototype/0.2 (local dev; contact via github later)"}
SPANSH = "https://spansh.co.uk/api"


NAMES = CACHE / "names.json"           # name -> id64, so known systems resolve even when Spansh is unreachable
KNOWN = {"sol": 10477373803}


def get_json(url, timeout=60, tries=3):
    """GET with retries: TLS handshakes to Spansh's CDN occasionally fail transiently."""
    last = None
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code < 500 and e.code != 429:
                raise
            last = e
        except (urllib.error.URLError, ssl.SSLError, ConnectionError, TimeoutError) as e:
            last = e
        if k < tries - 1:
            time.sleep(1.5 * (k + 1))
    raise last


def load_names():
    try:
        return json.loads(NAMES.read_text(encoding="utf-8"))
    except Exception:
        return {}


def remember_name(name, id64):
    CACHE.mkdir(parents=True, exist_ok=True)
    names = load_names(); names[name.lower()] = id64
    NAMES.write_text(json.dumps(names), encoding="utf-8")


def autocomplete(q):
    q = q.strip()
    if len(q) < 2:
        return []
    try:  # endpoint used by spansh.co.uk's own search boxes
        data = get_json(f"{SPANSH}/systems/field_values/system_names?q={urllib.parse.quote(q)}", 15)
        vals = data.get("values") if isinstance(data, dict) else data
        if vals:
            return [v if isinstance(v, str) else v.get("name") for v in vals][:12]
    except Exception:
        pass
    data = get_json(f"{SPANSH}/search?q={urllib.parse.quote(q)}", 15)
    return [r["record"]["name"] for r in data.get("results", []) if r.get("type") == "system"][:12]


def resolve_id64(name):
    key = name.strip().lower()
    known = {**KNOWN, **load_names()}
    if key in known:
        return known[key]
    data = get_json(f"{SPANSH}/search?q={urllib.parse.quote(name)}", 20)
    systems = [r["record"] for r in data.get("results", []) if r.get("type") == "system"]
    for s in systems:
        if s["name"].lower() == name.strip().lower():
            return s["id64"]
    # never jump to a "closest" system: only an exact name is loaded
    near = ", ".join(s["name"] for s in systems[:5])
    raise LookupError(f"System not found on Spansh: {name}" + (f" (did you mean: {near}?)" if near else ""))


def slim(dump):
    """v0.99.3: for &lite=1 only, as the site does (lib/slim.js): the market, outfitting and shipyard lists as null.
    Before, every answer here was without them, so the Station window never had them locally."""
    def slim_station(st):
        if not isinstance(st, dict):
            return {"name": str(st)}
        return {k: (None if k in ("market", "outfitting", "shipyard") else v) for k, v in st.items()}
    sysd = dict(dump.get("system", dump))
    sysd["stations"] = [slim_station(s) for s in sysd.get("stations", [])]
    sysd["bodies"] = [dict(b, stations=[slim_station(s) for s in b.get("stations", [])]) if "stations" in b else b for b in sysd.get("bodies", [])]
    return dict(dump, system=sysd)


def system(id64):
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{id64}.full.json"           # v0.99.3: kept whole (the older {id64}.json copies had no markets)
    if f.exists() and time.time() - f.stat().st_mtime < CACHE_MINUTES * 60:
        return json.loads(f.read_text(encoding="utf-8"))
    try:
        data = get_json(f"{SPANSH}/dump/{id64}")
        data = {"system": data.get("system", data)}
        data["system"]["summary"] = summary(data["system"].get("name"), id64)
    except Exception as e:
        if f.exists():                    # Spansh unreachable: serve the last copy we have, flagged as stale
            data = json.loads(f.read_text(encoding="utf-8"))
            age = (time.time() - f.stat().st_mtime) / 3600
            data["stale"] = f"Spansh is unreachable ({type(e).__name__}); showing the saved copy from {age:.1f} h ago."
            print("  ! " + data["stale"])
            return data
        raise
    f.write_text(json.dumps(data), encoding="utf-8")
    try:
        remember_name(data["system"]["name"], id64)
    except Exception:
        pass
    return data


def summary(name, id64):
    """Spansh's search record carries the political data (power, power state, factions, economy) in one place."""
    if not name:
        return None
    try:
        res = get_json(f"{SPANSH}/search?q={urllib.parse.quote(name)}", 20, tries=2)
        for r in res.get("results", []):
            rec = r.get("record", {})
            if r.get("type") == "system" and rec.get("id64") == id64:
                return {k: v for k, v in rec.items() if k not in ("bodies", "stations")}
    except Exception as e:
        print(f"  ! summary for {name} unavailable: {type(e).__name__}")
    return None


def friendly(e):
    msg = f"{type(e).__name__}: {e}"
    if "SSL" in msg or "TLS" in msg or "CERTIFICATE" in msg.upper():
        return msg + " | The secure connection to spansh.co.uk failed. Usually temporary (try again in a minute). " \
                     "If it persists: check VPN/antivirus HTTPS scanning, or run  python tools\\serve.py --check"
    if "timed out" in msg or "getaddrinfo" in msg:
        return msg + " | spansh.co.uk did not answer. Check the internet connection, or run  python tools\\serve.py --check"
    return msg


def check():
    print(f"Python {sys.version.split()[0]} · {ssl.OPENSSL_VERSION}")
    for url in (f"{SPANSH}/search?q=Sol", f"{SPANSH}/dump/10477373803"):
        t = time.time()
        try:
            d = get_json(url, 30, tries=1)
            print(f"  OK   {url}  ({time.time() - t:.1f} s)")
        except Exception as e:
            print(f"  FAIL {url}\n       {friendly(e)}")
    try:
        import socket
        with socket.create_connection(("spansh.co.uk", 443), timeout=10) as sock:
            with ssl.create_default_context().wrap_socket(sock, server_hostname="spansh.co.uk") as tls:
                print(f"  TLS handshake OK: {tls.version()}, issuer {dict(x[0] for x in tls.getpeercert()['issuer']).get('organizationName')}")
    except Exception as e:
        print(f"  TLS handshake FAILED: {type(e).__name__}: {e}")
        print("  -> If a browser opens https://spansh.co.uk fine but this fails, an antivirus/VPN/proxy is")
        print("     intercepting Python's HTTPS. Try: pause HTTPS scanning, or  pip install --upgrade certifi")


class Handler(SimpleHTTPRequestHandler):
    def send_json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        qs = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        try:
            if u.path in ("/", "/index.html"):
                body = PAGE.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif u.path.startswith("/assets/") or u.path.startswith("/vendor/"):     # v0.75.5: /vendor holds three.js
                base = ASSETS if u.path.startswith("/assets/") else SITE / "vendor"
                f = (base / u.path[len("/assets/") if base is ASSETS else len("/vendor/"):]).resolve()
                if base.resolve() not in f.parents or not f.is_file():
                    self.send_json({"error": "not found"}, 404); return
                body = f.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", TYPES.get(f.suffix.lower(), "application/octet-stream"))
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "max-age=86400")
                self.end_headers()
                self.wfile.write(body)
            elif re.fullmatch(r"/(app\.(?:[a-z]+\.)?[0-9a-f]{10}\.(?:js|css)|robots\.txt)", u.path) and (SITE / u.path[1:]).is_file():
                f = SITE / u.path[1:]
                body = f.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", TYPES.get(f.suffix.lower(), "text/plain; charset=utf-8"))
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "max-age=31536000, immutable" if f.name.startswith("app.") else "max-age=3600")
                self.end_headers()
                self.wfile.write(body)
            elif u.path == "/api/autocomplete":
                self.send_json({"values": autocomplete(qs.get("q", ""))})
            elif u.path == "/api/system":
                id64 = int(qs["id64"]) if "id64" in qs else resolve_id64(qs.get("name", "Sol"))
                data = system(id64)
                self.send_json(slim(data) if qs.get("lite") == "1" else data)
            else:
                self.send_json({"error": "not found"}, 404)
        except LookupError as e:
            self.send_json({"error": str(e)}, 404)
        except Exception as e:
            self.send_json({"error": friendly(e)}, 502)

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path != "/api/report":
            self.send_json({"error": "not found"}, 404); return
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > reports.MAX_BODY:
            self.send_json({"error": "Report too large."}, 413); return
        try:
            code, out = reports.handle(self.rfile.read(n), self.client_address[0])
        except Exception as e:
            code, out = 500, {"error": f"Could not save the report ({type(e).__name__})."}
        self.send_json(out, code)

    def log_message(self, fmt, *args):
        print("  " + fmt % args)


if __name__ == "__main__":
    if "--check" in sys.argv:
        check(); sys.exit()
    print(f"System map running at http://localhost:{PORT}  (Ctrl+C to stop)")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
