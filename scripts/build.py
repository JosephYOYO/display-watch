#!/usr/bin/env python3
"""Build the native helper for the current Mac without activating monitoring."""
import pathlib
import shutil
import subprocess
import tempfile


def build(root, output):
    with tempfile.TemporaryDirectory(prefix='display-watch-swift-') as directory:
        main = pathlib.Path(directory) / 'main.swift'
        shutil.copy2(root / 'native/lock-screen.swift', main)
        output.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['xcrun', 'swiftc', str(main), str(root / 'native/physical-displays.swift'), '-o', str(output)], check=True)
    subprocess.run([str(output), '--check'], check=True)


if __name__ == '__main__':
    root = pathlib.Path(__file__).resolve().parent.parent
    build(root, root / '.build/lock-screen')
