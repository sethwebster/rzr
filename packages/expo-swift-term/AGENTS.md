# Vendored module policy

This folder is treated as a vendored module that may be extracted later.

Rules:
- Do not directly rewrite source files in this folder as ad hoc edits.
- Any source change here must be represented by a saved patch artifact in `patches/`.
- Keep patches small, named, and reviewable.
- Preserve upstream structure so future extraction stays straightforward.
- Prefer documenting intent before modifying vendored source.

If you need to change code under this folder:
1. Save a patch file under `packages/expo-swift-term/patches/`
2. Apply that patch-derived change
3. Record why the patch exists
