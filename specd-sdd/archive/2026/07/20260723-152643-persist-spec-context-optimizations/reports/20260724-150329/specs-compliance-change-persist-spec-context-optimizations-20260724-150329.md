# Specs Compliance Report — persist-spec-context-optimizations

**Mode:** change  
**Change:** `persist-spec-context-optimizations`  
**State at audit:** `verifying`  
**Timestamp:** 2026-07-24T15:03:29  
**Graph:** fresh (`2026-07-23T17:37:31.659Z`)

## Summary

| Metric                                            |                                      Value |
| ------------------------------------------------- | -----------------------------------------: |
| Specs in change                                   |                                         52 |
| Specs audited (partials)                          |                               53 (20 + 33) |
| Confirmed behavioral bugs                         |               3 (optimizations get/update) |
| Material CLI / context gaps                       |                                         ~8 |
| Naming / architecture drift                       | GetSpecMetadata vs MaterializeSpecMetadata |
| Removed surfaces (save/write/invalidate metadata) |                                  Compliant |

**Verdict:** Do **not** proceed to `done` without addressing confirmed bugs and deciding on naming/CLI gaps.

## Confirmed behavioral bugs (prefer Fix Implementation)

1. **`core:update-persisted-spec-optimizations`** — `clear` on uninitialized spec creates a lock; verify requires no-op (`created: false`, no write).
2. **`core:update-persisted-spec-optimizations`** — `set` records active project schema even when persisted schema already exists; verify requires `current.schema`.
3. **`core:get-persisted-spec-optimizations`** — absent fields omitted instead of `missing`; aggregate `fresh: true` when initialized with no optimization fields.

## High/medium gaps (code vs verify — dual interpretation)

4. **`core:compile-context`** — materializes before list-mode short-circuit (“only rendered specs”).
5. **Context composition naming** — specs say `MaterializeSpecMetadata`; code injects `GetSpecMetadata` (behaviorally equivalent for `if-needed`).
6. **`core:list-specs` summary** — cache snapshot path vs use-case materialization.
7. **CLI** — `spec metadata` text/JSON shape; `generate-metadata` missing `--force` / batch JSON; `project init` omits `metadataCachePath`.
8. **`core:spec-lock` naming** — verify may still say `persistedStateHash`; port exposes `persistedStateMeta`.

## Removed surfaces

`cli:spec-update-metadata`, `cli:spec-write-metadata`, `cli:spec-invalidate-metadata` and core save/invalidate/update metadata removals: **compliant**.

## Verification session companion notes

Targeted unit suites for change-related use cases: **111/111 pass**. Full pre-hook `pnpm test` / lint / typecheck: **pass**. Scenario audit found ~21 CLI/optimizations FAILs clustered as above; remaining scenarios PASS or PARTIAL (thin tests).

## Detailed Findings

### Partial: core persisted

See `_partial-core-persisted.md` in this directory (verbatim companion).

### Partial: context & CLI

See `_partial-context-cli.md` in this directory (verbatim companion).
