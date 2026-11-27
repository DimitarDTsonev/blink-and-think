#!/usr/bin/env python3
"""Check distributable source, local documentation links and embedded assets."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SKIP = {'.pio', '.git', 'node_modules', '.venv', 'venv', 'dist', '__pycache__'}
errors = []
text_suffixes = {'.md', '.cpp', '.h', '.py', '.js', '.cjs', '.html', '.css', '.svg', '.yml', '.json', '.ini', '.ps1'}
for path in ROOT.rglob('*'):
    if not path.is_file() or any(part in SKIP for part in path.relative_to(ROOT).parts):
        continue
    if path.suffix not in text_suffixes:
        continue
    text = path.read_text(encoding='utf-8')
    if 'vendor' not in path.parts and path != ROOT / 'preview/index.html' and re.search('[\u0400-\u04ff]', text):
        errors.append(f'Non-English Cyrillic text: {path.relative_to(ROOT)}')
    if path.suffix == '.md':
        for link in re.findall(r'\]\(([^)]+)\)', text):
            target = link.split('#', 1)[0]
            if not target or '://' in target or target.startswith('mailto:'):
                continue
            if not (path.parent / target).exists():
                errors.append(f'Broken local link in {path.relative_to(ROOT)}: {target}')
config = (ROOT / 'platformio.ini').read_text(encoding='utf-8')
for asset in re.findall(r'^\s+(web/\S+)\s*$', config, re.MULTILINE):
    if not (ROOT / asset).is_file():
        errors.append(f'Missing embedded asset: {asset}')
if 'upload_port =' in config or 'monitor_port =' in config:
    errors.append('Do not pin a machine-specific serial port in shared platformio.ini.')
for required in ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'web/vendor/LICENSE.qrcode-generator', 'preview/index.html']:
    if not (ROOT / required).is_file():
        errors.append(f'Missing required file: {required}')
if errors:
    raise SystemExit('\n'.join(errors))
print('PASS: source language, embedded assets, portable ports and local documentation links.')
