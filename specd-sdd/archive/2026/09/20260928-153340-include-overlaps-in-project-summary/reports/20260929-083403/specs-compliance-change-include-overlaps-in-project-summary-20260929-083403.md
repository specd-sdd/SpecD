# Specs compliance — include-overlaps-in-project-summary

Timestamp: 20260929-083403
Change: include-overlaps-in-project-summary
Mode: change

## Scope

Change specs: `core:get-project-summary`, `cli:project-status`, `sdk:build-project-status-snapshot`, `core:kernel`.

Checked against the implementation of the audit follow-up and the previous discrepancy list. The other kernel dependency specs were not re-audited.

## Verification

Scenarios for overlap enrichment, spec-count scheduling, help schema, and kernel VCS auto-detect match the code.

Tests: core 24, sdk 10, cli 22. All passed.

`GetProjectSummary.execute` chains `specRepo.count()` off `ListWorkspaces` inside the same `Promise.all` as change counts and `DetectOverlap`.

`project status --help` shows `overlaps` as present, `approvals.specEnabled` / `signoffEnabled`, and workspace `isExternal` / `codeRoot`.

`CompositionResolver.getVcsAdapter` calls `createVcsAdapter(config.projectRoot, registry.vcsProviders)` and returns `NullVcsAdapter` when nothing detects a VCS. `getActorResolver` uses `createLazyVcsActorResolver(() => getVcsAdapter())` when no actor provider is set. `createVcsActorResolver` returns `NullActorResolver` for `NullVcsAdapter`.

`kernel.ts` was not edited.

## Result

One low discrepancy.

| Severity | Where                     | Issue                                                                                                                                                                                                                                                                                                                                                               |
| -------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Low      | `core:kernel` constraints | The merged bullet still starts with the old sentence `createKernelInternals is not exported from @specd/core — it is internal to the composition layer` and then appends the new sentence. The requirement body and the four VCS scenarios already describe `CompositionResolver`. The leftover clause is residue from the list-item delta, not a second code path. |

Previous findings are closed: `docs/core/ports.md`, `docs/core/overview.md`, `docs/guide/cli.md`, `docs/cli/cli-reference.md`, spec-count scheduling, and the help schema.
