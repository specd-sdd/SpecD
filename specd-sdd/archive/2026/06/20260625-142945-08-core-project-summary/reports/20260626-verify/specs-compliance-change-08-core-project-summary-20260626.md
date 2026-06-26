# Spec Compliance Audit — 08-core-project-summary

**Mode:** change  
**Date:** 2026-06-26  
**Specs:** `core:get-project-summary`, `cli:project-status`

## Summary

| Metric                   | Count      |
| ------------------------ | ---------- |
| Requirements checked     | 19         |
| Implemented              | 19         |
| Discrepancies (critical) | 0          |
| Discrepancies (minor)    | 2          |
| Scenarios verified       | 29/29 pass |

## core:get-project-summary

**Implementation:** `packages/core/src/application/use-cases/get-project-summary.ts`, factory, `kernel.project.getProjectSummary`

| Requirement                      | Status | Evidence                         |
| -------------------------------- | ------ | -------------------------------- |
| Count-only result shape          | ✓      | Interface + execute return       |
| List use case orchestration      | ✓      | Delegates to 5 list use cases    |
| archivedCount from meta.total    | ✓      | `archived.meta.total` in execute |
| Spec counting via ListWorkspaces | ✓      | `specRepo.count()` per workspace |
| Parallel I/O                     | ✓      | `Promise.all` batches            |
| Constructor: 5 list deps         | ✓      | Constructor signature            |
| Factory from SpecdConfig         | ✓      | `createGetProjectSummary`        |
| Kernel wiring                    | ✓      | `kernel-get-config.spec.ts`      |
| No graph/context                 | ✓      | No imports of graph/context      |

**Tests:** `get-project-summary.spec.ts` (3 cases), kernel smoke test.

**Minor gaps:**

1. No dedicated integration test calling `createGetProjectSummary(config)` directly — factory is trivial wiring; covered indirectly via `createKernel`.
2. Individual draft/discarded count scenarios not isolated — covered in aggregate test.

## cli:project-status (delta scope)

**Implementation:** `packages/cli/src/commands/project/status.ts`

| Requirement                  | Status | Evidence                                     |
| ---------------------------- | ------ | -------------------------------------------- |
| Counts via getProjectSummary | ✓      | Single call; no `changes.list*` for counting |
| Archived in output           | ✓      | text + json/toon `changes.archived`          |
| listWorkspaces for metadata  | ✓      | Parallel call retained                       |
| Graph/context unchanged      | ✓      | Pre-existing paths intact                    |

**Tests:** `project-status.spec.ts` — new scenario for getProjectSummary + archived; context scenarios unchanged.

**Minor gaps:**

1. JSON/toon output with `archived` field not explicitly asserted — structure present in code.

## Global spec alignment

- Hexagonal layering respected (application use case, composition factory, CLI adapter).
- No direct specd.yaml reads in use case.
- ESM named exports.

## Recommendations (non-blocking)

1. Generate `spec-lock.json` / metadata for `core:get-project-summary` before archive.
2. Optional: add factory smoke test if desired.

**Verdict:** Implementation conforms to change specs. Safe to proceed to `done`.
