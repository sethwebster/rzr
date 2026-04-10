---
name: expo-performance-audit
description: >
  Run a measured performance audit for an Expo app and scaffold a repo-ready
  audit doc. Use when the user asks to performance optimize, profile, audit,
  or systematically improve startup, scrolling, rendering, bundle size, or
  responsiveness in an Expo or React Native app.
---

# Expo Performance Audit

Use this skill for a disciplined Expo performance pass.

## Workflow

1. **Scope the problem**
   - Name the slow flows, target devices, and success criteria.
   - Prefer specific metrics over vague goals.

2. **Reproduce in production-like conditions**
   - Do not trust normal dev-mode performance.
   - Use a preview/release build when startup or native behavior matters.
   - For quick JS-path checks, `npx expo start --no-dev --minify` is a useful baseline.

3. **Measure before editing**
   - Use RN Perf Monitor to separate JS-thread vs UI-thread problems.
   - Use React Profiler for rerender churn.
   - Use Hermes profiling for deep JS hotspots when needed.
   - Use Expo Atlas to inspect oversized dependencies and bundles.

4. **Fill the audit template**
   - Canonical template: `docs/expo-performance-audit-template.md`
   - Scaffold a working copy with:

     `python3 .codex/skills/expo-performance-audit/scripts/init_audit.py`

   - Optional destination:

     `python3 .codex/skills/expo-performance-audit/scripts/init_audit.py docs/performance-audit-home-feed.md`

5. **Optimize one bottleneck at a time**
   - Common buckets: startup, rerenders, lists, assets, bundle, data path, memory.
   - Tie every code change to evidence from the audit doc.

6. **Re-measure and record results**
   - Update the same audit file with before/after numbers, devices, and verification notes.
   - Keep changes small, reversible, and attributable.

## Default priorities

Use this order unless profiling points elsewhere:

1. Startup path
2. Rerender hotspots
3. Lists / virtualization
4. Images and other assets
5. Bundle weight
6. Data path and memory behavior

## Guardrails

- Do not optimize blindly.
- Do not add blanket `useMemo` / `useCallback` without evidence.
- Validate on a real device before claiming success.
- If a change does not move the metric, revert it or downgrade its priority.

## Expected output

Return:
- the audit file path,
- the main bottlenecks found,
- the highest-leverage next changes,
- and the verification evidence that supports them.
