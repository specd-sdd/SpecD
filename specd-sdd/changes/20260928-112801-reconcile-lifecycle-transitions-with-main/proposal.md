# Proposal: reconcile-lifecycle-transitions-with-main

## Motivation

`feat/lifecycle-transitions-ux` and `main` evolved independently across the lifecycle model, portability, CLI composition, documentation, code-graph integration, and spec metadata. Merging either side mechanically would discard valid behavior or retain obsolete repository structure, so the integrated tree needs an explicit semantic reconciliation now that both branches' canonical specs are present.

## Current behaviour

The feature branch was five commits ahead and twenty-four commits behind `main` at merge time, from merge base `0c1053f6` to feature HEAD `3b2a1796e` and `main` HEAD `083baaca0`.

The feature side introduced the transition-check registry, versioned approval and validity projections, explicit verification attempts, and the corresponding core, CLI, skill, test, documentation, and spec contracts. The `main` side introduced the standalone `guide` workspace, a new documentation layout, Windows/POSIX portability rules and fixes, CLI program extraction, and broader code-graph behavior.

The merge is open. Most production and spec sources combined automatically, but several code, test, documentation, manifest, package, and generated metadata files remain conflicted. In particular, `core:hook-execution-model` contains two compatible but textually conflicting requirements: binding-driven lifecycle hook execution from the feature and verbatim, host-portable hook command handling from `main`. Eighteen `spec-lock.json` files are currently invalid JSON because they still contain conflict markers, which prevents complete fingerprinting and spec indexing.

## Proposed solution

Reconcile the integrated tree from canonical behavior outward:

1. Preserve the feature's lifecycle, approval, verification, and binding-driven hook semantics unless an integrated canonical spec explicitly supersedes them.
2. Incorporate `main`'s portability contract, including verbatim `run:` substitution and host-shell quote translation, without reverting to caller-side shell escaping.
3. Port lifecycle CLI registration into `main`'s extracted `createProgram()` structure instead of retaining the obsolete monolithic entrypoint.
4. Keep portable repository and code-graph test fixtures while retaining the feature assertions they exercise.
5. Move still-relevant feature documentation into the canonical `docs/` and `@specd/guide` structure; do not resurrect paths removed by `main` merely to settle modify/delete conflicts.
6. Preserve both branches' independent append-only invalidation history in the active `implementation-snapshot` manifest.
7. Resolve canonical spec content first, then regenerate or refresh lock metadata from that content rather than manually merging generated optimization fields.
8. Re-index the graph and validate the integrated specs, tests, type checks, and documentation after all conflict markers are gone.

## Specs affected

### New specs

None.

### Modified specs

- `core:hook-execution-model`: combine binding-driven transition/archive effect selection with `main`'s host-portable, verbatim hook command contract; this is the only expected normative delta.
  - Depends on (added): none.
  - Depends on (removed): none.
- `core:change`: preserve the integrated lifecycle, approval, verification, and validity model while applying the merged portability constraints; use a no-op delta unless semantic review finds an actual contract gap.
  - Depends on (added): none.
  - Depends on (removed): none.
- `core:change-manifest`: anchor semantic review of the append-only manifest-history union and regenerated metadata; use a no-op delta unless the union exposes a missing persistence requirement.
  - Depends on (added): none.
  - Depends on (removed): none.
- `core:transition-change`: ensure the reconciled implementation continues to select registered predicates/effects and applies manual `--skip-hooks` control under the integrated contract; expected no-op delta.
  - Depends on (added): none.
  - Depends on (removed): none.
- `core:run-step-hooks`: cover the shared execution engine retained by the hook-model reconciliation; expected no-op delta.
  - Depends on (added): none.
  - Depends on (removed): none.
- `core:fs-change-repository`: cover portable filesystem persistence and the merged manifest representation exercised by the conflicted integration test; expected no-op delta.
  - Depends on (added): none.
  - Depends on (removed): none.
- `core:change-repository-port`: preserve the repository abstraction and persisted change contract while resolving its filesystem integration test; expected no-op delta.
  - Depends on (added): none.
  - Depends on (removed): none.
- `cli:entrypoint`: port lifecycle command registration into `main`'s decoupled `createProgram()` entrypoint without restoring removed monolithic setup; expected no-op delta.
  - Depends on (added): none.
  - Depends on (removed): none.
- `cli:change-transition`: preserve lifecycle transition flags, hook selectors, output, and exit semantics after the entrypoint port; expected no-op delta.
  - Depends on (added): none.
  - Depends on (removed): none.
- `code-graph:indexer`: retain `main`'s integrated indexing behavior and workspace coverage while resolving feature-side integration assertions; expected no-op delta.
  - Depends on (added): none.
  - Depends on (removed): none.
- `code-graph:index-project-graph`: cover the portable multi-workspace integration fixture and its expected graph results; expected no-op delta.
  - Depends on (added): none.
  - Depends on (removed): none.
- `default:_global/testing`: enforce the already-canonical POSIX/Windows test constraints during conflict resolution; expected no-op delta.
  - Depends on (added): none.
  - Depends on (removed): none.
- `default:_global/docs`: enforce the new documentation locations, guide frontmatter, and accurate hook-command terminology while relocating feature content; expected no-op delta.
  - Depends on (added): none.
  - Depends on (removed): none.
- `guide:conventions`: retain the standalone guide package boundary and its package deliverables while adopting it as the canonical destination for user guidance; expected no-op delta.
  - Depends on (added): none.
  - Depends on (removed): none.
- `skills:workflow-automation`: keep agent workflow instructions aligned with the reconciled lifecycle, explicit verification, and manual hook sequencing; expected no-op delta.
  - Depends on (added): none.
  - Depends on (removed): none.

Overlap with active changes is intentional. `core:change` is also in `implementation-snapshot` and `report-overlap-dependency-changes`; `core:change-manifest` is also in `report-overlap-dependency-changes`; and `code-graph:indexer` is also in `code-graph-symbol-semantic-context`. Those changes target `main`, not this feature branch, and are outside this change's integration scope. Their artifacts will not be imported or reconciled here; this change uses only the canonical specs present in the merged working tree.

## Impact

The immediate conflict surface includes:

- `packages/cli/src/index.ts` and root package/lock files, where lifecycle command registration must fit `main`'s extracted CLI construction and new guide dependency.
- `packages/core/test/infrastructure/fs/change-repository.spec.ts`, where persisted lifecycle projections and manifest history must coexist with portable path fixtures.
- `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts`, where the richer graph assertions must use portable workspace paths.
- `docs/cli/cli-reference.md`, `docs/guide/workflow.md`, and five feature-side files deleted by `main`, whose surviving content must move into the canonical documentation topology.
- `specs/core/hook-execution-model/spec.md`, the only canonical spec source with unresolved conflict markers.
- Eighteen conflicted `spec-lock.json` files across core, CLI, code-graph, and skills, to be regenerated after their sources are stable.
- `specd-sdd/changes/20260707-153756-implementation-snapshot/manifest.json`, whose independent invalidation histories must be combined chronologically.

Graph analysis rates the combined implementation surface **CRITICAL**: the selected transition, hook, CLI entrypoint, repository-test, and graph-test files have 239 direct dependents, 396 indirect dependents, and 246 affected files. `Change` is itself a critical hotspot, and `cli:src/index.ts` covers the public CLI command tree. Resolution therefore requires targeted package tests plus repository-wide validation; choosing `ours` or `theirs` wholesale is not acceptable.

## Technical context

- The repository remains TypeScript, ESM-only, hexagonal, and DDD-oriented. Core owns lifecycle behavior; CLI, skills, and guide surfaces delegate to it.
- Canonical spec sources must be resolved before generated locks. Lock conflict markers are metadata failures, not evidence that both generated payloads should be concatenated.
- `TransitionChange` and `ArchiveChange` must retain binding-driven `phase`/`onFailure` selection, with `RunStepHooks` as the shared execution engine. `HookRunner` expands variables verbatim and translates only quote syntax unsupported by the host shell; callers do not shell-escape values.
- `packages/cli/src/index.ts` is a structural port. The merged result must use `createProgram()` and `main`'s command-registration organization while retaining the feature's lifecycle commands and options.
- Documentation follows `default:_global/docs`: user workflow material belongs under canonical `docs/guide/` pages and is consumable by `@specd/guide`; obsolete `_sections` and `docs/config` paths are not restored without a current canonical destination.
- Test reconciliation follows `default:_global/testing`: paths use `node:path`, temp storage uses `os.tmpdir()`, logical text treats CRLF/CR as LF, and portable commands replace POSIX-only assumptions.
- The active `implementation-snapshot` manifest contains feature-side lifecycle invalidations and `main`-side `windows-platform-compatibility` invalidations. Both are append-only audit evidence and must survive in chronological order.
- A pre-merge stash named `pre-main-merge spec-lock refreshes` is a recovery aid only. It must not be popped wholesale; any still-valid optimization is reproduced against reconciled sources.
- The pre-merge change `adapt-lifecycle-transitions-to-main` was discarded because designing before the merge used the wrong canonical baseline.

## Open questions

None. Overlapping specs are explicitly allowed by the user, while the other active changes themselves remain out of scope because they target `main` rather than this branch.
