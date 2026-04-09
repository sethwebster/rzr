#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
SCRATCHPAD = ROOT / "SCRATCHPAD_TODO.md"
DEFAULT_TEMPLATE = """# Scratchpad TODO

Dump ideas here for later.

## Inbox
- 

## Maybe later
- 

## Parking lot
- 
"""


def ensure_file() -> str:
    if not SCRATCHPAD.exists():
        SCRATCHPAD.write_text(DEFAULT_TEMPLATE, encoding="utf-8")
    return SCRATCHPAD.read_text(encoding="utf-8")


def normalize_section(section: str) -> str:
    section = section.strip().lower()
    mapping = {
        "inbox": "## Inbox",
        "maybe later": "## Maybe later",
        "parking lot": "## Parking lot",
    }
    if section not in mapping:
        raise SystemExit(f"Unknown section: {section}")
    return mapping[section]


def insert_item(content: str, header: str, item: str) -> str:
    lines = content.splitlines()
    try:
        start = lines.index(header)
    except ValueError:
        lines.extend(["", header, "- "])
        start = lines.index(header)

    insert_at = start + 1
    while insert_at < len(lines) and not lines[insert_at].startswith("## "):
        if lines[insert_at].strip() == "-":
            lines[insert_at] = f"- {item}"
            return "\n".join(lines) + "\n"
        insert_at += 1

    lines.insert(insert_at, f"- {item}")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("item")
    parser.add_argument("--section", default="Inbox")
    args = parser.parse_args()

    header = normalize_section(args.section)
    content = ensure_file()
    updated = insert_item(content, header, args.item.strip())
    SCRATCHPAD.write_text(updated, encoding="utf-8")
    print(f"{header}: - {args.item.strip()}")


if __name__ == "__main__":
    main()
