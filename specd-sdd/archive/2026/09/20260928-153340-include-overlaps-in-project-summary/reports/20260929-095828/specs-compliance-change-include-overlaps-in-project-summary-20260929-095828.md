# Specs compliance — include-overlaps-in-project-summary

Timestamp: 20260929-095828
Change: include-overlaps-in-project-summary
Mode: change

## Scope

Change specs: `core:get-project-summary`, `cli:project-status`, `sdk:build-project-status-snapshot`, `core:kernel`.

Checked against the implementation after the Constraints list-item replacement. Depth-1 kernel dependency specs were not re-audited.

## Verification

Scenarios for overlap enrichment, spec-count scheduling, help schema, kernel mapping, and VCS auto-detect match the code.

Tests: core get-project-summary application and composition 21, sdk snapshot 10, cli project status 22. All passed.

`GetProjectSummary.execute` chains `specRepo.count()` off `ListWorkspaces` inside the same `Promise.all` as change counts and `DetectOverlap`.

`project status --help` shows `overlaps` as present, `approvals.specEnabled` / `signoffEnabled`, and workspace `isExternal` / `codeRoot`.

`CompositionResolver.getVcsAdapter` calls `createVcsAdapter(config.projectRoot, registry.vcsProviders)` and reuses the promise. `createVcsAdapter` returns `NullVcsAdapter` when no provider detects a VCS. `getActorResolver` uses `createLazyVcsActorResolver(() => getVcsAdapter())` when `config.actorProvider` is omitted, and wraps `PrivacyActorResolver` when `config.privacy` is set. `createVcsActorResolver` returns `NullActorResolver` for `NullVcsAdapter`. Standalone factories under `composition/use-cases/` do not construct `GitActorResolver`. `kernel.ts` does not define `createKernelInternals`.

The merged Constraints item is one bullet: `createKernel` does not export `createKernelInternals`. Project VCS and actor resolution stay on `CompositionResolver`. The old label is gone.

## Result

No discrepancies.
