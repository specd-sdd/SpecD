# Tasks: fix-project-status-repository-wiring

## 1. Core Shared Wiring Helper

- [x] 1.1 Create shared repository wiring helper file and definitions
      `packages/core/src/composition/shared-repository-wiring.ts`: `SharedSpecRepositoryMapOptions`, `SharedChangeRepositoryOptions` — define interfaces and resolveMetadataPathForWorkspace and resolveChangeRepositoryResolvers internal helpers
      Approach: Implement helpers for canonical metadata path resolution and change repository callback resolvers (resolveArtifactTypes, resolveSpecExists) using config data.
      (Req: core:list-workspaces, core:get-status)
- [x] 1.2 Implement `createSharedSpecRepositories` in shared wiring helper
      `packages/core/src/composition/shared-repository-wiring.ts`: `createSharedSpecRepositories` — iterate workspaces and bootstrap spec repositories with canonical settings
      Approach: Iterate over config workspaces, resolve canonical metadataPath, and build a ReadonlyMap of SpecRepositories keyed by workspace name.
      (Req: core:list-workspaces)
- [x] 1.3 Implement `createSharedChangeRepository` in shared wiring helper
      `packages/core/src/composition/shared-repository-wiring.ts`: `createSharedChangeRepository` — bootstrap a ChangeRepository using canonical schema-driven resolvers
      Approach: Construct ChangeRepository with fs backend, defaults, and async resolveArtifactTypes/resolveSpecExists handlers utilizing the shared spec repositories map.
      (Req: core:list-changes, core:list-drafts, core:list-discarded, core:get-status)

## 2. Align Core Composition Factories

- [x] 2.1 Align `createListWorkspaces` composition factory
      `packages/core/src/composition/use-cases/list-workspaces.ts`: `createListWorkspaces` — replace custom inline spec repository construction with shared helper
      Approach: Modify config branch of the factory to use createSharedSpecRepositories({ config }), leaving explicit options branch untouched.
      (Req: core:list-workspaces)
- [x] 2.2 Align `createListChanges` composition factory
      `packages/core/src/composition/use-cases/list-changes.ts`: `createListChanges` — replace direct ChangeRepository bootstrap with shared helper
      Approach: In the config branch, invoke createSharedChangeRepository({ config }) instead of constructing ChangeRepository directly from paths.
      (Req: core:list-changes)
- [x] 2.3 Align `createListDrafts` composition factory
      `packages/core/src/composition/use-cases/list-drafts.ts`: `createListDrafts` — replace direct ChangeRepository bootstrap with shared helper
      Approach: In the config branch, invoke createSharedChangeRepository({ config }) instead of constructing ChangeRepository directly from paths.
      (Req: core:list-drafts)
- [x] 2.4 Align `createListDiscarded` composition factory
      `packages/core/src/composition/use-cases/list-discarded.ts`: `createListDiscarded` — replace direct ChangeRepository bootstrap with shared helper
      Approach: In the config branch, invoke createSharedChangeRepository({ config }) instead of constructing ChangeRepository directly from paths.
      (Req: core:list-discarded)
- [x] 2.5 Align `createGetStatus` composition factory
      `packages/core/src/composition/use-cases/get-status.ts`: `createGetStatus` — align config branch ChangeRepository bootstrap with shared helper
      Approach: Re-route ChangeRepository bootstrap inside config branch to use createSharedChangeRepository({ config }), maintaining other dependency orchestration intact.
      (Req: core:get-status)
- [x] 2.6 Align `createGetProjectSummary` composition factory
      `packages/core/src/composition/use-cases/get-project-summary.ts`: `createGetProjectSummary` — verify orchestration wiring
      Approach: Confirm downstream list/workspace use cases use aligned config-based factories so project summary inherits canonical wiring.
      (Req: core:get-project-summary)

## 3. SDK and CLI Verification

- [x] 3.1 Verify SDK status snapshot orchestration
      `packages/sdk/src/orchestration/build-project-status-snapshot.ts`: `buildProjectStatusSnapshot` — verify host context calls are unchanged
      Approach: Confirm orchestration delegates solely to the core project queries and avoids direct repository bootstrap.
      (Req: sdk:build-project-status-snapshot)
- [x] 3.2 Verify CLI status command handler
      `packages/cli/src/commands/project/status.ts`: `registerProjectStatus` — verify command delegates to SDK snapshot flow
      Approach: Ensure CLI relies solely on SDK host context and project queries without bespoke repository building.
      (Req: cli:project-status)

## 4. Tests and Validation

- [x] 4.1 Create tests for shared repository wiring helper
      `packages/core/test/composition/shared-repository-wiring.spec.ts`: new test file — verify spec and change repository bootstrap logic
      Approach: Assert SpecRepository metadata paths, ChangeRepository resolvers, and workspace mapping are correctly derived from config.
      (Req: core:list-workspaces, core:get-status)
- [x] 4.2 Add regression tests for project summary composition
      `packages/core/test/composition/get-project-summary.spec.ts`: getProjectSummary test cases — assert canonical bootstrap is used
      Approach: Write cases proving summary uses canonical repository-derived semantics.
      (Req: core:get-project-summary)
- [x] 4.3 Add regression tests for project summary use case
      `packages/core/test/application/use-cases/get-project-summary.spec.ts`: list/summary test cases — assert correct counts under artifact drift scenarios
      Approach: Assert summary counts are correct when repository-derived artifact status matches canonical wiring.
      (Req: core:get-project-summary)
- [x] 4.4 Add regression tests for get status use case
      `packages/core/test/application/use-cases/get-status.spec.ts`: getStatus test cases — assert schema-driven artifact status derivation
      Approach: Add a test proving status maps match the canonical path under config-wired setup.
      (Req: core:get-status)
- [x] 4.5 Add test case for task checklist preservation in get status
      `packages/core/test/application/use-cases/get-status.spec.ts`: task preservation test — verify status retrieval does not invalidate completed tasks
      Approach: Mock a tasks.md with completed tasks (`[x]`), run status query, and assert that the status output preserves completed tasks and does not mark them as invalid or reset them.
      (Req: core:get-status)
- [x] 4.6 Verify SDK status snapshot tests
      `packages/sdk/test/orchestration/build-project-status-snapshot.spec.ts`: buildProjectStatusSnapshot test suite — run and verify passes
      Approach: Run SDK test command to confirm mock orchestration verification tests pass under the aligned wiring.
      (Req: sdk:build-project-status-snapshot)
- [x] 4.7 Verify CLI status command tests
      `packages/cli/test/commands/project-status.spec.ts`: CLI project status test suite — run and verify passes
      Approach: Run CLI test command to confirm all command integration tests pass.
      (Req: cli:project-status)
- [x] 4.8 Run E2E status command validation
      Manual E2E verification: CLI commands — test output consistency
      Approach: Once factories are aligned and compiled, run pnpm build and verify CLI project status and get-status workflows run successfully without infinite loops or undefined crashes.
      (Req: cli:project-status, core:get-status)
