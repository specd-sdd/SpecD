# Tasks: reconcile-lifecycle-transitions-with-main

## 1. Canonical hook contract

- [x] 1.1 Resolve the canonical hook execution spec
      `specs/core/hook-execution-model/spec.md`: hook requirements — materialize the merged binding-driven transition/archive behavior and host-portable command behavior.
      Approach: apply the validated spec delta so effects select by edge, phase, timing, `along`, and `onFailure`, delegate executable work to `RunStepHooks`, preserve verbatim substitutions, and permit only post-expansion host quote translation.
      (Req: Default hook execution for transitions and archives; Template variable expansion; Constraints)
- [x] 1.2 Review transition effect selection against the merged contract
      `packages/core/src/application/use-cases/transition-change.ts`: `TransitionChange.execute()` — confirm binding effects and `skipHookPhases` remain authoritative after the automatic merge.
      Approach: preserve existing public signatures; change production code only if it does not select matching effects or if skip selectors disable predicates.
      (Req: Default hook execution for transitions and archives)
- [x] 1.3 Review shared hook execution against the merged contract
      `packages/core/src/application/use-cases/run-step-hooks.ts`: `RunStepHooks.execute()` — confirm transition and archive execution continues through the shared use case with existing failure semantics.
      Approach: preserve `RunStepHooksInput` and result types; make the smallest correction only if the auto-merged implementation diverges from the canonical behavior.
      (Req: Default hook execution for transitions and archives)
- [x] 1.4 Review verbatim expansion and host translation ordering
      `packages/core/src/application/template-expander.ts`, `packages/core/src/infrastructure/node/hook-runner.ts`, `packages/core/src/infrastructure/node/translate-hook-command.ts`: expansion/runner functions — confirm values are inserted verbatim before quote translation.
      Approach: unknown variables remain unchanged, callers add no escaping or quotes, and `translateHookCommand(expanded, host)` rewrites only unsupported quote syntax after expansion.
      (Req: Template variable expansion; scenario: Host-incompatible quote syntax is translated after expansion)

## 2. CLI composition

- [x] 2.1 Reduce the executable entrypoint to the extracted program wrapper
      `packages/cli/src/index.ts`: module entrypoint — remove duplicated command imports/registration and retain the shebang, `createProgram`, `handleError`, the named re-export, and `parseAsync` failure handling.
      Approach: instantiate `const program = createProgram()` and leave all command-tree assembly in `program.ts`.
      (Req: CLI entrypoint contract)
- [x] 2.2 Register verification in the extracted command tree
      `packages/cli/src/program.ts`: `createProgram()` — restore the feature's `registerChangeVerification(changeCmd)` without losing `main`'s `registerGuideCommand(program)`.
      Approach: import the existing verification registrar and call it with the other change registrars; keep `export function createProgram(): Command` unchanged.
      (Req: CLI entrypoint contract; change transition and verification availability)

## 3. Integration test reconciliation

- [x] 3.1 Merge repository-test imports from both parents
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`: imports — retain manifest parsing/version fixtures and Vitest mocking together with pre-hash-cleanup types and helpers.
      Approach: remove conflict markers and unused duplicates while keeping `changeManifestSchema`, `parseChangeManifest`, `UnsupportedManifestVersionError`, `vi`, `applyPreHashCleanup`, and `PreHashCleanup` where referenced.
      (Req: Filesystem change repository and manifest persistence)
- [x] 3.2 Preserve read-only load-time drift assertions
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`: hash-mismatch and revalidation cases — retain feature assertions that loading reports fresh facts without mutating the manifest or duplicating invalidations.
      Approach: use the portable `artifactHash()` helper where production pre-hash cleanup applies; assert manifest bytes/mtime and invalidation count remain unchanged on repeated reads.
      (Req: Filesystem change repository; change manifest history)
- [x] 3.3 Retain portable cleanup coverage in repository tests
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`: remaining conflicted hash expectations — reconcile `sha256` and `artifactHash` according to whether pre-hash cleanup is part of the code path.
      Approach: preserve CRLF/CR normalization scenarios and do not weaken existing lifecycle or manifest assertions.
      (Req: Testing conventions; filesystem change repository)
- [x] 3.4 Resolve the graph integration timeout without dropping scenarios
      `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts`: integration test timeout — settle the formatting conflict as `20_000`.
      Approach: retain all feature and `main` scenarios, `node:path`/`os.tmpdir()` fixtures, and workspace-qualified assertions.
      (Req: Index project graph; Indexer; Testing conventions)

## 4. Documentation migration

- [x] 4.1 Reconcile CLI reference links
      `docs/cli/cli-reference.md`: related-documentation list — retain the change-verification reference and replace deleted configuration paths with canonical guide links.
      Approach: link to `../guide/configuration.md` and `../guide/configuration-examples.md`; remove every reference to `docs/config/config-reference.md`.
      (Req: Documentation conventions; CLI entrypoint)
- [x] 4.2 Reconcile workflow implementation guidance
      `docs/guide/workflow.md`: implementing section — preserve target-step task-gate semantics and add graph-first guidance from `main`.
      Approach: describe `workflow.taskCompletion`, `requiresTaskCompletion`, artifact `taskCompletionCheck`, open implementation-file blocking, and graph impact/search without reverting to the older generic task check.
      (Req: Documentation conventions; Workflow automation)
- [x] 4.3 Reconcile workflow related links
      `docs/guide/workflow.md`: related-documentation list — point to canonical configuration, code-graph, CLI, domain, and change-verification pages.
      Approach: keep the feature's verification link and `main`'s new guide topology; ensure every relative target exists.
      (Req: Documentation conventions)
- [x] 4.4 Verify configuration content before accepting old-path deletions
      `docs/config/config-reference.md`, `docs/config/examples/approvals-and-workflow-hooks.md`: modify/delete conflicts — confirm current material exists in canonical guide pages, then keep the `main` deletions.
      Approach: map reference material to `docs/guide/configuration.md`; map examples to `configuration-examples.md`, `configuration.md`, and `custom-schemas.md`; port only current missing prose.
      (Req: Documentation conventions; Guide conventions)
- [x] 4.5 Verify getting-started content before accepting old-path deletions
      `docs/guide/_sections/getting-started/core-concepts.md`, `lifecycle.md`, `usage.md`: modify/delete conflicts — confirm their current concepts exist in the standalone guide topology, then keep the `main` deletions.
      Approach: compare against `what-is-specd.md`, `specs.md`, `changes.md`, `artifacts.md`, `workflow.md`, `getting-started.md`, `skills.md`, and `cli.md`; do not recreate `_sections`.
      (Req: Documentation conventions; Guide conventions)

## 5. Package metadata

- [x] 5.1 Merge root scripts as a capability union
      `package.json`: `scripts` — keep `ai-agents:sync`, use the expanded `test` filter matrix, and make `preflight:test` call `pnpm test`.
      Approach: preserve all other `main` scripts and dependencies; validate the final JSON before regenerating the lockfile.
      (Req: Testing conventions; Guide conventions)
- [x] 5.2 Regenerate the workspace lockfile
      `pnpm-lock.yaml`: dependency graph — replace conflict blocks with deterministic output from the final package manifests.
      Approach: run the pinned pnpm version after `package.json`, workspace config, and package manifests are stable; reject unrelated version churn.
      (Req: Testing conventions; CLI entrypoint)

## 6. Manifest and generated spec metadata

- [x] 6.1 Union implementation-snapshot invalidation history
      `specd-sdd/changes/20260707-153756-implementation-snapshot/manifest.json`: `history` — retain feature lifecycle/approval/verification invalidations and `main`'s Windows-portability invalidations exactly once in timestamp order.
      Approach: start from the feature projection, merge independent events chronologically, preserve artifact/approval/verification/implementation fields, then let canonical status reconcile derived projections.
      (Req: Change manifest; Change)
- [x] 6.2 Refresh the CLI and code-graph conflicted spec locks
      `specs/cli/change-transition/spec-lock.json`, `specs/cli/spec-optimizations/spec-lock.json`, `specs/code-graph/get-graph-health/spec-lock.json`: generated projections — derive valid JSON from final canonical sources.
      Approach: use SpecD metadata/optimization commands, never hand-merge hashes or optimization payloads, and confirm no conflict marker remains.
      (Req: Change transition; Indexer)
- [x] 6.3 Refresh the first core conflicted spec-lock set
      `specs/core/change-manifest/spec-lock.json`, `change/spec-lock.json`, `compile-context/spec-lock.json`, `get-artifact-instruction/spec-lock.json`, `get-hook-instructions/spec-lock.json`: generated projections — derive valid JSON from final sources and dependencies.
      Approach: regenerate sequentially through SpecD and confirm each source hash/metadata projection is current.
      (Req: Change; Change manifest; Hook execution model)
- [x] 6.4 Refresh the second core conflicted spec-lock set
      `specs/core/resolve-schema/spec-lock.json`, `schema-format/spec-lock.json`, `schema-merge/spec-lock.json`, `spec-lock/spec-lock.json`, `storage/spec-lock.json`: generated projections — derive valid JSON from final sources and dependencies.
      Approach: regenerate sequentially through SpecD and reject any lock that cannot be parsed or fingerprinted.
      (Req: Change repository and schema-dependent lifecycle behavior)
- [x] 6.5 Refresh the final core and skills conflicted spec-lock set
      `specs/core/transition-change/spec-lock.json`, `update-persisted-spec-optimizations/spec-lock.json`, `validate-artifacts/spec-lock.json`, `specs/skills/agents/spec-lock.json`, `workflow-automation/spec-lock.json`: generated projections — derive valid JSON from final sources and dependencies.
      Approach: regenerate sequentially through SpecD; ensure the transition/hook and workflow locks reflect the reconciled canonical contract.
      (Req: Transition change; Workflow automation)
- [x] 6.6 Review the pre-merge metadata stash selectively
      Git stash `pre-main-merge spec-lock refreshes`: seven saved lock refreshes — compare each candidate with the reconciled source without popping the stash wholesale.
      Approach: reproduce only still-valid optimizations through current SpecD commands; retain the stash until the comparison is complete.
      (Req: Generated metadata integrity)

## 7. Focused automated verification

- [x] 7.1 Run the focused core repository test
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`: Vitest suite — verify load-time facts, history idempotency, manifest versions, cleanup, and newline portability.
      Approach: run `pnpm --filter @specd/core test -- test/infrastructure/fs/change-repository.spec.ts` and fix semantic failures without weakening assertions.
      (Req: Filesystem change repository; Change manifest; Testing conventions)
- [x] 7.2 Run the focused hook test set
      Core template, run-step-hooks, hook-runner, and quote-translation suites — verify verbatim expansion and host translation.
      Approach: run the four focused core test files; require unknown-placeholder preservation, no extra quoting, post-expansion translation, and existing transition/archive failure behavior.
      (Req: Default hook execution for transitions and archives; Template variable expansion)
- [x] 7.3 Run CLI assembly and lifecycle tests
      CLI documentation coverage, verification command, and change command suites — verify the extracted program exposes guide, verification, and transition commands once.
      Approach: instantiate `createProgram()` in tests and require existing help/options/repair-guide behavior to pass.
      (Req: CLI entrypoint; Change transition)
- [x] 7.4 Run the focused code-graph integration test
      `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts`: Vitest suite — verify all workspace/indexing scenarios under portable fixtures.
      Approach: run the single integration file with its `20_000` timeout and investigate any platform-specific failure.
      (Req: Index project graph; Indexer; Testing conventions)
- [x] 7.5 Run documentation and public-site coverage
      CLI documentation coverage and public-web tests — verify canonical links and bundled guide content after obsolete paths are deleted.
      Approach: run the CLI documentation suite and `pnpm --filter @specd/public-web test`; fail on stale `docs/config` or `_sections` links.
      (Req: Documentation conventions; Guide conventions)

## 8. Merge and repository gates

- [x] 8.1 Confirm every Git conflict is resolved
      Integrated worktree: unmerged index entries and conflict markers — require an empty `git diff --name-only --diff-filter=U` and no marker in tracked source/docs/spec/metadata files.
      Approach: resolve each path semantically, stage explicit targets, and do not use blanket ours/theirs selection for content-bearing conflicts.
      (Req: All scoped requirements)
- [x] 8.2 Re-index the reconciled code graph
      `.specd/config/graph`: graph index — rebuild after sources, docs, and specs no longer contain conflict markers.
      Approach: run `node packages/cli/dist/index.js graph index --format toon`; require current, complete coverage with no stale warning.
      (Req: Indexer; Index project graph)
- [x] 8.3 Verify project and spec health
      SpecD project status and hook spec artifacts — require 293 readable specs, 16 configured owned workspaces, no `FINGERPRINT_INPUT_ERROR`, and passing hook `specs`/`verify` validations.
      Approach: run project status with context/graph plus focused change validation; inspect the merged diff for both binding selection and host-portable quoting.
      (Req: Hook execution model; Change manifest; Workflow automation)
- [x] 8.4 Run typecheck and lint
      Monorepo TypeScript and ESLint surfaces — require zero errors after CLI extraction and conflict resolution.
      Approach: run `pnpm typecheck` followed by `pnpm lint`; preserve ESM, named exports, strict types, architecture boundaries, and JSDoc conventions.
      (Req: Global architecture, conventions, and docs)
- [x] 8.5 Run the expanded repository test matrix
      Root workspace test script — verify core, CLI, code-graph, guide, SDK, skills, plugin manager, and all agent plugins.
      Approach: run `pnpm test`; the root script must use the merged expanded filter set and every package must pass.
      (Req: Testing conventions)
- [x] 8.6 Run build and preflight checks
      Root build/preflight surfaces — verify the integrated package graph and repository policy checks.
      Approach: run `pnpm build` and `pnpm preflight:check`; diagnose lockfile/package drift rather than bypassing failures.
      (Req: Testing conventions; CLI entrypoint; Guide conventions)
- [x] 8.7 Smoke-test CLI registration
      Built CLI: verification and guide help — verify both command families are reachable through the extracted factory.
      Approach: run `node packages/cli/dist/index.js changes verification --help` and `node packages/cli/dist/index.js guide --help`; both must exit zero with one registered command tree.
      (Req: CLI entrypoint; Workflow automation)
- [x] 8.8 Complete the two-parent merge commit
      Git merge state: pending `main` merge — record the fully validated semantic resolution without squashing either parent.
      Approach: stage the reconciled change artifacts and implementation, verify the merge parents, and commit only after every preceding gate passes; preserve unrelated user work.
      (Req: All scoped requirements)
