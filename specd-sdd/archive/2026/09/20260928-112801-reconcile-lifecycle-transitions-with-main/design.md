# Design: reconcile-lifecycle-transitions-with-main

## Non-goals

- Do not import, reproduce, or reconcile artifacts from `implementation-snapshot`, `report-overlap-dependency-changes`, or `code-graph-symbol-semantic-context`. Their spec overlap is permitted, but those changes target `main` and are not inputs to this branch integration.
- Do not redesign the lifecycle protocol, approval model, verification-attempt model, repository ports, guide package, or code-graph APIs.
- Do not restore documentation paths deleted by `main` when their content already has a canonical destination.
- Do not apply the stash `pre-main-merge spec-lock refreshes` wholesale. It is only a comparison source for selectively reproducing still-valid generated metadata.

## Affected areas

### CLI composition

- `packages/cli/src/index.ts`
  - Replace the conflicted monolithic Commander assembly with the extracted entrypoint shape:

    ```ts
    export { createProgram } from './program.js'

    const program = createProgram()
    program.parseAsync(process.argv).catch((err: unknown) => {
      handleError(err)
    })
    ```

  - The file keeps the node shebang and imports only `createProgram` and `handleError`. It must not duplicate command registration.
  - Compatibility: the executable behavior and named `createProgram` export remain available; direct consumers and documentation-coverage tests continue to instantiate a fresh program.

- `packages/cli/src/program.ts`
  - Keep the public signature unchanged:
    ```ts
    export function createProgram(): Command
    ```
  - Add `registerChangeVerification` to the change-command imports and call `registerChangeVerification(changeCmd)` with the other lifecycle registrations. Preserve `main`'s guide registration and all existing groups.
  - Graph impact: `createProgram()` has two direct file dependents (`packages/cli/src/index.ts` and `packages/cli/test/documentation-coverage.spec.ts`). The signature is unchanged, so compatibility risk is behavioral: omitting the registration would silently remove `changes verification` from the CLI.

### Core and code-graph integration tests

- `packages/core/test/infrastructure/fs/change-repository.spec.ts`
  - Retain `changeManifestSchema`, `parseChangeManifest`, `UnsupportedManifestVersionError`, and `vi` required by feature-side manifest/lifecycle tests; also retain `applyPreHashCleanup` and `PreHashCleanup` added by `main`.
  - Reconcile hash expectations through the test's portable `artifactHash()` helper where pre-hash cleanup is part of the production path. Preserve the feature assertion that a load-time mismatch reports fresh artifact facts without mutating the manifest or appending invalidation history; do not replace it with an older load-mutates-manifest expectation.
  - Keep revalidation/idempotency assertions and portable newline cleanup coverage from both sides.
  - Graph impact: this file is the dominant risk in the indexed implementation set: 100 direct, 76 indirect, and 14 transitive dependents, reaching repository persistence, validity fingerprints, verification evidence, and spec preview tests. The production `FsChangeRepository` contract and signatures are unchanged.
- `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts`
  - Resolve the formatting-only timeout conflict to `20_000` and retain every feature and `main` integration scenario.
  - Keep `node:path`, `os.tmpdir()`, workspace-qualified paths, and portable fixtures. No production symbol or API signature changes.
  - The file participates in the combined CRITICAL graph result and covers `code-graph:index-project-graph`.

### Hook behavior and canonical spec

- `specs/core/hook-execution-model/spec.md`
  - Resolve to the merged behavior represented by this change's delta: transition/archive effects are selected from bindings by edge, `phase`, `along`, `timing`, and `onFailure`; executable effects delegate to `RunStepHooks`; `--skip-hooks` controls explicit effect execution without disabling predicates.
  - Template variables are substituted verbatim. Unknown variables remain unchanged. Hook authors own quoting. `HookRunner` may translate only quote syntax unsupported by the host shell after expansion; callers must not escape or add quotes around values.
- `packages/core/src/application/use-cases/transition-change.ts`, `packages/core/src/application/use-cases/run-step-hooks.ts`, `packages/core/src/application/template-expander.ts`, `packages/core/src/infrastructure/node/hook-runner.ts`, and `packages/core/src/infrastructure/node/translate-hook-command.ts`
  - These production files already merged without textual conflicts and are review targets, not presumed edit targets. Their public signatures remain unchanged.
  - Verify that `TransitionChange` selects binding effects and honors `skipHookPhases`, `RunStepHooks` remains the shared engine, expansion is verbatim, and `NodeHookRunner` calls `translateHookCommand(expanded, host)` only after expansion. Edit them only if tests expose a mismatch with those exact invariants.
  - Spec impact is CRITICAL: graph analysis reports 11 direct, 13 indirect, and 67 transitive spec dependents, 61 affected files, and 91 affected specs for `core:hook-execution-model`.

### Documentation topology

- `docs/cli/cli-reference.md`
  - Keep the feature link to `change-verification.md` and replace the deleted configuration-reference link with `../guide/configuration.md` plus `../guide/configuration-examples.md`.
- `docs/guide/workflow.md`
  - Preserve the feature's precise target-step task gate: `workflow.taskCompletion`, `requiresTaskCompletion`, and artifact `taskCompletionCheck`; preserve open implementation-file blocking.
  - Also retain `main`'s graph-first implementation guidance and the canonical configuration/code-graph/CLI/change-verification links.
- Delete the obsolete feature-side paths after confirming their still-valid content exists in the canonical pages:
  - `docs/config/config-reference.md` maps to `docs/guide/configuration.md`.
  - `docs/config/examples/approvals-and-workflow-hooks.md` maps to `docs/guide/configuration-examples.md`, `docs/guide/configuration.md`, and `docs/guide/custom-schemas.md`.
  - `docs/guide/_sections/getting-started/core-concepts.md` maps to `docs/guide/what-is-specd.md`, `docs/guide/specs.md`, `docs/guide/changes.md`, and `docs/guide/artifacts.md`.
  - `docs/guide/_sections/getting-started/lifecycle.md` maps to `docs/guide/workflow.md`.
  - `docs/guide/_sections/getting-started/usage.md` maps to `docs/guide/getting-started.md`, `docs/guide/skills.md`, and `docs/guide/cli.md`.
  - Do not recreate `_sections` or `docs/config`; port only a passage that is both current and absent from the mapped canonical pages.

### Package and generated dependency metadata

- `package.json`
  - Preserve `ai-agents:sync` from the feature branch.
  - Use `main`'s expanded root `test` package filter set, including guide, SDK, skills, plugin manager, and all agent plugins.
  - Keep `preflight:test` delegating to `pnpm test` so the same expanded matrix is used in preflight.
- `pnpm-lock.yaml`
  - Regenerate with the repository's pinned pnpm version after `package.json`, `pnpm-workspace.yaml`, and all package manifests are stable. Never hand-merge lockfile conflict blocks.

### Append-only change history

- `specd-sdd/changes/20260707-153756-implementation-snapshot/manifest.json`
  - Start from the feature projection, then merge `main`'s independent `windows-platform-compatibility` invalidation events into the append-only history in timestamp order.
  - Preserve feature invalidations for lifecycle/approval/verification work, all `hasDrift` projections, artifact state, implementation tracking, approvals, verification evidence, and schema metadata.
  - Recompute only derived projections through normal SpecD status/validation flows; do not delete or rewrite historical events to make the file smaller.

### Generated spec locks

The following conflicted generated files must be refreshed from their resolved canonical `spec.md`, `verify.md`, dependency, and optimization inputs, then staged as conflict resolutions:

- `specs/cli/change-transition/spec-lock.json`
- `specs/cli/spec-optimizations/spec-lock.json`
- `specs/code-graph/get-graph-health/spec-lock.json`
- `specs/core/change-manifest/spec-lock.json`
- `specs/core/change/spec-lock.json`
- `specs/core/compile-context/spec-lock.json`
- `specs/core/get-artifact-instruction/spec-lock.json`
- `specs/core/get-hook-instructions/spec-lock.json`
- `specs/core/resolve-schema/spec-lock.json`
- `specs/core/schema-format/spec-lock.json`
- `specs/core/schema-merge/spec-lock.json`
- `specs/core/spec-lock/spec-lock.json`
- `specs/core/storage/spec-lock.json`
- `specs/core/transition-change/spec-lock.json`
- `specs/core/update-persisted-spec-optimizations/spec-lock.json`
- `specs/core/validate-artifacts/spec-lock.json`
- `specs/skills/agents/spec-lock.json`
- `specs/skills/workflow-automation/spec-lock.json`

Generated locks are not semantic merge inputs. Each must be valid JSON, contain no conflict markers, and describe the final canonical source. The seven files in the pre-merge stash are compared only after source reconciliation; any useful optimization is regenerated against the new source instead of copying a stale hash.

## New constructs

None. This integration preserves existing public types and functions. It restores one existing command registration inside the extracted program factory and reconciles tests, documentation, manifests, and generated metadata.

## Data models & Contracts

### Hook command contract

```ts
export type HookPhaseSelector = 'source.pre' | 'source.post' | 'target.pre' | 'target.post' | 'all'

export interface RunStepHooksInput {
  readonly name: string
  readonly step: string
  readonly phase: 'pre' | 'post'
  readonly only?: string | undefined
}

export function translateHookCommand(command: string, host: 'posix' | 'cmd'): string
```

The `command` passed to `translateHookCommand` is already expanded. Values are inserted verbatim, unknown placeholders survive, and translation changes only incompatible quote syntax. Percent characters and unquoted text are not rewritten.

### Manifest merge contract

`history` remains an append-only ordered array. Events from both branches are retained exactly once and sorted by their recorded timestamps; no event receives a synthetic replacement timestamp. Materialized fields such as artifact state, drift, validity, approvals, and verification evidence must agree with the final event history and current artifact files after SpecD reconciliation.

### Generated metadata contract

Every `spec-lock.json` is a derived JSON projection of the final canonical spec artifacts and dependency graph. A lock is accepted only when it parses, contains no merge markers, and SpecD metadata/status commands no longer report it as an invalid fingerprint input.

## Approach & Execution flow

1. Resolve the canonical hook spec to the merged binding-driven and host-portable contract. Review the already-auto-merged hook production path against it before changing production code.
2. Reconcile CLI construction by keeping `index.ts` minimal and moving the feature-only verification registration into `createProgram()` alongside `main`'s guide registration.
3. Resolve integration tests semantically: preserve feature lifecycle assertions and `main` portability helpers; normalize the graph-test timeout without dropping scenarios.
4. Resolve docs into the new topology. Merge both branches' accurate content into `cli-reference.md` and `workflow.md`, verify mapped canonical guide pages already carry the remaining concepts, and accept deletion of obsolete paths.
5. Merge root scripts as a union of capabilities, then regenerate `pnpm-lock.yaml` from package manifests.
6. Union the active `implementation-snapshot` event histories chronologically and allow canonical status reconciliation to update derived projections.
7. Refresh all 18 conflicted spec locks from resolved sources. Compare the pre-merge stash selectively and leave it untouched until every candidate has been evaluated.
8. Confirm `git diff --name-only --diff-filter=U` is empty and scan for conflict markers. Stage the semantic resolutions and complete the pending merge commit without squashing either parent.
9. Re-index the code graph, validate specs/change artifacts, run focused package tests, then run repository typecheck, lint, expanded tests, documentation coverage, and build/preflight checks.

No lifecycle API, storage schema, or public TypeScript signature changes are introduced. The only normative behavior refinement is the combined hook-command contract.

## Error handling & Edge cases

- If a hook placeholder is unknown, leave it unchanged; do not throw and do not erase it.
- If a substituted value contains spaces or shell metacharacters, preserve it verbatim. Correct grouping is the hook author's responsibility; callers do not add quoting.
- If a quote form is unsupported by the selected host, translate that syntax after expansion. Do not reinterpret percent characters or perform general shell escaping.
- If either branch's repository test implies manifest mutation during a read, prefer the current canonical load contract: return fresh facts without a hidden write or duplicate invalidation.
- If the manifest histories contain the same event identity, retain one copy; if they contain independent events, retain both chronologically. Invalid JSON or non-monotonic history blocks resolution.
- If a generated lock cannot be refreshed, leave the conflict unresolved and report the canonical source or optimization failure. Never fabricate hashes.
- If regenerated `pnpm-lock.yaml` changes unrelated dependency versions, stop and diagnose the package-manager version or manifest drift before staging it.
- If deleted documentation contains a current statement absent from every mapped canonical page, port that statement before deletion; broken relative links or obsolete commands are failures.
- If tests show the auto-merged hook production code violates the merged contract, make the smallest source correction while preserving all public signatures and hexagonal dependency direction.

## Key decisions

- **Canonical sources before derived files.** Resolve specs, code contracts, package manifests, and docs before locks. Rejected: merging `spec-lock.json` or `pnpm-lock.yaml` conflict blocks by hand, because their hashes and dependency projections would not be trustworthy.
- **Extracted CLI factory is authoritative.** `index.ts` remains a thin executable and `createProgram()` owns registration. Rejected: restoring the feature's monolithic entrypoint, because it would duplicate command wiring and lose `main`'s reusable factory/guide command.
- **Preserve feature lifecycle semantics and layer portability.** Binding selection, explicit verification, and read-only repository behavior stay intact while host quote translation is added. Rejected: choosing either branch wholesale, because each contains independent required behavior.
- **Adopt the new documentation topology.** Obsolete paths stay deleted and current content lives in canonical guide pages. Rejected: resurrecting removed directories merely to clear modify/delete conflicts.
- **History union, not winner selection.** Independent invalidations from both parents remain auditable. Rejected: choosing the newest whole manifest, which would erase valid events from the other parent.
- **Other active changes remain isolated.** Their overlap does not authorize importing their artifacts. Rejected: cross-change integration, because the user explicitly scoped those changes to `main`.

## Trade-offs

- CRITICAL graph impact from a small textual conflict surface → keep signatures stable, run focused tests first, then the expanded repository matrix.
- Regenerating locks may rewrite optimization metadata beyond conflict hunks → accept deterministic derived changes, review source hashes, and avoid manual preservation of stale payloads.
- Deleting old docs can obscure feature-only prose → compare unique passages against explicit destination pages before staging deletions and run link/documentation coverage.
- Chronological manifest union is more verbose than selecting one parent → preserve audit correctness; use canonical projection/reconciliation to maintain readability and validity.
- The pre-merge stash remains temporarily present → document it as a recovery artifact and review it file by file after reconciliation, never by bulk pop.

## Spec impact

`core:hook-execution-model` is the only normative spec modification. Its merged requirement is backward compatible for correctly authored hooks: binding selection and failure semantics are unchanged, and values previously expanded by callers remain verbatim. The new restriction removes caller-side escaping and centralizes only host-incompatible quote translation in `HookRunner`.

Graph analysis rates its ripple **CRITICAL**: 11 direct, 13 indirect, and 67 transitive dependents; 61 affected implementation/test files; and 91 affected specs across core, CLI, SDK, and skills. The scoped no-op specs provide semantic checkpoints for the most relevant surfaces: `core:transition-change`, `core:run-step-hooks`, `cli:change-transition`, `skills:workflow-automation`, `core:change`, and the repository/entrypoint/indexer contracts. Their existing requirements remain satisfied, so no further normative delta is required.

The exact nine-file indexed implementation/review set (`cli:src/index.ts`, `cli:src/program.ts`, the five hook-path production files, the core repository integration test, and the code-graph integration test) produces a combined **CRITICAL** impact: 286 direct, 561 indirect, and 472 transitive dependents across 261 affected files. The breadth comes from the lifecycle/hook composition path and repository coverage links; the CLI factory itself has two direct consumers and retains its signature. Documentation, root manifests, and generated lock files are not indexable file selectors and are covered by explicit validation tasks instead.

## Dependency map

```mermaid
graph LR
  IDX[cli/src/index.ts] --> CP[createProgram(): Command]
  CP --> VERIFY[registerChangeVerification]
  CP --> GUIDE[registerGuideCommand]
  TRANS[TransitionChange effects] --> RSH[RunStepHooks]
  RSH --> EXP[TemplateExpander: verbatim]
  EXP --> HR[NodeHookRunner]
  HR --> QUOTE[translateHookCommand]
  HSPEC[core:hook-execution-model] --> TRANS
  HSPEC --> RSH
  HSPEC --> CLI[cli:change-transition]
  HSPEC --> SKILL[skills:workflow-automation]
  CANON[canonical specs] --> LOCKS[18 regenerated spec-lock files]
  PKG[package manifests] --> PNPM[pnpm-lock.yaml]
  OLD[obsolete docs paths] --> DOCS[canonical guide pages]
```

```text
┌───────────────────────┐     ┌──────────────────────────┐
│ packages/cli/index.ts │────▶│ createProgram(): Command │
└───────────────────────┘     └────────────┬─────────────┘
                                           ├── verification command
                                           └── guide command

┌──────────────────────────┐    ┌──────────────┐    ┌────────────────┐
│ binding-selected effects │───▶│ RunStepHooks │───▶│ verbatim expand│
└──────────────────────────┘    └──────────────┘    └───────┬────────┘
                                                            ▼
                                                 ┌────────────────────┐
                                                 │ host quote translate│
                                                 └────────────────────┘

canonical specs ──▶ regenerated locks     package manifests ──▶ pnpm lock
old docs paths  ──▶ canonical guide pages branch histories  ──▶ ordered union
```

## Migration / Rollback

There is no runtime data migration or public API migration. Integration is a Git merge plus deterministic metadata regeneration.

Deployment sequence: resolve and stage every conflict, regenerate locks, complete the two-parent merge commit, rebuild packages, and run the verification matrix. Do not publish from a conflict-bearing or partially indexed tree.

Rollback uses Git's merge commit as the atomic boundary: revert the completed merge commit if integration must be withdrawn. Before that commit, individual conflict resolutions remain recoverable from merge stages `:2` and `:3`, and the named pre-merge stash remains available. Never roll back with a hard reset that could discard unrelated user work.

## Testing

### Automated tests

- Core repository integration:
  ```bash
  pnpm --filter @specd/core test -- test/infrastructure/fs/change-repository.spec.ts
  ```
  Assert load-time hash mismatch returns fresh `in-progress`/drift facts without a manifest write or duplicate invalidation; revalidation is stable; pre-hash cleanup and newline normalization remain portable.
- Hook semantics:
  ```bash
  pnpm --filter @specd/core test -- test/application/template-expander.spec.ts test/application/use-cases/run-step-hooks.spec.ts test/infrastructure/node/hook-runner.spec.ts test/infrastructure/node/translate-hook-command.spec.ts
  ```
  Assert known variables are verbatim, unknown placeholders survive, already quoted values receive no extra quotes, POSIX/cmd quote syntax translates after expansion, and transition/archive callers do not pre-escape.
- CLI assembly and lifecycle registration:
  ```bash
  pnpm --filter @specd/cli test -- test/documentation-coverage.spec.ts test/commands/change/verification.spec.ts test/commands/change.spec.ts
  ```
  Assert `createProgram()` exposes guide and verification commands, transition flags and repair-guide behavior remain available, and `index.ts` has no duplicate registration.
- Code-graph integration:
  ```bash
  pnpm --filter @specd/code-graph test -- test/application/use-cases/index-project-graph-integration.spec.ts
  ```
  Assert all existing scenarios pass with the portable timeout and workspace fixtures.
- Documentation/link coverage:
  ```bash
  pnpm --filter @specd/cli test -- test/documentation-coverage.spec.ts
  pnpm --filter @specd/public-web test
  ```
  Assert no link targets deleted `docs/config` or `_sections`, and canonical guide/CLI pages expose lifecycle, configuration, hooks, and verification content.
- Repository gates:
  ```bash
  pnpm typecheck
  pnpm lint
  pnpm test
  pnpm build
  pnpm preflight:check
  ```
  Expected result: every command exits zero using the expanded root test matrix.

### SpecD and merge verification

1. Run `git diff --name-only --diff-filter=U`; expected output is empty.
2. Search tracked source, docs, specs, manifests, and locks for `<<<<<<<`, `=======`, or `>>>>>>>`; expected result is no merge marker.
3. Run `node packages/cli/dist/index.js graph index --format toon`; expected result is a current graph with complete coverage and no stale warning.
4. Run `node packages/cli/dist/index.js project status --context --graph --format toon`; expected result is 293 readable specs, no `FINGERPRINT_INPUT_ERROR`, and all 16 workspaces owned as configured.
5. Run `node packages/cli/dist/index.js changes validate reconcile-lifecycle-transitions-with-main core:hook-execution-model --artifact specs --format text` and the corresponding `verify` validation; expected result is pass and a diff containing binding-driven hook selection plus verbatim/host-quote behavior.
6. Run the change's full artifact validation/status. Expected result is structurally valid artifacts and no unresolved input errors.
7. Invoke `node packages/cli/dist/index.js changes verification --help` and `node packages/cli/dist/index.js guide --help`; expected result is successful help output from the extracted `createProgram()` tree.

Every verification scenario is covered: default transition/archive hook delegation is exercised by transition/run-step-hook tests; template substitution, unknown variables, author-owned quoting, and host-incompatible quote translation are exercised by template/hook-runner tests; all no-op spec surfaces are covered by their focused conflict tests plus typecheck, expanded tests, docs coverage, and SpecD validation.
