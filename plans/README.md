# Plans

## Session status reliability

This folder contains the full planning/docs package for the session-status overhaul:

- `session-status-architecture.md` — architecture, current-state analysis, target model, rollout phases, risks, and acceptance criteria
- `session-status-test-spec.md` — verification strategy, test matrix, accuracy benchmarks, gateway/client validation, and ship criteria

These documents describe the path to a ~95% accurate, evidence-driven session-status system for:
- online / degraded / offline
- awaiting input vs quietly working
- missing / exited / readonly / present
- shared truth across server, gateway, web, mobile, and CLI
