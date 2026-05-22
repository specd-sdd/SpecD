# Proposal: implementation-file-tracking

## Motivation

Establish formal traceability between requirements (specs) and their realization in code. Current lack of links makes it difficult for agents and humans to understand which code implements which requirement, hindering impact analysis, review, and safe maintenance over time.

## Current behaviour

Specd tracks specs and their artifacts within changes, but implementation files are disconnected from the spec lifecycle.

- `Change` manifests track spec scope but not implementation scope.
- `archive` applies spec deltas but does not persist a durable implementation map alongside the archived specs.
- `code-graph` can infer structure from source code, but it cannot reliably determine which spec a symbol or file was intended to satisfy.
- There is no automated way to surface modified implementation files into a tracked review set for explicit traceability.
- The current artifacts do not define one canonical identity for implementation files across change state, archived sidecars, and graph consumers.

## Proposed solution

Automate implementation file tracking by integrating pluggable implementation detection into the change lifecycle and introducing a unified `implementation` CLI command group for management and integrity review.

At a high level, the change should:

- track implementation files and confirmed implementation links in the change manifest while a change is in progress
- ensure that all implementation management commands (`add`, `resolve`, `ignore`) validate that the target file(s) actually exist on disk; throw an error if any file is missing
- support comma-separated lists of files in the `--file` option for `resolve` and `ignore` subcommands to handle high-volume updates more efficiently
- ensure manifest normalization preserves "tracked-intent" for unvalidated or partially materialized artifacts instead of aggressively rewriting paths
- emit warnings when a loaded change manifest records a schema version or name that differs from the active system schema
- let users and agents explicitly confirm which spec a file or symbol implements
- support two implementation-link granularities: spec-to-file links and spec-to-symbol links
- keep tracked-file review state separate from link creation so detected files remain visible until an explicit review outcome is recorded
- persist the archived implementation map in `spec-lock.json` so traceability survives re-indexing and metadata regeneration
- project that durable implementation data into `metadata.json` and the code graph for fast lookup and impact analysis
- ensure code-graph persistence (SQLite/Ladybug) supports stale `COVERS_SYMBOL` relations with explicit `metadata.stale` flags that survive reload and graph re-indexing
- extend code-graph impact analysis so `graph impact` can reason about `spec -> spec`, `spec -> file`, and `spec -> symbol` relationships rather than only code-structure edges
- align the VCS-facing contracts needed to detect modified implementation files with the new implementation detector flow
- trigger implementation autodetection from `GetStatus`, `CompileContext`, and immediately before state transitions are executed
- keep change-time file paths as raw project-relative inputs, then normalize them at archive time into canonical `workspace:path` identities relative to the owning workspace `codeRoot`
- ensure CLI commands (`change status`, `change implementation`, `graph impact`) fully implement prescribed JSON/TOON help-schemas, including complete artifact DAG state (`hasTasks`, drift-aware projections) and impact aggregate fields
- ensure `change status` default view remains concise; implementation tracking details (tracked files, confirmed links, stale diagnostics) SHALL only be displayed when the `--implementation` flag is provided
- update CLI-facing documentation and help text wherever these new workflows are surfaced so operators can discover the new implementation and requirement-aware impact capabilities, including the new comma-separated list support
- update workflow skill templates to promote the use of comma-separated file lists when many implementation updates are needed

The first iteration focuses on durable Spec -> implementation traceability with symbol-backed graph integration, while keeping tracked implementation file review inside the normal change workflow.

## Specs affected

### New specs

- `core:spec-lock`: formalize `spec-lock.json` as the durable sidecar for schema identity, persisted dependencies, and archived implementation links.
  - Depends on: `core:spec-id-format`, `core:storage`
- `cli:change-implementation`: define the command group for listing tracked implementation files, confirming links, resolving reviewed files, ignoring files, removing links, and running implementation integrity review.
  - Depends on: `core:change`, `code-graph:symbol-model`
- `core:implementation-detector-port`: define the application port for discovering modified implementation files independently of any specific backend implementation.
  - Depends on: `core:change`
- `core:vcs-implementation-detector`: define the VCS-backed implementation of implementation detection that turns VCS worktree state into tracked implementation files.
  - Depends on: `core:implementation-detector-port`, `core:vcs-adapter-port`

### Modified specs

- `core:change`: add change-level implementation tracking concepts and targeted detection triggers so implementation work becomes part of the change lifecycle.
  - Depends on (added): none
- `core:change-manifest`: persist tracked implementation files with review state, confirmed links, and related resolution hints in `manifest.json`.
  - Depends on (added): none
- `core:spec-metadata`: project archived implementation links from `spec-lock.json` into `metadata.json` as derived data.
  - Depends on (added): `core:spec-lock`
- `core:archive-change`: require tracked-file review resolution before archive and materialize confirmed implementation links into archived sidecars; ensure consistency with new archive preflight atomicity requirements.
  - Depends on (added): `core:spec-lock`
- `core:get-status`: extend the status use case so it can trigger targeted implementation detection and return implementation tracking state to delivery layers.
  - Depends on (added): `core:implementation-detector-port`
- `core:compile-context`: trigger targeted implementation detection before compiling context for a change so context consumers see up-to-date tracked implementation files.
  - Depends on (added): `core:implementation-detector-port`
- `core:transition-change`: trigger targeted implementation detection before lifecycle transitions so transition decisions run against current tracked-file review state.
  - Depends on (added): `core:implementation-detector-port`
- `core:vcs-adapter`: keep the VCS factory aligned with the new detector implementation surface so composition can still provide the right backend.
  - Depends on (added): none
- `core:vcs-adapter-port`: extend the VCS port contract with modified-file enumeration and historical baseline resolution so implementation detection can map the first `implementing` timestamp to a backend-agnostic revision.
  - Depends on (added): none
- `cli:change-status`: expose implementation tracking state in the status view by serializing the new implementation fields added to the `GetStatus` result.
  - Depends on (added): none
- `cli:change-status`: enrich stale-symbol diagnostics with a composed-symbol fallback so review output remains usable while code-graph lacks canonical member identities for `X.Y` forms.
  - Depends on (added): none
- `code-graph:symbol-model`: add the relation semantics needed to represent implementation traceability and stale implementation links.
  - Depends on (added): none
- `code-graph:graph-store`: extend the abstract graph-store contract so implementation-traceability relations can be queried consistently by impact and provider layers across backends.
  - Depends on (added): `code-graph:symbol-model`
- `code-graph:traversal`: extend impact semantics beyond code-only traversal so specs participate in impact analysis through `DEPENDS_ON`, file-level implementation links, and symbol-level implementation links.
  - Depends on (added): `code-graph:graph-store`, `code-graph:symbol-model`
- `code-graph:composition`: extend the `CodeGraphProvider` facade with spec-aware impact entry points and any new query methods required by the abstract store contract.
  - Depends on (added): `code-graph:graph-store`, `code-graph:traversal`
- `code-graph:indexer`: read archived implementation traceability from `spec-lock.json` and emit the corresponding `COVERS_FILE` and `COVERS_SYMBOL` graph relations during indexing.
  - Depends on (added): `code-graph:symbol-model`, `code-graph:graph-store`
- `code-graph:sqlite-graph-store`: extend the default graph-store backend so file-level and symbol-level implementation relations are persisted and queried correctly.
  - Depends on (added): `code-graph:graph-store`, `code-graph:symbol-model`
- `code-graph:ladybug-graph-store`: extend the Ladybug graph-store backend so file-level and symbol-level implementation relations are persisted and queried correctly.
  - Depends on (added): `code-graph:graph-store`, `code-graph:symbol-model`
- `cli:graph-impact`: extend the CLI command so impact analysis can target specs directly and surface the new spec/code traceability paths exposed by the code graph.
  - Depends on (added): `code-graph:composition`, `code-graph:traversal`
- `skills:skill-templates-source`: update workflow templates so implementation tracking instructions are part of the generated skill guidance.
  - Depends on (added): none
- `skills:workflow-automation`: define agent expectations around implementation linking, tracked-file resolution, and integrity review.
  - Depends on (added): none

## Impact

- **Domain**: `Change` and `manifest.json` gain durable implementation-tracking state while a change is active, separating tracked files from confirmed links.
- **Core archive and metadata flows**: `ArchiveChange`, `spec-lock.json`, and `metadata.json` gain a new archived traceability path that must stay consistent.
- **VCS integration**: VCS-related contracts and adapters must support modified-file detection plus historical baseline resolution for tracked implementation file discovery.
- **CLI and agent workflow**: change status and implementation-management commands become part of normal authoring and archive preparation.
- **CLI documentation**: command help, examples, and any maintained CLI docs must reflect `change status`, `change implementation`, requirement-aware `graph impact`, and the new archive guard/override behavior.
- **Code graph**: graph consumers gain an explicit requirements-to-code linkage instead of inferring intent only from structure.
- **Impact analysis**: `graph impact` and provider-level impact services expand from code-only traversal into requirement-aware traversal across spec dependencies and implementation traceability edges.
- **Graph storage backends**: both the default SQLite backend and the explicitly selectable Ladybug backend must persist and surface the new implementation relations consistently.

## Technical context

- This change crosses `@specd/core`, `@specd/cli`, `@specd/code-graph`, and `@specd/skills`.
- Inside `@specd/code-graph`, the change is not limited to relation semantics; both built-in graph-store backends (`sqlite` and `ladybug`) must implement the new implementation-link persistence and query behavior so backend choice does not change traceability results.
- Inside `@specd/code-graph`, the change is not limited to persistence. The abstract graph-store contract, traversal semantics, provider facade, and CLI impact command all need to understand requirement-aware graph edges, otherwise the new relations remain stored but unused.
- The indexing path also needs to participate: archived implementation data in `spec-lock.json` must be ingested into graph relations by the code-graph indexer, otherwise the new backend/query/traversal work has no source of truth to load.
- The user-facing CLI surface also needs documentation updates in the command specs and help text so `change implementation`, `graph impact --spec`, and archive guard semantics are discoverable without reading implementation code.
- This change must align with the new archive preflight atomicity requirements introduced in `fix-archive-preflight-atomicity`: all implementation materialization checks (workspace boundary, out-of-scope guards, etc.) MUST be part of the full-batch archive preflight before any permanent spec writes begin.
- The change manifest should store implementation file paths in raw project-relative form because autodetection and manual CLI input do not start from workspace-aware identities.
- The change manifest should separate tracked implementation files from confirmed implementation links.
- The tracked-file collection should be named `trackedImplementationFiles`.
- `trackedImplementationFiles` should remain raw project-relative paths while the change is active and carry explicit review state such as `open`, `resolved`, or `ignored`.
- Confirmed implementation links should also keep raw project-relative file paths while the change is active, with later normalization happening only during materialization.
- Required vs optional fields should be explicit so downstream specs and Zod schemas do not have to infer intent:
  - `trackedImplementationFiles[]`
    - required: `file`, `state`
    - optional: none in the first iteration
  - `implementationLinks[]`
    - required: `specId`, `file`, `fileLinkExplicit`
    - optional: `symbols`
- In the first iteration, omitting `symbols` means the link is file-level only. When present, `symbols` refines that file-level link with symbol-level traceability.
- `fileLinkExplicit: false` should only be valid when `symbols` is present and non-empty, because that combination means the file-level presence exists only as the container for symbol-level links.
- A representative manifest shape should look like:

```jsonc
{
  "trackedImplementationFiles": [
    {
      "file": "packages/core/src/domain/entities/change.ts",
      "state": "open",
    },
    {
      "file": "docs/guide/configuration.md",
      "state": "resolved",
    },
    {
      "file": "pnpm-lock.yaml",
      "state": "ignored",
    },
  ],
  "implementationLinks": [
    {
      "specId": "core:change",
      "file": "packages/core/src/domain/entities/change.ts",
      "fileLinkExplicit": true,
      "symbols": ["Change.invalidate", "Change.transition"],
    },
    {
      "specId": "core:change-manifest",
      "file": "packages/core/src/domain/entities/change.ts",
      "fileLinkExplicit": false,
      "symbols": ["ChangeManifest"],
    },
  ],
}
```

- Autodetection and manual CLI link management should use the same raw path semantics.
- The traceability model should support both file-level links (`spec -> file`) and symbol-level links (`spec -> file -> symbol`). File-level links are first-class durable links, not a degraded fallback.
- `implementation add --spec <id> --file <path>` should create or confirm a file-level link. Adding one or more `--symbol` values should refine that file link with symbol-level traceability.
- Symbol-level links should continue to persist the operator-supplied symbol string verbatim in change state and archived sidecars; this change does not redefine the durable symbol payload format.
- `implementation add` should not implicitly hide a tracked file from review. If the file was not already tracked, adding a manual link should also register it as a tracked implementation file so the broader review surface remains visible to other operators and agents.
- Re-adding a link operates over the `spec + file` set.
- `implementation resolve` should mark that a tracked file has been fully reviewed for the current change: all relevant spec/file/symbol links have been added and there is no more implementation classification work to do for that file. This is distinct from `ignore`, which means the file should not participate in implementation tracking.
- Remove semantics should preserve whether a file-level link was ever created explicitly. Removing symbols from a `spec + file` link should not delete the file-level link when that file was explicitly added on its own at some earlier point. If the file-level presence only exists as the container for symbol-level links, removing the last symbol may remove the whole `spec + file` set.
- `spec-lock.json` should store implementation file identities in canonical `workspace:path` form, where the workspace is the workspace of `specId` and `path` is relative to that workspace `codeRoot`, matching the identity model used by `code-graph`.
- The active change state intentionally accepts raw implementation paths before final eligibility is known; autodetection and manual link management do not apply the full archive-time materialization filters up front.
- Archive-time materialization is responsible for applying the final validation, filtering, and normalization pass over raw manifest paths before anything is persisted into `spec-lock.json`.
- A raw implementation path is eligible for a spec only when it falls inside that spec workspace's `codeRoot`.
- If a linked raw path does not fall inside the `codeRoot` of the workspace implied by `specId`, archive-time materialization should fail because the link is inconsistent with the spec workspace boundary.
- If a raw implementation path falls under that workspace's `graph.excludePaths` rules from project configuration, it should be ignored for materialization rather than treated as an error.
- Raw implementation paths that cannot be normalized into a valid `workspace:path` identity are allowed to exist temporarily in the active change state, but they are discarded from `spec-lock.json` during archive materialization.
- `spec-lock.json` is the intended durable source of truth for archived implementation traceability; `metadata.json` remains a derived projection for fast consumption.
- Modified-file detection needs a clean contract boundary so change lifecycle logic depends on an implementation-detection capability, not on ad hoc VCS-specific behavior scattered across use cases.
- Modified-file detection also needs a backend-agnostic way to translate the first historical `implementing` timestamp into a comparable VCS revision. Modified-file enumeration alone is not sufficient if the detector cannot resolve its baseline consistently across git, hg, and svn.
- The artifacts should distinguish clearly between the detector abstraction, the generic VCS port, and the VCS-backed detector implementation so factory wiring and behavioral requirements do not collapse into one spec by accident.
- The capability to enumerate modified files belongs to the VCS-facing contract, while the `Change` entity itself should only model tracked state and state transitions, not perform detection.
- Autodetection is intentionally demand-driven rather than background-driven: it runs from `GetStatus`, `CompileContext`, and the pre-transition path so the persisted change state is refreshed at the workflow decision points that already gate user and agent actions.
- File-level links and symbol-level links are both coherent with code-graph because graph operations already support file-level impact as well as symbol-level traversal.
- In graph vocabulary, this change should replace the old generic `COVERS` placeholder with two explicit first-class relation types:
  - `COVERS_FILE` for `Spec -> File`
  - `COVERS_SYMBOL` for `Spec -> Symbol`
- The old generic `COVERS` relation should disappear from the affected specs and backends rather than surviving as an overloaded alias.
- `stale` should refer specifically to symbol-level implementation links whose target symbol is no longer present in the graph database; it is not the generic label for workspace-resolution or materialization failures. Staleness detection is a CLI-layer concern — core use cases return raw tracking data, and the CLI enriches it by querying the code graph.
- While code-graph lacks canonical composed member identities, CLI stale-resolution should apply a best-effort fallback for symbols that look like owner-qualified members (for example `X.Y`, `X#Y`, or `X::Y`): if the exact symbol string is not found, the CLI should retry stale resolution against the same file using the rightmost member segment (`Y`) plus the graph-reported symbol kind.
- The fallback should recognize at least these composed-member separators:
  - `.`
  - `#`
  - `::`
- Other separators may be added later, but the first iteration should cover the common class/interface/member forms used across the languages currently relevant to specd and its ecosystem.
- That fallback should be limited to review/status enrichment. It should not rewrite the stored symbol string in `implementationLinks`, should not mutate archived `spec-lock.json`, and should not pretend to resolve symbols across other files.
- If multiple same-file candidates match the fallback member name, the CLI should keep the original symbol marked stale rather than guessing.
- The `code-graph:symbol-model` change therefore implies backend and query-surface work, not just type-level work: `code-graph:graph-store`, `code-graph:composition`, `code-graph:traversal`, `code-graph:sqlite-graph-store`, `code-graph:ladybug-graph-store`, and `cli:graph-impact` all need to understand the new requirement-aware relations.
- `code-graph:indexer` must translate archived `spec-lock.json` implementation entries into `COVERS_FILE` and `COVERS_SYMBOL` relations during indexing; backend storage alone is not enough.
- The abstract graph-store contract likely needs first-class query methods for spec-aware traversal, not just raw persistence. Storing the new relations is not sufficient if callers cannot ask for covering specs/files or spec-implemented symbols through backend-agnostic APIs.
- `graph impact` should evolve from `--file` / `--symbol` only into a requirement-aware impact surface that can also target specs directly and report how spec dependencies, file-level implementation links, and symbol-level implementation links participate in the blast radius.
- Because these capabilities are operator-facing, the change should also refresh the corresponding CLI documentation surfaces: command descriptions, `after` help examples, and any maintained docs that describe graph impact or change lifecycle command usage.
- The first iteration should treat at least these impact families as first-class:
  - `spec -> spec` through `DEPENDS_ON`
  - `spec -> file` through `COVERS_FILE`
  - `spec -> symbol` through `COVERS_SYMBOL`
- Archive-time integrity work may affect sidecars beyond the immediately changed spec artifacts, so downstream specs and design need to be explicit about scope and safety boundaries. By default, archive should fail when those updates go out of scope and require an explicit `--allow-out-of-scope` override to proceed.

## Open questions

- none
