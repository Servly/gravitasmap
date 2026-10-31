"""Build the GRAVITAS site from its source parts.

    python tools/build.py

src/_shell.html      page markup (head with search-engine info, panels)
src/css/app.css      all styles
src/js/NN-*.js       the app, in numbered parts; they are joined in order into one module
src/lazy/*.js        v0.97: parts loaded only when they are opened (the Lenses): app.<name>.<hash>.js, named in the app as __LAZY_<NAME>__

Output goes to site/ : index.html, app.<hash>.css, app.<hash>.js (minified when esbuild is
available), assets/, robots.txt. tools/serve.py serves site/ when it exists.
"""
import base64, hashlib, re, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC, SITE = ROOT / "src", ROOT / "site"
_BIN = ROOT / "tools" / "node_modules" / ".bin"
ESBUILD = [p for p in (_BIN / "esbuild.cmd", Path(shutil.which("esbuild") or "/nonexistent")) if p.exists()] if sys.platform == "win32" \
    else [p for p in (_BIN / "esbuild", Path(shutil.which("esbuild") or "/nonexistent")) if p.exists()]


def minify(code, loader):
    if not ESBUILD:
        print(f"  (esbuild not found: {loader} left unminified)")
        return code
    try:
        r = subprocess.run([str(ESBUILD[0]), f"--loader={loader}", "--minify", "--format=esm" if loader == "js" else "--charset=utf8",
                            "--log-level=warning"], input=code.encode(), capture_output=True)
    except OSError:
        print(f"  (esbuild could not run here: {loader} left unminified)")
        return code
    if r.returncode:
        sys.exit(r.stderr.decode())
    return r.stdout.decode()


NOT_FOUND = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Not found · GRAVITAS</title><meta name="robots" content="noindex">
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#04030a radial-gradient(ellipse at 50% 40%,#1a0f2e 0,#04030a 60%);color:#e9ddff;font:15px/1.5 Segoe UI,system-ui,sans-serif;text-align:center;padding:16px;box-sizing:border-box}
h1{color:#ff6ad5;letter-spacing:.2em;font-size:18px;margin:14px 0 4px}p{margin:6px 0;color:#c9bfe0}a{display:inline-block;margin-top:12px;padding:8px 18px;border:1px solid #6ae8ff;border-radius:18px;color:#6ae8ff;text-decoration:none}a:hover{background:#6ae8ff22}
.orb{animation:spin 14s linear infinite;transform-origin:80px 80px}@keyframes spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.orb{animation:none}}</style></head>
<body><div><svg width="160" height="160" viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="56" fill="none" stroke="#6ae8ff" stroke-opacity=".35" stroke-dasharray="3 5"/>
<circle cx="80" cy="80" r="17" fill="#ffb347"/><circle cx="80" cy="80" r="24" fill="#ffb347" opacity=".12"/><g class="orb"><circle cx="136" cy="80" r="6" fill="#cfd6e4"/></g></svg>
<h1>GRAVITAS</h1><p>Lost in the black: this page does not exist.</p><p>Every orbit is still where it should be.</p><a href="/">Open the map</a></div></body></html>
"""


def main():
    parts = sorted((SRC / "js").glob("[0-9][0-9]-*.js"))
    js = "".join(p.read_text(encoding="utf-8") for p in parts)
    lazy = {}                                                         # v0.97: a lazy part is built on its own; the app knows it by its hashed name
    for p in sorted((SRC / "lazy").glob("*.js")) if (SRC / "lazy").is_dir() else []:
        code = minify(p.read_text(encoding="utf-8"), "js")
        lazy[f"app.{p.stem}.{hashlib.sha1(code.encode()).hexdigest()[:10]}.js"] = code
        js = js.replace(f"__LAZY_{p.stem.upper()}__", list(lazy)[-1])
    css = (SRC / "css" / "app.css").read_text(encoding="utf-8")
    js_min, css_min = minify(js, "js"), minify(css, "css")
    h = lambda s: hashlib.sha1(s.encode()).hexdigest()[:10]
    jsn, cssn = f"app.{h(js_min)}.js", f"app.{h(css_min)}.css"
    if SITE.exists():                     # keep the files the previous page used, so a visitor who still has that page keeps working
        old = SITE / "index.html"
        keep = set(re.findall(r'(app\.[0-9a-f]+\.(?:js|css))', old.read_text(encoding="utf-8"))) if old.is_file() else set()
        for k in list(keep):                                          # v0.97: and the lazy parts that page's app asks for
            f = SITE / k
            if f.is_file() and k.endswith(".js"): keep |= set(re.findall(r'(app\.[a-z]+\.[0-9a-f]{10}\.js)', f.read_text(encoding="utf-8")))
        for f in SITE.glob("app.*"):
            if f.name not in keep:
                f.unlink()
    SITE.mkdir(exist_ok=True)
    (SITE / jsn).write_text(js_min, encoding="utf-8")
    (SITE / cssn).write_text(css_min, encoding="utf-8")
    for n, code in lazy.items(): (SITE / n).write_text(code, encoding="utf-8")
    html = (SRC / "_shell.html").read_text(encoding="utf-8")
    html = html.replace("<!--CSS-->", f'<link rel="stylesheet" href="{cssn}">')
    html = html.replace("<!--JS-->", f'<script type="module" src="{jsn}"></script>')
    html = re.sub(r"\n\s*\n", "\n", re.sub(r"(?m)^[ \t]+", "", html))
    (SITE / "index.html").write_text(html, encoding="utf-8")
    # v0.75.6: site/vendor and site/assets are made fresh each time, so a file removed from src/ also leaves the site.
    # RETIRED: files that may still sit in an older src/ folder (zips never delete files) but must not be published
    RETIRED = {"beat.js"}
    skip = lambda d, names: [n for n in names if n in RETIRED]
    if (SRC / "vendor").is_dir():                                     # v0.75.5: three.js served from this site (was a CDN)
        shutil.rmtree(SITE / "vendor", ignore_errors=True)
        shutil.copytree(SRC / "vendor", SITE / "vendor", ignore=skip)
    for a in (SRC / "assets", ROOT / "prototype" / "assets"):          # first that exists
        if a.is_dir():
            shutil.rmtree(SITE / "assets", ignore_errors=True)
            shutil.copytree(a, SITE / "assets", ignore=skip)
            break
    else:
        if not (SITE / "assets").is_dir():
            print("  warning: no assets folder found (src/assets or prototype/assets); images and sounds will be missing")
    if (ROOT / "tools" / "_headers").is_file():                       # caching rules and the content security policy for Cloudflare Pages
        hdr = (ROOT / "tools" / "_headers").read_text(encoding="utf-8")
        inline = [m for m in re.findall(r"<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>", html, re.S) if "ld+json" not in m[0]]
        hashes = " ".join("'sha256-%s'" % base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode() for _, body in inline)
        (SITE / "_headers").write_text(hdr.replace("{INLINE_SCRIPT_HASHES}", hashes), encoding="utf-8")
    (SITE / "404.html").write_text(NOT_FOUND, encoding="utf-8")       # a real "not found": without it Cloudflare answers every missing file with the main page
    (SITE / "robots.txt").write_text("User-agent: *\nAllow: /\nDisallow: /api/\n", encoding="utf-8")
    print(f"built site/: {len(parts)} parts -> {jsn} ({len(js_min) // 1024} KB, from {len(js) // 1024} KB), {cssn}, index.html")


if __name__ == "__main__":
    main()
