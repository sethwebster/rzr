#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
import shutil
import sys


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Copy the Expo performance audit template into a working audit file."
    )
    parser.add_argument(
        "destination",
        nargs="?",
        default="docs/performance-audit.md",
        help="Destination path for the scaffolded audit file (default: docs/performance-audit.md)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite the destination file if it already exists.",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[4]
    source = repo_root / "docs" / "expo-performance-audit-template.md"
    destination = repo_root / args.destination

    if not source.exists():
        print(f"Template not found: {source}", file=sys.stderr)
        return 1

    if destination.exists() and not args.force:
        print(
            f"Destination already exists: {destination}\n"
            "Re-run with --force to overwrite.",
            file=sys.stderr,
        )
        return 1

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    print(destination.relative_to(repo_root))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
