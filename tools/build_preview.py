#!/usr/bin/env python3
"""Make a self-contained, offline HTML preview. No network or board access."""
from pathlib import Path
import base64
import re

ROOT = Path(__file__).resolve().parents[1]

def script(text):
    return '<script>\n' + text.replace('</script', '<\\/script') + '\n</script>'

html = (ROOT / 'web/index.html').read_text(encoding='utf-8')
html = re.sub(r'^[ \t]*<script\s+src="[^"]+"\s+defer></script>\r?\n', '', html, flags=re.MULTILINE)
html = re.sub(r'<link\b[^>]*rel="stylesheet"[^>]*>', lambda _: '<style>\n' + (ROOT / 'web/style.css').read_text(encoding='utf-8') + '\n</style>', html)
icon = base64.b64encode((ROOT / 'web/favicon.svg').read_bytes()).decode()
html = html.replace('href="/favicon.svg"', 'href="data:image/svg+xml;base64,' + icon + '"')
assets = ['web/vendor/qrcode.js', 'preview/demo.js', 'web/app.js']
html = html.replace('</body>', '\n'.join(script((ROOT / asset).read_text(encoding='utf-8')) for asset in assets) + '\n</body>')
if re.search(r'<(?:link|script)\b[^>]*(?:href|src)="/', html):
    raise SystemExit('Preview still has an external file dependency; refusing to write it.')
(ROOT / 'preview/index.html').write_text(html, encoding='utf-8', newline='\n')
print('Built preview/index.html — open it in any browser; no ESP32 required.')
