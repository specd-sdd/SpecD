# Spec Compliance Audit — Partial: Context & CLI

**Change:** `persist-spec-context-optimizations` (`20260723-152643-persist-spec-context-optimizations`)  
**State:** `verifying`  
**Audit mode:** Change-scoped (assigned spec batch)  
**Graph freshness:** `2026-07-23T17:37:31.659Z` (not stale)  
**Auditor constraint:** Read-only — no code or spec modifications  
**Report path:** `reports/LATEST/_partial-context-cli.md`  
**Date:** 2026-07-24

---

## Executive Summary

| Metric                            | Count |
| --------------------------------- | ----: |
| Specs audited                     |    33 |
| Fully compliant                   |    14 |
| Partial compliance / naming drift |     8 |
| Material discrepancies            |     8 |
| Removed-surface checks (pass)     |     3 |
| High-severity findings            |     4 |
| Medium-severity findings          |     6 |
| Missing verify scenarios (tests)  |     9 |

This batch centers on context compilation, metadata materialization, CLI command surfaces, kernel/composition wiring, and supporting ports. The dominant theme is **architectural layering drift**: several specs name `MaterializeSpecMetadata` at use-case boundaries while implementation consistently injects `GetSpecMetadata` (a thin `if-needed` wrapper). That is often behaviorally equivalent but conflicts with constructor/deps naming in change deltas and verify scenarios.

A second theme is **performance vs. spec literalism**: `CompileContext` materializes metadata before list-mode short-circuit; `ListSpecs` delegates summary resolution to `FsSpecIndexCache` snapshot reads instead of self-healing materialization at the use-case layer.

Third theme: **CLI output contracts** for `spec metadata`, `spec generate-metadata`, and `project init` lag behind change verify deltas.

---

## Known Candidate Findings (Dual Interpretation)

### C1 — `GetSpecMetadata` vs `MaterializeSpecMetadata` at context boundaries

**Specs affected:** `core:compile-context`, `core:get-spec-context`, `core:get-project-context`, `core:validate-specs`, `core:update-project-metadata`, `core:search-specs` (composition deps), `core:list-specs` (composition deps)

**Spec says:**

- Constructors and `resolve*Deps` expose `MaterializeSpecMetadata` / `materializeMetadata`.
- Call sites invoke `MaterializeSpecMetadata.execute({ specId })` with default `'if-needed'` policy.

**Code does:**

- Use cases inject `GetSpecMetadata` (`_getMetadata` / `getMetadata`).
- `GetSpecMetadata.execute` delegates to `MaterializeSpecMetadata` with `policy: 'if-needed'` (`packages/core/src/application/use-cases/get-spec-metadata.ts`).
- Composition resolvers wire `getMetadata: createGetSpecMetadata(...)` (e.g. `composition/use-cases/compile-context.ts`).

**Evidence:**

```typescript
// get-spec-metadata.ts — semantic equivalence for if-needed reads
return this.materializeSpecMetadata.execute({ specId: input.specId, policy: 'if-needed' })
```

**Interpretation A — Spec drift (code correct):**  
`GetSpecMetadata` is the intended public read surface for self-healing metadata. Specs should be updated to name `GetSpecMetadata` in constructors/deps while reserving `MaterializeSpecMetadata` for forced/regeneration paths (`RegenerateSpecMetadata`, archive pre-commit `policy: 'force'`). The wrapper enforces the correct default policy and prevents callers from accidentally choosing wrong policies.

**Interpretation B — Implementation bug (spec correct):**  
Change deltas explicitly require `materializeMetadata: MaterializeSpecMetadata` in `resolveCompileContextDeps`, `resolveListSpecsDeps`, etc. Composition tests partially encode the old shape (`resolveListSpecsDeps returns only listWorkspaces`). Type surfaces and verify scenarios are binding; wrappers belong inside use cases, not as substituted dependency types.

**Test coverage:** Partial. `get-spec-metadata` behavior is implicit; composition tests do not assert `materializeMetadata` dep names from change verify deltas.

**Severity:** Medium (naming/architecture) unless policy leakage is possible — currently low risk because `GetSpecMetadata` hard-codes `if-needed`.

---

### C2 — `CompileContext` materializes before list-mode skip

**Specs affected:** `core:compile-context`

**Spec says (change verify delta):**

> **Scenario: Only rendered specs are materialized**  
> …it materializes metadata only for specs it actually renders, not every collected spec.

**Code does (`compile-context.ts` ~529–580):**

1. For every collected spec, calls `materializeContextSpecMetadata(this._getMetadata, specId, warnings)` (line 545).
2. Only after materialization, checks `mode === 'list'` and `continue`s without content fields (line 578).

Depends-on traversal (step 5) also materializes before display classification — arguably necessary for traversal, but list-mode rendering still eagerly materializes all collected specs.

**Interpretation A — Spec drift:**  
"Rendered" includes emitting a list entry (spec id + source + mode). Materialization is required to detect optimization warnings (`stale-optimization`) and to support hybrid/summary decisions using metadata presence. The verify scenario intended "no full content projection," not "no materialization call."

**Interpretation B — Implementation bug:**  
List mode explicitly emits no title/description/content; calling `GetSpecMetadata` for every collected spec is wasted I/O and violates the verify scenario literally. Materialization should be deferred until after mode classification, skipping list-mode specs except when `followDeps` or optimization checks require metadata.

**Test coverage:** Gap. `compile-context.spec.ts` has `list mode emits list-only entries` (shape) but no assertion that materialization is skipped for list-mode specs. No test for verify scenario "Only rendered specs are materialized."

**Severity:** Medium (performance / spec literalism).

---

### C3 — CLI output format gaps (`spec metadata`, `generate-metadata`, `project init`)

#### C3a — `cli:spec-metadata` text output

**Spec says:** Structured text with labeled fields (`title:`, `description:`, `dependsOn:`, section counts, `warnings:`).

**Code does (`cli/commands/spec/metadata.ts`):** Prints header lines then `JSON.stringify(result.metadata, null, 2)` for the body.

**Interpretation A — Spec drift:** JSON blob is acceptable for debugging; structured text is aspirational.

**Interpretation B — Implementation bug:** Verify scenarios and examples in spec are normative; CLI must match text schema.

**Severity:** Medium (UX/contract).

#### C3b — `cli:spec-generate-metadata`

**Spec says:**

- `--force` flag passed to `RegenerateSpecMetadata`.
- Single-spec JSON: `{ result: "ok", spec: "...", regenerated: true }`.
- Batch JSON: `{ result, total, succeeded, failed, specs: [...] }`.

**Code does (`cli/commands/spec/generate-metadata.ts`):**

- No `--force` option registered.
- Single JSON: `{ result: 'ok', ...entry }` (spreads kernel entry shape).
- Batch JSON: `{ result, specs }` without `total`/`succeeded`/`failed`.

**Interpretation A — Spec drift:** Entry spread is richer; `--force` deferred because `RegenerateSpecMetadata` default force semantics suffice for CLI.

**Interpretation B — Implementation bug:** Missing `--force` blocks conflict-skip workflows specified in verify. JSON schema is machine-consumed and must be stable per spec.

**Severity:** Medium–High for `--force`; Medium for JSON shape.

#### C3c — `cli:project-init` metadata cache surfacing

**Spec says:**

- Text: `metadata cache: <path> (ignored in .gitignore)` after init line.
- JSON: `metadataCachePath` field from `InitProject` result.
- CLI must not re-derive path.

**Code does:**

- `InitProjectResult` has no `metadataCachePath` (`application/ports/config-writer.ts`).
- `FsConfigWriter.initProject` creates `.specd/metadata/` and gitignore entry but returns only `configPath`, `schemaRef`, `workspaces`.
- CLI prints `initialized specd in …` and plugin lines only.

**Interpretation A — Spec drift:** Cache path is predictable (`.specd/metadata/`); explicit surfacing is optional.

**Interpretation B — Implementation bug:** Verify deltas require port result field + CLI output. `config-writer-port` and `cli:project-init` specs must be implemented together.

**Test coverage:** `config-writer.spec.ts` covers directory/gitignore; no `metadataCachePath` result field tests; no CLI project-init output tests.

**Severity:** Medium.

---

### C4 — Removed CLI commands vs verify

**Specs affected:** `cli:spec-update-metadata`, `cli:spec-write-metadata`, `cli:spec-invalidate-metadata`, `core:save-spec-metadata`, `core:invalidate-spec-metadata`, `core:update-spec-metadata`

**Finding:** **Compliant.**

- `packages/cli/src/index.ts` registers no `update-metadata`, `write-metadata`, or `invalidate-metadata` under `spec`.
- `packages/core/src/public.ts` exports no `SaveSpecMetadata`, `InvalidateSpecMetadata`, `UpdateSpecMetadata`, or their factories.
- Kernel spec requires these absent from `kernel.specs` — satisfied.

**Interpretation:** N/A — both spec and code agree.

---

## Per-Spec Findings

### Core — Context pipeline

#### `core:compile-context`

| Requirement area                                 | Status     | Notes                                                           |
| ------------------------------------------------ | ---------- | --------------------------------------------------------------- |
| Ports inject materialization collaborator        | ⚠️ Partial | Injects `GetSpecMetadata`, not `MaterializeSpecMetadata` (C1)   |
| No direct `readMetadataSnapshot()` in use case   | ✅         | Uses `materializeContextSpecMetadata` helper                    |
| Self-healing materialization for rendered specs  | ✅         | Via `GetSpecMetadata`                                           |
| Only rendered specs materialized                 | ❌         | Eager materialization before list-mode skip (C2)                |
| dependsOn traversal uses materialized projection | ✅         | Step 5 uses `_getMetadata.execute`                              |
| Optimization warnings                            | ✅         | Checks `optimizedContext` when `llmOptimizedContext`            |
| `resolveCompileContextDeps` shape                | ❌         | Returns `getMetadata`, spec delta expects `materializeMetadata` |
| Fingerprint / display modes                      | ✅         | Tests cover list/summary/full/hybrid                            |

**Tests:** Strong shape coverage; missing lazy-materialization scenario.

---

#### `core:get-spec-context`

| Requirement area                        | Status     | Notes                                                            |
| --------------------------------------- | ---------- | ---------------------------------------------------------------- |
| Uses `MaterializeSpecMetadata` per spec | ⚠️ Partial | Uses `GetSpecMetadata` (C1); behavior equivalent for `if-needed` |
| Display modes / section filters         | ✅         | Implemented                                                      |
| Transitive traversal + warnings         | ✅         | DFS with materialized deps                                       |
| `resolveGetSpecContextDeps`             | ⚠️ Partial | Wires `getMetadata`, spec names `materializeMetadata`            |

---

#### `core:get-project-context`

| Requirement area                    | Status     | Notes                                    |
| ----------------------------------- | ---------- | ---------------------------------------- |
| Materialized spec content rendering | ⚠️ Partial | `GetSpecMetadata` via shared helper (C1) |
| Project optimization cache          | ✅         | `checkProjectMetadataFreshness`          |
| dependsOn traversal                 | ✅         | Materialized + extraction fallback       |
| No workspace-level patterns         | ✅         | Compile-context owns those               |

---

#### `core:validate-specs`

| Requirement area                       | Status     | Notes                                 |
| -------------------------------------- | ---------- | ------------------------------------- |
| Materialize before metadata validation | ⚠️ Partial | `_getMetadata.execute` (C1)           |
| dependsOn vs persisted state checks    | ✅         | After materialization                 |
| Validation result cache integration    | ✅         | `ValidationResultCache` per workspace |
| `includeMeta: true` on list            | ✅         | Present in validation paths           |

---

### Core — Kernel / composition

#### `core:kernel`

| Requirement area                            | Status | Notes                                                      |
| ------------------------------------------- | ------ | ---------------------------------------------------------- |
| `kernel.specs` exposes materialization trio | ✅     | `materializeMetadata`, `getMetadata`, `regenerateMetadata` |
| Removed use cases not mounted               | ✅     | No save/invalidate/update metadata                         |
| Persisted state use cases                   | ✅     | deps, implementation, optimizations, schema, init          |

---

#### `core:kernel-builder`

| Requirement area                     | Status | Notes                                   |
| ------------------------------------ | ------ | --------------------------------------- |
| Equivalent to `createKernel`         | ✅     | Builder delegates to same resolver path |
| Full `kernel.specs` surface on build | ✅     | Per spec requirement                    |

---

#### `core:composition`

| Requirement area            | Status     | Notes                                                            |
| --------------------------- | ---------- | ---------------------------------------------------------------- |
| Factory deps normalization  | ✅         | Shared resolver pattern                                          |
| `createConfigWriter` export | ✅         | Public                                                           |
| Per-use-case `resolve*Deps` | ⚠️ Partial | Several name `getMetadata` where spec says `materializeMetadata` |

---

### Core — Listing / search / project metadata

#### `core:list-specs`

| Requirement area                                  | Status | Notes                                                                                       |
| ------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| Forward list options to repositories              | ✅     | Pagination/includeSummary forwarded                                                         |
| Summary via `MaterializeSpecMetadata` in use case | ❌     | `ListSpecs` has only `ListWorkspaces`; summary from `FsSpecIndexCache.readMetadataSnapshot` |
| Self-healing optimized description                | ❌     | Index uses snapshot `optimizedDescription` without freshness gate                           |
| `resolveListSpecsDeps` includes materializer      | ❌     | Returns only `{ listWorkspaces }`; test asserts this                                        |
| No metadata status field                          | ✅     | Removed from public shape                                                                   |

**Interpretation A — Spec drift:** Repository index layer is the correct place for list summaries; spec should say `SpecRepository.list({ includeSummary })` triggers index materialization, not `ListSpecs` calling `MaterializeSpecMetadata` directly.

**Interpretation B — Implementation bug:** Change delta explicitly moved self-healing to use-case layer. Index cache bypasses regeneration for stale/missing metadata.

**Severity:** High for self-healing correctness on `--summary` listings.

---

#### `core:search-specs`

| Requirement area            | Status     | Notes                                                                                            |
| --------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| Multi-workspace search      | ✅         |                                                                                                  |
| Summary via materialization | ⚠️ Partial | Uses `GetSpecMetadata` (C1) — behavior OK                                                        |
| `resolveSearchSpecsDeps`    | ⚠️ Partial | Includes `hasher`/`yaml` though spec says must NOT; uses `getMetadata` not `materializeMetadata` |
| Title resolution            | ✅         | Materialized title with fallbacks                                                                |

---

#### `core:project-metadata`

| Requirement area                            | Status | Notes                                    |
| ------------------------------------------- | ------ | ---------------------------------------- |
| Persistence location / schema               | ✅     |                                          |
| Semantic `metadataFingerprint` in freshness | ✅     | Via materialization in freshness helpers |
| `resolveGetProjectMetadataDeps`             | ✅     | config + files only (read path)          |

---

#### `core:update-project-metadata`

| Requirement area                   | Status     | Notes                                         |
| ---------------------------------- | ---------- | --------------------------------------------- |
| Fingerprint via materialization    | ⚠️ Partial | `_getMetadata.execute` per included spec (C1) |
| Atomic write                       | ✅         | `writeFileAtomic`                             |
| Payload separation                 | ✅         | Only `optimizedContext` from caller           |
| `resolveUpdateProjectMetadataDeps` | ⚠️ Partial | `getMetadata` not `materializeMetadata`       |

---

### Core — Removed / internal metadata writers

#### `core:save-spec-metadata`, `core:invalidate-spec-metadata`, `core:update-spec-metadata`

**Status:** ✅ Compliant (removed from public surface as specified).

---

#### `core:archive-change`

| Requirement area                            | Status | Notes                           |
| ------------------------------------------- | ------ | ------------------------------- |
| Uses `MaterializeSpecMetadata` with `force` | ✅     | Pre-publication materialization |
| `RegenerateSpecMetadata` post-archive       | ✅     | Delegated                       |
| No direct metadata editor                   | ✅     |                                 |

---

### Core — Ports

#### `core:config-writer-port`

| Requirement area                      | Status | Notes                                             |
| ------------------------------------- | ------ | ------------------------------------------------- |
| Metadata cache dir on init            | ✅     | `.specd/metadata/` created                        |
| Gitignore entry                       | ✅     | `/.specd/metadata/`                               |
| Returns `metadataCachePath` in result | ❌     | `InitProjectResult` lacks field (blocks CLI spec) |

---

#### `core:validation-result-cache-port`

| Requirement area             | Status | Notes                                   |
| ---------------------------- | ------ | --------------------------------------- |
| Port defined                 | ✅     | `ValidationResultCache` abstract class  |
| FS adapter wired in resolver | ✅     | `FsValidationResultCache` per workspace |
| Used by `ValidateSpecs`      | ✅     | Hard-hit cache on validation            |

---

### CLI commands

#### `cli:spec-deps`, `cli:spec-optimizations`, `cli:spec-implementation`, `cli:spec-schema`, `cli:spec-init`

**Status:** ✅ Largely compliant.

- Command groups registered in `cli/src/index.ts`.
- Delegate to kernel persisted-state use cases.
- `--format text|json|toon` supported.
- `initialized` distinction in deps list (verified in `deps.ts`).

---

#### `cli:spec-metadata`

**Status:** ⚠️ Partial — behavior correct; text output format mismatch (C3a).

---

#### `cli:spec-generate-metadata`

**Status:** ❌ Missing `--force`; JSON output shape drift (C3b). Core delegation to `regenerateMetadata` is correct.

---

#### `cli:spec-list`

**Status:** ⚠️ Partial — CLI correctly forwards to `ListSpecs`; underlying `ListSpecs`/index summary gap (see `core:list-specs`) affects `--summary` self-healing.

---

#### `cli:project-init`

**Status:** ⚠️ Partial — init delegation correct; missing metadata cache output (C3c). Interactive wizard and plugin install align with spec.

---

#### `cli:spec-update-metadata`, `cli:spec-write-metadata`, `cli:spec-invalidate-metadata`

**Status:** ✅ Compliant — commands removed (C4).

---

### SDK, skills, code-graph

#### `sdk:composition`

| Requirement area                          | Status | Notes                                                                                               |
| ----------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| Dependencies limited to core + code-graph | ✅     |                                                                                                     |
| Layer structure                           | ✅     | composition/orchestration/shared                                                                    |
| Re-exports materialization surface        | ✅     | `core-reexports.ts` includes `GetSpecMetadata`, `MaterializeSpecMetadata`, `RegenerateSpecMetadata` |
| No removed metadata editors               | ✅     |                                                                                                     |

---

#### `skills:agents`, `skills:skill-templates-source`

| Requirement area                           | Status | Notes                           |
| ------------------------------------------ | ------ | ------------------------------- |
| Optimizer references `specs optimizations` | ✅     | Agent template + metadata skill |
| No `write-metadata` / `update-metadata`    | ✅     | Templates updated               |

---

#### `code-graph:indexer`

| Requirement area                            | Status | Notes                                              |
| ------------------------------------------- | ------ | -------------------------------------------------- |
| Spec indexing uses materialized fingerprint | ✅     | `getSpecMetadata.execute` in `index-code-graph.ts` |
| Skip re-index on unchanged fingerprint      | ✅     | Test coverage present                              |

---

## Test Coverage Gaps

| Spec / scenario                                                | Gap                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| `core:compile-context` — only rendered specs materialized      | No test asserting materialization call count in list mode |
| `core:list-specs` — MaterializeSpecMetadata summary            | Composition test asserts opposite (`only listWorkspaces`) |
| `cli:spec-metadata` — structured text output                   | No CLI integration test for text layout                   |
| `cli:spec-generate-metadata` — `--force`                       | Flag not implemented; no tests                            |
| `cli:project-init` — metadataCachePath output                  | No CLI or port result tests                               |
| `core:config-writer-port` — metadataCachePath in result        | Port interface not extended                               |
| `core:compile-context` verify — `materializeMetadata` dep name | Composition test omits `getMetadata` from assertions      |
| `cli:spec-generate-metadata` — batch JSON totals               | Not implemented                                           |
| `core:list-specs` — stale optimized description fallback       | Index path may serve stale optimized fields               |

---

## Discrepancy Register (Consolidated)

| ID  | Spec(s)                                           | Severity    | Summary                                                                        |
| --- | ------------------------------------------------- | ----------- | ------------------------------------------------------------------------------ |
| D1  | compile-context, get-\*-context, composition deps | Medium      | `GetSpecMetadata` substituted for `MaterializeSpecMetadata` in types/deps (C1) |
| D2  | compile-context                                   | Medium      | Eager materialization before list-mode skip (C2)                               |
| D3  | list-specs                                        | High        | Summary not self-healed via materialization at use-case layer                  |
| D4  | cli:spec-metadata                                 | Medium      | Text output is JSON dump, not structured fields (C3a)                          |
| D5  | cli:spec-generate-metadata                        | Medium–High | Missing `--force`; JSON schema drift (C3b)                                     |
| D6  | cli:project-init, config-writer-port              | Medium      | `metadataCachePath` not returned or printed (C3c)                              |
| D7  | search-specs composition                          | Low         | Extra `hasher`/`yaml` deps vs spec                                             |
| D8  | compile-context composition test                  | Low         | Does not verify `getMetadata` in resolved deps                                 |

**Removed-surface checks:** C4 — pass (no action).

---

## Recommendations (for human reviewer — not executed)

1. **Resolve C1 globally:** Either update specs/deltas to standardize on `GetSpecMetadata` for `if-needed` reads, or rename wiring back to `MaterializeSpecMetadata` in deps while keeping policy discipline.
2. **Resolve C2:** Reorder `CompileContext` loop to classify mode before materialization; add test with materialization spy.
3. **Resolve C3 (list-specs):** Choose architecture — use-case-level `MaterializeSpecMetadata` per entry when `includeSummary`, or amend spec to document `FsSpecIndexCache` as the materialization boundary with explicit self-healing requirements at index rebuild time.
4. **CLI contract pass:** Implement `metadataCachePath` on `InitProjectResult` + CLI output; align `spec metadata` text layout; add `--force` and JSON schemas for `generate-metadata`.
5. **Align tests with chosen interpretation:** Several tests currently encode pre-change or alternate architecture (`list-specs` composition test).

---

## Summary Counts

```
Specs audited:           33
Compliant:               14
Partial:                  8
Non-compliant:            8
Removed checks passed:    3
High severity:            4
Medium severity:          6
Low severity:             2
Missing test scenarios:   9
```

---

_End of partial report `_partial-context-cli.md`_
