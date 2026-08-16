# Global and Direct-Dependency Consistency Audit

Change: `implementation-review-symbol-resolution`  
Mode: read-only semantic consistency audit  
Scope: all 24 change specs, 108 declared direct-dependency edges, 38 unique dependency specs (24 external to change scope), project-wide directives/global specs, 24 spec artifacts, 24 verify artifacts, `design.md`, and `tasks.md`.

## Conclusion

**NOT COMPLIANT**

No high-severity contradiction was found. Two medium-severity discrepancies remain: obsolete `stale` symbol-resolution vocabulary in two completed tasks, and insufficient verification coverage for the latest unchanged-index requirement that reference facts must not be replaced. Until both are corrected, change artifacts are not mutually consistent.

## Findings

### F1 — Obsolete `stale` resolution status remains in completed tasks

Severity: **MEDIUM**  
Disposition: **discrepancy; blocks COMPLIANT conclusion**

Evidence:

- `tasks.md:138` says task 5.2 distinguishes `resolved`, `ambiguous`, `unresolved`, and `stale`.
- `tasks.md:238` says task 9.2 exposes `resolved`, `ambiguous`, `unresolved`, and `stale`.
- Effective `code-graph:resolve-symbol-reference` requires resolution statuses `resolved | ambiguous | unresolved | missing`; complete fresh absence is `missing`; excluded, unsupported, parse-failed, partial, dirty, stale, or unknown required evidence yields `unresolved` with a reason.
- Effective verification has `Complete fresh absence is missing` and `Coverage failure is not stale` scenarios.
- `design.md` objective states: “`stale` describes indexed inputs, workspaces, and the aggregate graph; it is not a symbol-resolution outcome.” Its `ResolutionStatus` type is `resolved | ambiguous | unresolved | missing`.
- `tasks.md:597-599` task 17.19 records the intended correction: use `resolved | ambiguous | unresolved | missing`; retain stale only in health/input fields.

Assessment:

Later work clearly superseded tasks 5.2 and 9.2, and implementation intent is unambiguous. However, completed task text remains normative planning evidence and directly contradicts current spec vocabulary. Update those two descriptions to `missing`, or annotate them as superseded by 17.19 without leaving an apparent requirement for a fifth/obsolete status.

Spec-drift alternative: if `stale` is intentionally still a resolution status, then effective resolver spec, verify scenarios, design type, SDK/CLI projection requirements, and task 17.19 all require coordinated revision. Current evidence strongly favors stale task wording rather than wrong effective specs.

### F2 — Latest unchanged-index verification does not prove reference facts are preserved without replacement

Severity: **MEDIUM**  
Disposition: **spec/verify semantic parity gap; blocks COMPLIANT conclusion**

Latest filesystem evidence:

- Effective `code-graph:indexer` now requires a fully unchanged generation to preserve the existing semantic reference-fact snapshot while updating metadata/freshness, **without** re-extracting files, replacing reference facts, constructing relations, or rebuilding search indexes.
- Verification scenario `Unchanged targets avoid semantic and search rebuild work` asserts every target skipped, zero files processed, zero relation-phase counts, no search-index rebuild, mtime/size read avoidance, and byte-for-byte equivalent declarations/bindings before and after.
- The scenario does **not** assert that no reference-fact replacement/write operation occurs. Byte-for-byte output equivalence cannot distinguish preservation from destructive replacement with identical values.

Assessment:

Heading parity is intact, and most no-op effects are verified. However, the new normative write-avoidance clause is not observably covered. Add an assertion using an instrumented Store/bulk session that reference-fact replacement/write methods are not invoked on a fully unchanged run, while metadata/freshness updates remain allowed.

Implementation-bug alternative: implementation might already avoid these writes, but current verification artifact would not detect a regression. Spec-drift alternative: if replacement with identical values is acceptable, remove the explicit “without replacing reference facts” requirement. Current wording strongly favors missing verification coverage.

### F3 — Context dependency traversal warns for two new in-change specs

Severity: **LOW / AUDIT LIMITATION**  
Disposition: **not a semantic contradiction**

Evidence:

`changes context ... verifying --include-change-specs --follow-deps --depth 1 --optimized --format toon` reports missing/stale metadata warnings for:

- `code-graph:resolve-symbol-reference`
- `sdk:build-implementation-review`

Both are new spec artifacts inside the active change, and both have explicit `specDependsOn` declarations in change state. Their merged spec/verify content was read directly with `changes spec-preview`, and their direct dependencies were included from `changes deps`/`changes status` rather than inferred from missing materialized metadata.

Assessment:

Warnings reduce confidence in metadata-driven transitive context compilation but do not establish a dependency contradiction. No metadata was generated or modified because this audit was explicitly read-only. Direct dependency coverage remained complete through the manifest declarations.

### F4 — Concurrent artifact drift was cleared; latest state has no lifecycle review blocker

Severity: **INFORMATIONAL / PROCESS**  
Disposition: **review evidence recorded**

Evidence:

Initial `changes status` reported `ARTIFACT_DRIFT` affecting:

- spec and verify: `code-graph:indexer`
- spec and verify: `code-graph:get-graph-health`
- `design.md`
- `tasks.md` pending review

After concurrent artifact review/update, the latest `changes status --format json` reports no blockers, `review.required=false`, and every artifact DAG node `complete`. Latest `changes validate --all --format json` still passes all 51 artifacts. Its sequential validation emits a deferred parity warning for the indexer spec participant, so this audit compared merged requirement headings manually for all 24 pairs. Result: **no requirement-heading mismatches**.

Assessment:

The former drift was a lifecycle review condition, not evidence of a structural or semantic failure by itself, and is now cleared. Manual review of the latest indexer pair found F2: heading parity remains intact, but its newest no-reference-replacement clause lacks a direct observable verify assertion. F1 and F2 remain the substantive discrepancies.

## Highlighted Cross-Cutting Consistency Checks

### Terminal excluded/unsupported aggregate coverage versus targeted resolution

Result: **COMPLIANT**

- Effective `code-graph:get-graph-health`: `excluded` and `unsupported` are terminal explicit outcomes; remain queryable; alone do not make aggregate coverage incomplete or emit incomplete-coverage reasons.
- Its verification scenario `Terminal non-code outcomes do not poison aggregate health` asserts the same boundary.
- Effective `code-graph:resolve-symbol-reference`: target-specific excluded or unsupported evidence cannot prove absence; result remains `unresolved` with a coverage reason, never `missing`.
- Resolver verification explicitly groups excluded/unsupported/parse-failed/partial absence under `unresolved`.
- `design.md` compliance remediation states `coverageComplete=true` when every fact is terminal `indexed`, `excluded`, or `unsupported`, while excluded/unsupported remain queryable and target-specific.

These contracts are complementary, not contradictory: aggregate corpus accounting may be complete because every target has a terminal outcome, while a specific unsupported/excluded target still lacks supported evidence needed to prove symbol absence.

### Bounded incremental reconstruction and unchanged no-op indexing

Result: **COMPLIANT**

- Effective `code-graph:indexer` permits semantic reconstruction when changed evidence requires rebuilding unavailable durable adapter facts, but requires one-time indexes, batched Store operations, bounded chunks, one bulk session/commit, and at most one final search-index rebuild.
- It explicitly requires a fully unchanged generation to preserve the existing semantic reference-fact snapshot while updating metadata/freshness, skip every target, process zero files, avoid reference-fact replacement and relation construction, and request no search-index rebuild.
- Latest verify pair includes both `Semantic reconstruction remains bounded and observable` for a changed source and `Unchanged targets avoid semantic and search rebuild work` for identical source state.
- `design.md` limits reconstruction to shared lookup indexes and one bulk session with no Store round trip/global scan per relation; its broader “may re-extract visible corpus” wording is constrained by the effective no-op requirement and changed-source verification scenario.
- Tasks 12, 18, 20.6, and 21.6 consistently require bounded relation work, one session/commit/index rebuild, and observable metrics.

No requirement authorizes re-extraction, reference-fact replacement, relation construction, or FTS rebuilding on a fully unchanged run. F2 records that the latest verify scenario proves output equivalence but not the no-reference-write clause itself.

### VCS enumeration, implementation detection, and Code Graph visibility ownership

Result: **COMPLIANT**

- Effective `core:vcs-adapter-port`: `modifiedFiles(baseRef)` returns complete repository-root-relative staged, unstaged, untracked, deleted, and both rename-side paths; adapter owns no graph filtering/fingerprint policy.
- Effective `core:vcs-implementation-detector`: rebase repository paths to configured project root, omit outside paths, normalize/deduplicate/sort, and optionally apply only caller-owned generic implementation exclusions; no workspace discovery or graph visibility.
- `core:implementation-detector-port` direct dependency requires forward-slash project-relative candidates and no workspace identity.
- Effective `code-graph:staleness-detection` and `code-graph:get-graph-health`: Code Graph alone applies effective `excludePaths`, `allowedPaths`, gitignore/default exclusions, and code/document/spec channels before stat/hash; excluded-only VCS changes do not dirty health.
- Design and tasks 17.6-17.12 reproduce this ownership boundary: VCS enumerates native changes, detector maps implementation candidates, Code Graph owns visibility and freshness fingerprints.

No layer imports graph policy into Core/VCS, and no graph consumer delegates effective visibility to the detector.

### Package/layer ownership

Result: **COMPLIANT**

- Core owns raw tracking, VCS port/detector, and mutation/read use cases.
- Code Graph owns semantic resolution, search, traversal, persistence, health, indexing, and graph visibility.
- SDK owns cross-subsystem implementation-review orchestration and provider lifecycle composition.
- CLI validates inputs and renders SDK/Code Graph results; it does not recreate matching, search, coverage, health, or indexing policy.
- Direct dependencies match global architecture direction: CLI → SDK; SDK → Core + Code Graph; Code Graph application logic accesses infrastructure only through ports/composition.
- Design dependency map and the 24 `specDependsOn` declarations follow these boundaries.

## Spec/Verify Parity

Result: **STRUCTURALLY COMPLIANT across all 24 pairs**

Checks:

- `changes validate implementation-review-symbol-resolution --all --format toon`: `passed: true`, 51/51 artifacts validated.
- Automated merged-preview comparison extracted/sorted every `### Requirement:` heading from each spec and verify artifact: `NO_MISMATCHES` for all 24 spec IDs.
- Manual semantic review covered drifted pairs and highlighted boundaries. Added verification scenarios directly exercise terminal coverage aggregation, targeted unresolved/missing behavior, unchanged no-op indexing, bounded changed-source reconstruction, excluded-only VCS visibility, repository/project rebasing, and graph-policy separation.

No verify artifact introduces a requirement absent from its paired effective spec; no effective requirement heading lacks a verify section. Semantic assertion coverage is still incomplete for the latest no-reference-replacement clause (F2). Heading parity therefore does not erase F1 or F2.

## Design and Tasks Consistency Summary

- `design.md`: consistent with effective merged specs on ownership, conservative resolution, `missing` vocabulary, terminal coverage, targeted freshness, VCS/visibility separation, one bulk session, bounded relation work, and safe indexing repair.
- `tasks.md`: later follow-ups/remediation align with effective specs, including task 17.19 vocabulary correction, tasks 17.6-17.12 VCS/visibility ownership, tasks 18.x bulk indexing, and task 21.x compliance remediation.
- Remaining task contradiction: tasks 5.2 and 9.2 still say `stale` resolution output (F1).
- Remaining spec/verify semantic gap: unchanged-run verification does not assert zero reference-fact replacement writes (F2).
- Expected incomplete workflow tasks 20.7, 20.8, and 21.9 are sequencing/completion gates, not specification contradictions. Task 20.8 is correctly gated after successful verification.

## Validation Evidence

Commands used (all via required built CLI):

```text
node packages/cli/dist/index.js config show --format toon
node packages/cli/dist/index.js graph stats --format json
node packages/cli/dist/index.js project context --format toon
node packages/cli/dist/index.js changes status implementation-review-symbol-resolution --format toon
node packages/cli/dist/index.js changes deps implementation-review-symbol-resolution --format json
node packages/cli/dist/index.js changes validate implementation-review-symbol-resolution --all --format toon
node packages/cli/dist/index.js changes context implementation-review-symbol-resolution verifying --include-change-specs --follow-deps --depth 1 --optimized --format toon
node packages/cli/dist/index.js changes spec-preview implementation-review-symbol-resolution <specId> --artifact specs
node packages/cli/dist/index.js changes spec-preview implementation-review-symbol-resolution <specId> --artifact verify
node packages/cli/dist/index.js changes spec-preview implementation-review-symbol-resolution <specId> --artifact specs --diff
node packages/cli/dist/index.js changes spec-preview implementation-review-symbol-resolution <specId> --artifact verify --diff
node packages/cli/dist/index.js specs context <directDependencySpecId>
```

Observed baseline:

- Graph: `stale=false`, `fingerprintMismatch=false`, `contentFresh=true`, `coverageComplete=true`, `schemaCompatible=true`, `generationCurrent=true`.
- Coverage counts: 1067 indexed, 0 excluded, 264 unsupported, 0 parse-failed, 0 partial. This live result conforms to terminal unsupported aggregate semantics.
- Change scope: 24 specs; 108 dependency edges; 38 unique dependencies, 24 external to change scope.
- Artifact validation: passed 51/51; no structural failures.
- Requirement parity: no mismatched requirement headings across 24 merged spec/verify pairs.
- Latest lifecycle status: no blockers; no review required; proposal/specs/verify/design/tasks DAG nodes all report `complete`.

## Required Remediation

1. Replace obsolete `stale` resolution vocabulary in completed tasks 5.2 and 9.2 with `missing`, or explicitly mark those lines superseded by task 17.19 while retaining only `resolved | ambiguous | unresolved | missing` as result statuses.
2. Extend `code-graph:indexer` unchanged-run verification with an observable assertion that no reference-fact replacement/write occurs; permit only the specified metadata/freshness update.
3. Re-run change validation and this consistency audit after artifact review. A clean conclusion requires zero high/medium discrepancies.

No code, spec, metadata, manifest, or lifecycle state was modified by this audit.
