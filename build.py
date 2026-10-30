#!/usr/bin/env python3
"""Turns the game file (the same one published inside Claude) into the website.
   Usage: python3 build.py ludo-live.html  ->  writes index.html and sw.js
   The website copy is minified with esbuild (npm install first); the source stays readable."""
import sys, re, pathlib, subprocess, hashlib

src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "ludo-live.html").read_text()
ESBUILD = pathlib.Path("node_modules/.bin/esbuild")

def minify(code, loader):
    if not ESBUILD.exists():
        sys.exit("esbuild not found: run npm install first")
    out = subprocess.run([str(ESBUILD), "--minify", f"--loader={loader}", "--log-level=warning"],
                         input=code, capture_output=True, text=True)
    if out.returncode:
        sys.exit("minify failed:\n" + out.stderr)
    return out.stdout.strip()

# minify inline styles and inline scripts; leave everything else as written
src = re.sub(r"<style>(.*?)</style>", lambda m: "<style>" + minify(m.group(1), "css") + "</style>", src, flags=re.S)
src = re.sub(r"<script>(.*?)</script>", lambda m: "<script>" + minify(m.group(1), "js") + "</script>", src, flags=re.S)
src = re.sub(r"<!--(?!\s*\[).*?-->", "", src, flags=re.S)          # HTML comments
src = re.sub(r"\n\s+", "\n", src)                                    # indentation

cut = src.index('<div id="setting"')
head_part, body_part = src[:cut], src[cut:]
icon = ("data:image/svg+xml," +
  "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23fff'/%3E"
  "%3Cpath d='M4 4h12v12H4z' fill='%23D63F2A'/%3E%3Cpath d='M16 4h12v12H16z' fill='%2325904F'/%3E%3Cpath d='M16 16h12v12H16z' fill='%23E0A515'/%3E%3Cpath d='M4 16h12v12H4z' fill='%232C6CD0'/%3E%3C/svg%3E")

# Offline worker registration + "new version ready" prompt (website only)
SW_BOOT = minify("""
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").then(function (reg) {
    function ask() {
      if (document.getElementById("swUpdate")) return;
      var bar = document.createElement("div"); bar.id = "swUpdate"; bar.setAttribute("role", "status");
      bar.innerHTML = '<span>A new version of Ludo Live is ready.</span><button type="button" id="swGo">Update</button><button type="button" id="swLater">Later</button>';
      document.body.appendChild(bar);
      document.getElementById("swGo").onclick = function () { if (reg.waiting) reg.waiting.postMessage("activate"); else location.reload(); };
      document.getElementById("swLater").onclick = function () { bar.remove(); };
    }
    if (reg.waiting && navigator.serviceWorker.controller) ask();
    reg.addEventListener("updatefound", function () {
      var w = reg.installing; if (!w) return;
      w.addEventListener("statechange", function () { if (w.state === "installed" && navigator.serviceWorker.controller) ask(); });
    });
    setInterval(function () { reg.update().catch(function () {}); }, 30 * 60 * 1000);
  }).catch(function () {});
  var hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", function () { if (hadController) location.reload(); hadController = true; });
}
""", "js")
SW_CSS = minify("""
#swUpdate{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:40;display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center;
  max-width:calc(100% - 32px);padding:10px 12px 10px 16px;border-radius:14px;background:#191D2B;color:#fff;font:600 14px system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35)}
#swUpdate button{border:0;border-radius:9px;padding:8px 14px;font:700 14px system-ui,sans-serif;cursor:pointer}
#swGo{background:#8D99FF;color:#11131B}#swLater{background:transparent;color:#C9CEDC}
""", "css")

page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Online Ludo for 2 to 4 players: create a table, share the code, and play live with friends or bots.">
<meta name="theme-color" content="#23284A">
<link rel="icon" href="{icon}">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Ludo Live">
<style>:root{{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}body{{margin:0;font:14px system-ui,-apple-system,"Segoe UI",sans-serif}}img{{max-width:100%}}[hidden]{{display:none!important}}{SW_CSS}</style>
{head_part.strip()}
<script src="config.js"></script>
<script>{SW_BOOT}</script>
</head>
<body>
{body_part.strip()}
</body>
</html>
"""
pathlib.Path("index.html").write_text(page)
config = pathlib.Path("config.js").read_text() if pathlib.Path("config.js").exists() else ""
stamp = hashlib.sha1((page + config).encode()).hexdigest()[:10]
pathlib.Path("sw.js").write_text(pathlib.Path("sw.template.js").read_text().replace("__BUILD__", stamp))
print(f"index.html written, {len(page)} bytes; sw.js version {stamp}")
