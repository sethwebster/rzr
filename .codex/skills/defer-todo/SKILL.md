---
name: defer-todo
description: >
  Add a deferred idea or follow-up task to this workspace's scratchpad file at
  SCRATCHPAD_TODO.md. Use when the user says to defer something, jot it down for
  later, add it to a scratchpad, parking lot, or todo list, or save an idea
  without acting on it now.
---

# Defer Todo

Add the deferred item to `SCRATCHPAD_TODO.md`.

## Default behavior

- Append a single concise bullet to `## Inbox`
- Keep wording short and action-oriented
- Do not rewrite the whole file just to add one item

## Section rules

- Use `Inbox` by default
- Use `Maybe later` when the user explicitly frames it as optional
- Use `Parking lot` when the user wants a long-term holding area

## How to write

Run the helper script:

`python3 .codex/skills/defer-todo/scripts/add_todo.py --section "Inbox" "your todo text"`

## Notes

- If `SCRATCHPAD_TODO.md` is missing, the helper recreates it with the standard template
- Preserve existing entries
- Return the added section and bullet in your response
