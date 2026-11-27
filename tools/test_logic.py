#!/usr/bin/env python3
"""Compile and run the portable C++ game/controller tests."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
compiler = os.environ.get('CXX') or shutil.which('g++') or shutil.which('clang++')
if not compiler:
    raise SystemExit('Install g++ or clang++, or set CXX to a compatible compiler.')
with tempfile.TemporaryDirectory(prefix='blink-think-tests-') as folder:
    executable = Path(folder) / ('game-test.exe' if os.name == 'nt' else 'game-test')
    subprocess.run([compiler, '-std=c++17', '-Wall', '-Wextra', '-Werror', '-I', str(root / 'include'), str(root / 'tests/game_test.cpp'), '-o', str(executable)], check=True)
    subprocess.run([str(executable)], check=True)
