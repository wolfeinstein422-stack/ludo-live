#!/usr/bin/env python3
"""Turns the game file (the same one published inside Claude) into a standalone web page.
   Usage: python3 build.py path/to/ludo-live.html  ->  writes index.html"""
import sys, re, pathlib
src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "ludo-live.html").read_text()
cut = src.index('<div id="setting"')
head_part, body_part = src[:cut], src[cut:]
icon = ("data:image/svg+xml," +
  "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23fff'/%3E"
  "%3Cpath d='M4 4h12v12H4z' fill='%23D63F2A'/%3E%3Cpath d='M16 4h12v12H16z' fill='%2325904F'/%3E%3Cpath d='M16 16h12v12H16z' fill='%23E0A515'/%3E%3Cpath d='M4 16h12v12H4z' fill='%232C6CD0'/%3E%3C/svg%3E")
page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Online Ludo for 2 to 4 players: create a table, share the code, and play live with friends or bots.">
<meta name="theme-color" content="#23284A">
<link rel="icon" href="{icon}">
<style>:root{{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}body{{margin:0;font:14px system-ui,-apple-system,"Segoe UI",sans-serif}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>
{head_part.strip()}
<script src="config.js"></script>
</head>
<body>
{body_part.strip()}
</body>
</html>
"""
pathlib.Path("index.html").write_text(page)
print("index.html written,", len(page), "bytes")
