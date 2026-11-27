#!/usr/bin/env python3
"""Build a reviewable source zip without credentials, dependencies or firmware."""
from pathlib import Path
import hashlib
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(ROOT / 'tools/build_preview.py')], check=True)
subprocess.run([sys.executable, str(ROOT / 'tools/check_source.py')], check=True)
files = {
    'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'CONTRIBUTING.md',
    'CODE_OF_CONDUCT.md', 'SECURITY.md', 'CHANGELOG.md', 'platformio.ini',
    'requirements-dev.txt', 'package.json', 'package-lock.json', '.gitignore',
    '.gitattributes', '.editorconfig', '.prettierrc.json', '.prettierignore',
    '.vscode/extensions.json', '.vscode/tasks.json'
}
for directory in ['include', 'src', 'web', 'preview', 'tests', 'tools', 'docs', '.github']:
    for path in (ROOT / directory).rglob('*'):
        if path.is_file() and not path.is_symlink() and '__pycache__' not in path.parts:
            files.add(path.relative_to(ROOT).as_posix())
output = ROOT / 'dist'; output.mkdir(exist_ok=True)
archive = output / 'blink-and-think-source.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
    for name in sorted(files):
        path = ROOT / name
        if not path.is_file():
            raise SystemExit(f'Missing package input: {name}')
        bundle.write(path, 'blink-and-think/' + name)
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(output / 'SHA256SUMS').write_text(f'{digest}  {archive.name}\n', encoding='utf-8', newline='\n')
print(f'Created {archive} ({len(files)} files). No publishing or hardware upload performed.')
