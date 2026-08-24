# Proposal: context-extracted-first

## Motivation

Loading change context (`CompileContext`) emits spurious warnings and serves
inconsistent data whenever the change creates or modifies specs. Agents following
the shared skill policy ("optimize stale context before proceeding") react to this
noise by launching optimizer work that is useless mid-change, and in default
summary mode they design against pre-change spec content without any indication.

## Current behaviour

1. **New-spec metadata warnings.** Metadata materialization resolves specs only
   from the persisted workspace repo (`MaterializeSpecMetadata._resolveSpec`), so a
   spec that exists only inside the change throws `SpecNotFoundError`, gets caught,
   and emits `"No metadata for 'X' — summary may lack description"` (summary mode)
   or `"... falling back to extracted sections"` (full-mode fallback). New specs
   reach collection even without `--include-change-specs` via raw seeding of
   manifest `specDependsOn` VALUES (no existence check) and via
   `traverseDependsOn`, which registers deps before checking persistence and then
   adds its own `missing-metadata` warning — a double warning for the same spec.

2. **Bicéphalic context for modified specs.** For a spec with deltas in the
   change: catalogue `title`/`description` come from the persisted metadata cache
   (pre-delta), while full-mode body renders from the PreviewSpec merge
   (post-delta). The same response shows old and new descriptions in different
   places. In summary mode (the default `contextMode`) the preview never runs, so
   modifications are invisible.

3. **`stale-optimization` on scoped specs.** The lock-owned optimization is
   excluded from regenerated metadata whenever artifact baselines drift, and the
   warning fires unconditionally — including for specs currently being modified by
   the change, whose optimizations are pre-change by definition and must not be
   applied anyway.

4. **Cache-miss noise.** A normal metadata regeneration (self-healing cache miss
   that persists its own result) is relayed as a `stale-metadata` warning
   ("Metadata for 'X' was regenerated"), indistinguishable in type from genuine
   absence-of-metadata conditions.

5. **Legitimate signal, wrong message.** For non-scoped specs whose optimizations
   drifted, the `stale-optimization` warning is correct information, but it uses
   "is missing LLM-optimized context" both for never-optimized and drifted specs,
   conflating one-time bootstrap with recurring staleness.

## Proposed solution

Adopt an extracted-first rule for change-scoped specs, keep canonical metadata as
the source for everything else, and align the warning channel with actionable
semantics:

- For specs in the change's `specIds`: run `PreviewSpec` in every display mode
  (including summary), extract title/description/content from the merged files,
  and fall back to canonical metadata only when preview fails or yields nothing.
  Lock optimizations are never applied to scoped specs.
- Remove "was regenerated" from the context-warning channel; provenance stays on
  the structured result (`source`, `regenerated`) consumed by diagnostics surfaces.
- Suppress spurious metadata/missing-metadata warnings where the merged view
  provides the data; make traversal guards consistent so non-persisted deps do not
  double-warn.
- Keep `stale-optimization` outside the scope, distinguishing missing vs stale in
  the emitted message.

## Specs affected

### New specs

None.

### Modified specs

- `core:compile-context`: rendering rule becomes extracted-first for specs in the
  change scope (preview in all modes, canonical fallback); warning emission rules
  change (no spurious metadata warnings for specs with usable merged content, no
  lock consultation for scoped specs); traversal guard consistency for
  non-persisted deps declared in the manifest; fingerprint reflects merged content.
  - Depends on (added): core:content-extraction
  - Depends on (removed): none
- `core:get-spec-context`: shares the materialization diagnostics sink; warning
  semantics change (no "was regenerated" relay, missing-vs-stale optimization
  message distinction).
  - Depends on (added): none
  - Depends on (removed): none
- `core:get-project-context`: same shared-sink warning semantics alignment;
  remains change-agnostic otherwise.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- `packages/core/src/application/use-cases/compile-context.ts` — rendering loop,
  summary/full paths, warning emission, traversal wiring.
- `packages/core/src/application/use-cases/_shared/materialize-context-spec-metadata.ts`
  — diagnostics sink shared by all three contexts.
- `packages/core/src/application/use-cases/_shared/depends-on-traversal.ts` —
  guard ordering and missing-metadata suppression for change-scoped deps.
- `packages/core/src/application/use-cases/get-spec-context.ts`,
  `get-project-context.ts` — same sink/message adjustments.
- Tests under `packages/core/test/application/use-cases/`
  (`compile-context.spec.ts`, `_shared/depends-on-traversal.spec.ts`,
  `get-spec-context.spec.ts`, `get-project-context.spec.ts`).
- No schema, storage-format, CLI-flag, or public API signature changes intended.

## Technical context

- Mid-change deltas do not touch persisted state (metadata.json, spec locks);
  they apply only at archive. Loading context mid-change therefore cannot corrupt
  caches — cached metadata simply describes pre-delta reality for scoped specs,
  which is exactly what the extracted-first rule corrects.
- Verified live case: `code-graph:composition` lock optimization persisted
  2026-08-20 with baselines that no longer match artifacts changed 2026-08-22 →
  `buildFreshOptimizationProjections` (generate-spec-metadata.ts:255-291) excludes
  it → unconditional warning. Legitimate for non-scoped consumers; noise for the
  owning change.
- The project-level optimized blob already implements the analogous exemption
  silently (overlap check disables usage when projectMeta inputs intersect
  `change.specIds`) — the spec-level rule mirrors that philosophy.
- Extraction over merged files already exists for full mode
  (`_renderExtractedSectionsFromFiles` via `extractMetadataFromSpecArtifacts`);
  the rule extends it to summary mode instead of introducing a new mechanism.
- Perf accepted: extraction cost per load applies only to the few scoped specs
  (full mode already pays it today).
- Fingerprint: must be derived from rendered (merged) output so delta edits
  invalidate `--fingerprint` caching; current fingerprint hashes the assembled
  result, so coverage is expected but must be verified during design.
- Read-side writes noted and accepted out of scope: freshness checks materialize
  metadata with `if-needed` policy, so reads can persist caches.

## Resolved open questions

All four open questions were resolved with the user before spec work began:

1. **Summary-mode scoped entries use the schema-driven extraction pipeline** —
   `schema.metadataExtraction()` → `extractMetadataFromSpecArtifacts` over the
   merged files — NOT a light markdown-regex extraction. Rationale: light
   extraction (H1 regex) assumes markdown, while the metadataExtraction pipeline
   is format-agnostic via AST selectors. One extraction call per scoped spec per
   load; summary entries surface title/description from that result, full entries
   render sections from it. Fallback ladder unchanged (merge-extraction →
   canonical metadata → base-file extraction).
2. **Two distinct warning types**: `missing-optimization` (spec never optimized)
   vs `stale-optimization` (optimization exists but baselines drifted). Emitted
   outside the change scope according to the actual condition.
3. **GetSpecContext / GetProjectContext remain change-agnostic**: they receive
   only the shared-sink fixes (no "was regenerated" relay) and the corrected
   optimization warning types. The scope-aware lock exemption lives exclusively
   in `CompileContext`, which is the component that knows the active change.
4. **Traversal fix is structural, not suppressive**, in two parts:
   - Step 5 reordering: read manifest-declared deps BEFORE the persistence check
     (manifest needs no I/O), so new specs' declared dependencies traverse
     transitively instead of being dropped by the early `continue`.
   - `traverseDependsOn`: existence-check BEFORE registering the discovered dep
     and before emitting `missing-metadata`, so non-persisted discoveries neither
     register nor warn.
