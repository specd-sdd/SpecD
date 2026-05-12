# Proposal: enrich-get-status-lifecycle

## Motivation

Every consumer that needs to drive the specd lifecycle (CLI `specd-design` skill, MCP tools, future UIs) must make 2-3 separate calls and replicate the same decision logic to figure out "what's next" after getting a change's status. This duplicated orchestration logic is fragile and will diverge as new consumers are added.

## Current behaviour

`GetStatus` returns only the `Change` entity and an array of `ArtifactStatusEntry` objects. To decide what to do next, a consumer must:

1. Call `change status` to get state + artifact statuses
2. Call `config show` to learn whether approval gates are active
3. Call `artifact-instruction` or manually walk the schema DAG to find the next artifact
4. Manually look up `VALID_TRANSITIONS` to know which transitions are structurally valid
5. Cross-reference workflow `requires` against artifact statuses to know which transitions would actually succeed

This forces every consumer to understand the state machine, the schema DAG, and the config model — knowledge that belongs in the application layer.

## Proposed solution

Enrich `GetStatusResult` with a `lifecycle` object computed at the use-case level:

- **`validTransitions`** — all structurally valid transitions from the current state (from the `VALID_TRANSITIONS` map)
- **`availableTransitions`** — subset where workflow `requires` are satisfied (dry-run)
- **`blockers`** — for each valid-but-unavailable transition, what's blocking it (artifact IDs or task descriptions)
- **`approvals`** — whether spec and signoff approval gates are active in the project config
- **`nextArtifact`** — the next artifact in the DAG whose `requires` are satisfied but is not yet `complete`/`skipped`; `null` when all are done
- **`changePath`** — filesystem path to the change directory

All fields are computed from data already in memory after schema resolution — zero additional I/O beyond the one-time schema read.

If schema resolution fails, the lifecycle fields degrade gracefully: `validTransitions` still works (static lookup), but `availableTransitions`, `blockers`, and `nextArtifact` fall back to empty/null.

## Specs affected

### New specs

_(none)_

### Modified specs

- `core:core/get-status`: expand constructor dependencies (add `SchemaRegistry`, `schemaRef`, `workspaceSchemasPaths`, approvals config); add `lifecycle` to `GetStatusResult`; define graceful degradation when schema resolution fails
- `cli:cli/change-status`: update JSON output schema to include the `lifecycle` object; simplify the CLI command to a pure serializer (remove schema warning logic that moves to the use case)

## Impact

- **`@specd/core` — `GetStatus` use case**: new constructor dependencies, new result fields, new domain logic for transition/blocker/nextArtifact computation
- **`@specd/core` — Kernel**: `GetStatus` wiring changes to inject `SchemaRegistry`, `schemaRef`, `workspaceSchemasPaths`, and approvals config
- **`@specd/cli` — `change status` command**: updated JSON serialization, simplified command handler
- **`@specd/mcp`**: benefits from richer result — no code changes needed if it already serializes `GetStatusResult`
- **Tests**: new unit tests for lifecycle computation in `GetStatus`; updated CLI tests for new JSON shape

## Open questions

_(none — the issue analysis is thorough and the approach is well-defined)_
