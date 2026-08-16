# Fresh Compliance Audit — CLI, SDK, and Core VCS Hosts

## Conclusion

**NOT COMPLIANT.** The four findings from the previous audit have been remediated or reconciled, and the requested atomic mutation, Code Graph-owned search, structured graph-health, VCS exclusion ownership, phase-metric, and forced-full-rebuild checks are materially correct. However, the merged `cli:graph-index` contract still mandates parent-process locking and child-worker isolation that do not exist anywhere in `packages/cli/src`, and `sdk:run-index-project-graph` still bypasses the lifecycle helper explicitly required by its orchestration requirement.

## Requirements Summary

All merged requirements and verification scenarios were reloaded with `changes spec-preview`; code navigation started from the current graph.

| Spec                               | Requirements | Conformant | Partial | Non-conformant |
| ---------------------------------- | -----------: | ---------: | ------: | -------------: |
| `cli:change-implementation`        |            9 |          9 |       0 |              0 |
| `sdk:build-implementation-review`  |            5 |          5 |       0 |              0 |
| `cli:graph-impact`                 |            9 |          9 |       0 |              0 |
| `cli:graph-search`                 |            7 |          7 |       0 |              0 |
| `cli:change-status`                |           13 |         13 |       0 |              0 |
| `sdk:composition`                  |            7 |          7 |       0 |              0 |
| `cli:graph-index`                  |            6 |          5 |       0 |              1 |
| `sdk:run-index-project-graph`      |            5 |          4 |       1 |              0 |
| `cli:graph-stats`                  |            6 |          6 |       0 |              0 |
| `core:vcs-adapter-port`            |           12 |         12 |       0 |              0 |
| `core:vcs-implementation-detector` |            5 |          5 |       0 |              0 |
| **Total**                          |       **84** |     **82** |   **1** |          **1** |

## Previous Findings Recheck

### H-1 — Atomic multi-file implementation mutations: resolved

- The CLI now sends the complete normalized file batch in one Core call (`packages/cli/src/commands/change/implementation.ts:271-283`) rather than mutating one file at a time.
- Core deduplicates the batch, validates every member through `Promise.all`, and only then applies entity mutations inside one repository mutation callback (`packages/core/src/application/use-cases/update-implementation-tracking.ts:83-105`).
- Core tests prove no partial resolve, unresolve, or ignore state when a later member is invalid. The CLI test proves one batch call for comma-separated input.
- The `Resolve`, `Unresolve`, and `Ignore` requirements are now compliant.

### H-2 — VCS detector exclusion ownership: resolved by explicit contract reconciliation

- The merged spec now explicitly permits the generic `ImplementationDetectorOptions.excludePaths` policy after repository-to-project rebasing while prohibiting Code Graph configuration/effective visibility.
- `VcsImplementationDetector` receives only caller options, filters after rebasing, and does not import graph configuration, graph defaults, allowed paths, channel selection, or graph fingerprint logic.
- Existing exclusion tests now match the merged contract. The adapter remains responsible only for complete repository-root-relative enumeration.

### M-1 — Graph-stats warning prose versus reason codes: resolved

- The merged spec now makes canonical state, stale latch, content freshness, coverage, schema/generation status, workspace details, and stable reason codes authoritative; exact legacy warning prose/stderr placement is no longer required.
- Text output renders those dimensions separately. JSON/TOON preserve the canonical values and retain compatibility fields.
- A live `graph stats --format json` read during this audit exposed counts, legacy projections, aggregate state, global latch, all workspace health entries, content/coverage/schema/generation values, coverage reasons, and stable reason codes. Dirty state was not mislabeled as unqualified current.

### M-2 — Graph-stats workspace discovery duplication: resolved by contract clarification

- The merged spec now requires provider composition to share the host's resolved configuration and kernel workspace definitions, while explicitly prohibiting the CLI from repeating workspace discovery.
- `registerGraphStats` opens the SDK host once, opens the bound provider through `withOpenGraphProvider`, and calls `provider.getGraphHealth()` exactly once. It does not run an independent workspace/freshness pipeline.

## Per-spec Implementation Status

### `cli:change-implementation` — compliant (9/9)

- Command group and list/add/resolve/unresolve/ignore/remove/review surfaces are present.
- List/review render the SDK projection, preserve stored values, show all tracked states, structured resolution outcomes, candidates, paths, graph health, and out-of-scope sidecars.
- Add/remove retain explicit-file versus symbol-container semantics through Core.
- Resolve/unresolve/ignore batches are now validated atomically before mutation; removed/untracked/missing constraints remain enforced.
- Active-change paths remain raw project-relative paths rather than `workspace:path` identities.

### `sdk:build-implementation-review` — compliant (5/5)

- One Core review read, one opened provider lifecycle, one graph-health snapshot, and one resolver batch.
- Stored spec/file/symbol values and ordering remain unchanged; file-only links bypass resolution.
- Full structured resolution outcomes and provenance are retained, while provider/lifecycle failures propagate rather than becoming false missing outcomes.
- CLI implementation list/review and change status share this projection.

### `cli:graph-impact` — compliant (9/9)

- Target-family validation, direction aliases, depth/context handling, file/symbol/spec/export delegation, provider availability, path presentation, aggregate fields, deterministic ambiguity handling, and structured errors are implemented.
- Covering-spec evidence is returned by Code Graph and only presented by the CLI; the CLI does not derive coverage.

### `cli:graph-search` — compliant (7/7)

- Category flags form one `SearchCodeGraphInput`; the CLI performs exactly one `provider.search(...)` call.
- `CodeGraphProviderImpl.search` delegates to `SearchCodeGraph`, which owns semantic/content lanes, query expansion, ranking, logical grouping, symbol/file overlap suppression, post-suppression limits, and deterministic category results.
- CLI logic is limited to option validation, request construction, display-path lookup, and presentation. It does not invoke lower-level per-category searches, merge candidates, rerank, or deduplicate.
- Files/specs/documents/symbols, exact ranges, match kinds, snippets, filters, and empty results are represented as specified.

### `cli:change-status` — compliant (13/13)

- Draft/active read models, schema warnings, DAG/display/task information, blockers, next actions, details, dependencies, and errors remain intact.
- Implementation details are opt-in and use the same SDK projection as implementation list/review without local resolution policy.

### `sdk:composition` — compliant (7/7)

- SDK remains a host/orchestration layer over public Core and Code Graph APIs.
- Public barrels expose host context, lifecycle helpers, implementation review, project indexing, complete index result/phase metric types, health/resolution/search/impact host types, and version constants.
- Concrete storage/VCS infrastructure implementations remain absent from the root public surface; `VcsAdapter` is correctly public as a port runtime value from Core.

### `cli:graph-index` — non-compliant (5/6)

- **Command signature — compliant.** Force, repeatable exclude paths, config/path exclusivity, and formats exist.
- **Indexing behaviour — non-conformant.** The merged requirement mandates: parent acquisition of the shared graph lock; child process spawned with inherited arguments and `SPECD_GRAPH_INDEX_WORKER=true`/`SPECD_GRAPH_INDEX_LOCK_HELD=true`; signal forwarding; lock release and worker exit propagation; and a `SPECD_GRAPH_INDEX_NO_WORKER=true` test bypass. `registerGraphIndex` directly resolves context and calls `runIndexProjectGraph` in the current process (`packages/cli/src/commands/graph/index-graph.ts:55-108`). Repository-wide search of `packages/cli/src` finds no worker/lock environment variables, `acquireGraphIndexLock`, `child_process`, or `spawn` implementation.
- **Output — compliant.** Counts, workspaces, errors, phase metrics, and full-rebuild diagnostics are rendered; JSON/TOON emit the complete result.
- **Errors — compliant for the implemented current-process path**, including infrastructure exit 3 and per-file error preservation, but the required lock/worker error path is absent under the failed indexing-behaviour requirement.
- **Documentation and visible incompatibility repair — compliant.** Repair is delegated, never backend-file deletion; full rebuild status/reason remain visible.

### `sdk:run-index-project-graph` — partially compliant (4 conformant, 1 partial)

- **Orchestration — partial.** Config, `ListWorkspaces`, filters, graph config, VCS root/ref, force, progress, provider indexing, existing-provider ownership, and transient cleanup are correct. However, the merged requirement explicitly says the transient path SHALL run inside `withOpenGraphProvider(...)`; the implementation instead creates the provider and duplicates lifecycle/cleanup locally around `openForIndexing` (`packages/sdk/src/orchestration/run-index-project-graph.ts:111-145`). This local path is understandable because schema repair needs indexing-specific open behavior, but the literal orchestration contract and implementation differ.
- **Lock out of scope — compliant.** No CLI lock is acquired in SDK orchestration.
- **Progress — compliant.** Callback passes through unchanged.
- **Result — compliant.** Spread projection retains counts, errors, workspace data, `phaseMetrics`, and provider fields.
- **Repair lifecycle — compliant.** Provider-owned repair diagnostics are preserved; forced execution projects `fullRebuild: true`; repair/forced reason is retained; hooks and cleanup run once.

### `cli:graph-stats` — compliant (6/6)

- One standard SDK host/provider lifecycle and one canonical health call.
- No CLI lock probe or independent workspace/freshness computation.
- Text renders counts plus aggregate state, global latch, content freshness, complete coverage categories, schema/generation compatibility, non-current workspaces, and reason codes.
- JSON/TOON retain all known health fields; the `...stats` spread also preserves additional provider fields not singled out for text presentation.
- Provider busy/stale/open/read failures remain infrastructure errors.

### `core:vcs-adapter-port` — compliant (12/12)

- Abstract public port, protected construction, repository root, branch, clean state, stable ref, historical ref, revision content, complete changed-file enumeration, identity, static default detection, and Null behavior are implemented.
- Git/Hg/SVN adapters normalize repository-root-relative paths, include staged/unstaged/untracked/deleted/rename sides, and reject backend failures rather than reporting false-clean results.
- No graph visibility or diff-fingerprint policy exists in the port/adapters.

### `core:vcs-implementation-detector` — compliant (5/5)

- Implements the detector port and delegates backend behavior to `VcsAdapter`.
- Resolves first-implementing timestamp -> `refAt` -> fallback `ref` -> `modifiedFiles`.
- Canonically rebases repository paths to the project, rejects outside paths, normalizes separators, deduplicates, sorts, and preserves rename/deletion candidates.
- Applies only generic caller-provided implementation exclusions and remains workspace/Code-Graph-policy agnostic.

## Requested Cross-cutting Checks

### Atomic multi-file mutations

Implemented and directly tested at Core for resolve/unresolve/ignore; CLI sends one batch. **Pass.**

### Code Graph-owned search

CLI constructs/presents one request/result; Code Graph owns query planning, semantic and persisted-content candidate lanes, suppression, ranking, grouping, and final limits. **Pass.**

### Complete structured graph stats

Aggregate state, stale latch, workspace states/modes/reasons, content/coverage/schema/generation, coverage breakdown/reasons, reason codes, compatibility projections, and ordinary graph counts are retained. **Pass.**

### VCS exclusion ownership

VCS adapters enumerate complete changes; implementation detector may apply only generic caller exclusions; graph visibility remains Code Graph-owned. **Pass.**

### Phase metrics

`IndexResult.phaseMetrics` provides stable metrics for import resolution, dependency facts, adapter relations, reexports, hierarchy/overrides, persistence, and search-index rebuild. SDK result spread preserves them; CLI structured output is lossless and text renders each count/duration. **Pass, with missing CLI assertions noted below.**

### Forced full-rebuild projection

SDK sets `fullRebuild` when provider repair occurred **or** `force === true`, preserves the provider/index reason, and the CLI renders the flag/reason in text while structured modes return them unchanged. The SDK test explicitly covers forced projection. **Pass.**

## Discrepancies

### HIGH — Required graph-index worker isolation and locking are absent

- Contract: parent lock acquisition, spawned worker, environment handoff, inherited stdio, signal forwarding, exit propagation, lock release, and test-only no-worker bypass.
- Evidence: `packages/cli/src/commands/graph/index-graph.ts` directly calls SDK indexing; no corresponding worker/lock symbols or environment variables exist in `packages/cli/src`.
- Impact: the promised concurrent-index exclusion and native-thread process isolation are not implemented; the lock-specific exit-3 path cannot occur.
- Resolution possibilities: implement the adapter workflow as specified, or remove the worker/lock requirements if the accepted architecture intentionally returned to provider-owned/current-process execution.

### MEDIUM — SDK transient indexing does not use its specified lifecycle helper

- Contract: `runIndexProjectGraph` transient execution SHALL use `withOpenGraphProvider` with hooks.
- Evidence: SDK imports no lifecycle helper and implements local open/close/hook handling around `openForIndexing`.
- Impact: behavior is tested and repair-capable, but lifecycle semantics are duplicated and can drift from the shared host helper.
- Resolution possibilities: add an indexing-aware option/helper and use it, or update the orchestration requirement to explicitly authorize the current indexing-specific lifecycle.

## Test Coverage

Focused tests executed in this fresh audit:

- SDK: **25/25 passed** — implementation review, indexing orchestration, public barrel.
- CLI: **93/93 passed** — implementation review/status, impact/search/index/stats.
- Core: **57/57 passed** — atomic update use case, VCS detector, Git/Hg/SVN/Null adapters, public barrel.
- Code Graph: **11/11 passed** — unified search orchestration and index result/phase behavior.
- **Total: 186/186 passed, 0 failed.**

The live graph was current at audit entry. A later read of real graph stats correctly returned a complete canonical dirty-state projection while concurrent workspace edits had made the Code Graph workspace content-dirty; this is evidence that stats does not collapse dirty state into a false-current presentation.

## Missing Tests

1. No CLI tests exist for the mandated graph-index worker spawn, parent lock acquisition/release, environment handoff, signal forwarding, worker exit propagation, or `SPECD_GRAPH_INDEX_NO_WORKER` bypass—consistent with the missing implementation.
2. `graph-index.spec.ts` supplies phase metrics but its text assertion does not verify the `phases:` block, individual counts/durations, or structured preservation.
3. No CLI graph-index test asserts text and JSON/TOON rendering of forced `fullRebuild: true` plus its reason; only SDK forced projection is directly tested.
4. Graph-stats tests mostly construct legacy-minimal health mocks. Add a structured projection test containing aggregate state, latch, multiple workspaces, complete coverage breakdown/reasons, and schema/generation diagnostics to guard against future field loss.
5. The transient SDK lifecycle test verifies hooks/close behavior but does not assert use of `withOpenGraphProvider`; current implementation cannot satisfy such a test without contract/architecture reconciliation.
6. Baseline Git/Hg/SVN tests remain comparatively sparse for historical `refAt`, `show` missing revision/path, clean/dirty, and detached-branch scenarios, although the change-focused modified-file/ref contracts are well covered.

## Spec Dependency Chain

- `cli:change-implementation`, `cli:change-status` -> `sdk:build-implementation-review` -> Core authoritative tracking + Code Graph health/resolution.
- `cli:graph-search` -> SDK provider lifecycle -> `CodeGraphProvider.search` -> `SearchCodeGraph` -> graph-store semantic/source/spec/document candidate indexes.
- `cli:graph-impact` -> SDK provider lifecycle -> Code Graph selector resolution/traversal -> indexed dependency and coverage evidence.
- `cli:graph-index` -> SDK host context -> `sdk:run-index-project-graph` -> Core config/workspaces/VCS + Code Graph indexing/repair. The missing CLI worker/lock adapter is the principal unresolved dependency edge.
- `cli:graph-stats` -> SDK host/provider composition -> canonical Code Graph health -> persisted index session/coverage + VCS/content/derivation/schema-generation checks.
- `core:vcs-implementation-detector` -> `core:implementation-detector-port` + `core:vcs-adapter-port` -> Git/Hg/SVN/Null implementations -> implementation-tracking refresh.
- Global architecture/conventions/error/testing contracts were checked: package direction, public port imports, delivery-neutral orchestration, standardized infrastructure errors, and test placement are otherwise consistent.

## Summary Counts

- Specs audited: **11**
- Requirements assessed: **84**
- Conformant: **82**
- Partial: **1**
- Non-conformant: **1**
- Discrepancies: **2** — 1 HIGH, 1 MEDIUM
- Previous findings resolved/reconciled: **4/4**
- Focused tests: **186 passed, 0 failed**
- Final conclusion: **NOT COMPLIANT**
