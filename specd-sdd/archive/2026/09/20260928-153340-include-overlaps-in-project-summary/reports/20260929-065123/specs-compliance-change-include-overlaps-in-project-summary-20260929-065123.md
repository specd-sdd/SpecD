# Specs compliance — include-overlaps-in-project-summary

Mode: change (verification, full)

## Scope

- core:get-project-summary
- cli:project-status
- sdk:build-project-status-snapshot
- core:kernel

## Result

Overlap, snapshot, and project-status requirements match the implementation. The kernel mapping scenario does not.

## Discrepancy

**core:kernel — Scenario: No undocumented entries in the kernel. Severity: medium. Spec drift against existing code.**

The merged table now includes `project.getProjectSummary`. `createKernel` still returns additional keys that the exhaustive mapping does not list:

- `kernel.project.resolveContextSpecs`
- `kernel.changes`: `archiveRepo`, `getDraft`, `getDiscarded`, `invalidate`, `updateImplementationTracking`, `refreshImplementationTracking`, `getImplementationReview`, `preview`
- `kernel.specs`: `getOutline`, `validateSchema`

The design for this change says not to edit `kernel.ts` and not to map `resolveContextSpecs`. The published scenario still requires every key to appear in the table. The code matches that design. The scenario does not.

## Previously reported items

- `project.getProjectSummary` is now in the `kernel.project` table.
- `docs/cli/project.md` describes `--graph` as extended statistics and hotspots. It no longer says the flag indexes the graph or gates freshness.
