# Tasks: context-extracted-first

## 1. Shared sink and types

- [x] 1.1 Remove regenerated-warning relay from the shared materialization sink
      `packages/core/src/application/use-cases/_shared/materialize-context-spec-metadata.ts`: `appendMaterializationDiagnostics` — delete the `if (result.regenerated)` block that pushes a `stale-metadata` warning; keep the `metadata-cache-write-failed` relay untouched
      Approach: regeneration provenance stays on the structured result (`source`, `regenerated`) consumed by diagnostics surfaces; no signature change
      (Req: Staleness detection and content fallback)
- [x] 1.2 Add `missing-optimization` to the context warning union
      `packages/core/src/application/use-cases/_shared/context-warning.ts`: `ContextWarning` — add `'missing-optimization'` to the type union (`'stale-optimization'` remains)
      Approach: type-level addition only; all existing `'stale-optimization'` literals keep compiling
      (Req: Optimization warning signal)

## 2. Optimization status projection

- [x] 2.1 Add optional `optimizationStatus` to SpecMetadata schema
      `packages/core/src/domain/services/parse-metadata.ts`: `specMetadataSchema` / `SpecMetadata` — add `optimizationStatus?: { optimizedDescription?: 'missing' | 'stale'; optimizedContext?: 'missing' | 'stale' }` as zod `.optional()` object
      Approach: additive optional field so legacy persisted `metadata.json` snapshots keep parsing; JSDoc on the interface field per default:\_global/docs
      (Req: Prefer LLM-optimized context)
- [x] 2.2 Populate `optimizationStatus` during metadata generation
      `packages/core/src/application/use-cases/generate-spec-metadata.ts`: `buildFreshOptimizationProjections` — for each field emit `'missing'` when the lock records no value, `'stale'` when recorded but `classifyOptimizationFieldFreshness(...).fresh === false`, omit the key when projected fresh; attach the object to the returned metadata
      Approach: classification already computed inside this function — reuse its results instead of re-evaluating
      (Req: Optimization warning signal)

## 3. Extracted-first rendering in CompileContext

- [x] 3.1 Hoist preview merge above display-mode branching for scoped specs
      `packages/core/src/application/use-cases/compile-context.ts`: `execute` per-spec loop — compute `isScoped = specIdsSet.has(specId)`; when scoped and mode !== 'list', invoke `_previewSpec`, relay its warnings as `{ type: 'preview' }`, build `mergedFiles` via `_mergePreviewFiles`; catch preview failures into a `preview` warning
      Approach: single preview call reused by every rung of the ladder and both modes; identical to today's full-mode block but moved before summary/full split
      (Req: Extracted-first rendering for change-scoped specs)
- [x] 3.2 Implement rung 1: schema-driven extraction over merged files
      `compile-context.ts`: render loop — when scoped with `mergedFiles`, call `extractMetadataFromSpecArtifacts({ effectiveSpecSchema, workspace, specPath, artifacts: mergedFiles, parsers, extractorTransforms, repositories, workspaceRoutes })`; derive title/description from `extracted.metadata`; render content via `_renderFromMetadata(extracted.metadata, sectionsFilter, false)` except in summary mode; fill empty title with `_extractTitleFromFiles(mergedFiles)` as intra-rung cosmetic fallback only
      Approach: one extraction per scoped spec per load; `llm` argument forced `false` for scoped entries (change-scope bypass)
      (Req: Extracted-first rendering for change-scoped specs)
- [x] 3.3 Implement rungs 2-3 and the no-warning guard
      `compile-context.ts`: render loop — define `hasUsable(view)` (non-empty title OR description OR content); rung 2 materializes canonical metadata via `materializeContextSpecMetadata(...).catch(() => null)` when rung 1 unusable (llm flag honored for non-scoped, forced off for scoped); rung 3 extracts over `mergedFiles ?? baseFiles` via `_renderExtractedSectionsFromFiles`; push `stale-metadata`/`missing-metadata` ONLY when all rungs yield nothing usable
      Approach: non-scoped entries keep today's exact flow through rung 2; while any rung succeeds, zero metadata-absence warnings
      (Req: Extracted-first rendering for change-scoped specs, Staleness detection and content fallback)
- [x] 3.4 Emit optimization warnings typed and scope-gated
      `compile-context.ts`: replace block at ~:573-582 — gate on `shouldUseOptimizedContext && !isScoped && metadata !== null && optimizedContext empty`; read `metadata.optimizationStatus?.optimizedContext ?? 'missing'`; push `missing-optimization` or `stale-optimization` with the remediation message ("has never been LLM-optimized" / "drifted since its last LLM-optimization" + agent launch instruction)
      Approach: consumer rule from design §2 applied verbatim
      (Req: Optimization warning signal, Prefer LLM-optimized context)

## 4. Traversal correctness

- [x] 4.1 Add unresolved-handling option to traversal
      `packages/core/src/application/use-cases/_shared/depends-on-traversal.ts`: export `TraverseDependsOnOptions { unresolved?: 'warn' | 'skip' }`; add trailing optional param to `traverseDependsOn`; when `'skip'`, probe `ws.specRepo.get(specPathObj)` after cycle/seen/workspace checks and return before `dependsOnAdded.set(key, ...)` when null
      Approach: opt-in flag; default `'warn'` preserves register-then-readPersistedState sequence exactly (JSDoc on the new export per default:\_global/docs)
      (Req: Context spec collection, Missing spec IDs emit a warning)
- [x] 4.2 Reorder Step 5: manifest tier before repository access
      `compile-context.ts`: Step 5 loop — read `change.specDependsOn.get(specId)` FIRST; only when empty/absent do `repo.get` existence gating and GetSpecMetadata/extraction tiers; pass `{ unresolved: 'skip' }` to every `traverseDependsOn` call
      Approach: non-persisted scoped specs with declared deps traverse transitively; non-persisted without deps continue silently
      (Req: Context spec collection, dependsOn resolution order)
- [x] 4.3 Extraction fallback tier reads merged files for scoped specs
      `compile-context.ts`: tier 2 catch branch — when materialization fails, schema declares `metadataExtraction.dependsOn`, and the spec is scoped, lazily invoke `_previewSpec` and feed merged artifacts into `_extractDependsOnFallback` instead of base files
      Approach: lazy preview only in the failure path; non-scoped fallback unchanged (base files)
      (Req: dependsOn resolution order)

## 5. Consumer alignment in GetSpecContext / GetProjectContext

- [x] 5.1 Typed optimization warnings in GetSpecContext
      `packages/core/src/application/use-cases/get-spec-context.ts`: warning emission (~:245-247) — apply the design §2 consumer rule using `metadata.optimizationStatus`
      Approach: keep use case change-agnostic; no constructor changes
      (Req: Prefer LLM-optimized context — get-spec-context delta)
- [x] 5.2 Typed optimization warnings + sink benefit in GetProjectContext
      `packages/core/src/application/use-cases/get-project-context.ts`: warning emission (~:290-296) — same consumer rule
      Approach: the regenerated-relay removal arrives automatically via task 1.1
      (Req: Renders spec content from metadata when fresh — get-project-context delta)

## 6. Tests

- [x] 6.1 Update stale-optimization assertions to typed taxonomy
      `packages/core/test/application/use-cases/compile-context.spec.ts` (:3620-3692 region) — flip existing assertions to expect `missing-optimization`/`stale-optimization` and scoped silence
      Approach: mirror the three scenarios added under "Requirement: Optimization warning signal" in verify
- [x] 6.2 New extracted-first describes in compile-context tests
      `compile-context.spec.ts` — add: summary renders change-only new spec from merged extraction without persisted metadata and without warnings; preview failure falls back to canonical projection with `preview` warning; scoped entry with fresh lock optimization renders merged content not optimized text; delta edit invalidates cached `unchanged` fingerprint
      Approach: mock PreviewSpec/GetSpecMetadata ports per existing helper patterns (`makeChangeRepository`, test helpers)
      (Req: Extracted-first rendering for change-scoped specs, Context fingerprint)
- [x] 6.3 Traversal option tests
      `packages/core/test/application/use-cases/_shared/depends-on-traversal.spec.ts` — add: `'skip'` drops unresolvable discovery without registration/warning; default `'warn'` keeps current behavior
      Approach: follow existing describe patterns in this file
      (Req: Context spec collection)
- [x] 6.4 Manifest-first traversal test for non-persisted scoped specs
      `compile-context.spec.ts` — scoped non-persisted spec with manifest-declared deps traverses transitively, no `missing-metadata`
      Approach: change fixture with `specDependsOn` entry for an un-persisted specId, `followDeps: true`
      (Req: dependsOn resolution order, Context spec collection)
- [x] 6.5 Regeneration-provenance tests in consumer suites
      `get-spec-context.spec.ts` + `get-project-context.spec.ts` — add: regenerated projection renders normally with zero warnings; typed optimization warnings per `optimizationStatus`
      Approach: stub GetSpecMetadata returning `regenerated: true` result
      (Req: Build context entry from metadata — get-spec-context delta; Renders spec content from metadata when fresh — get-project-context delta)

## 7. Verification gates

- [x] 7.1 Run full quality gates
      repo root — `pnpm lint && pnpm typecheck && pnpm test`
      Approach: hooks enforce these at implementing post / verifying pre; fix any fallout before transitioning
- [x] 7.2 Manual E2E against live changes
      `node packages/cli/dist/index.js changes context implementation-snapshot designing --format text` → titles/descriptions populated for non-persisted scoped specs, empty warnings; same command on `deprecate-ladybug-store` → `stale-optimization` only for graph-store/traversal (non-scoped), none for composition; edit a delta then rerun with previous `--fingerprint` → status `changed`
      Approach: matches design Testing section expectations
