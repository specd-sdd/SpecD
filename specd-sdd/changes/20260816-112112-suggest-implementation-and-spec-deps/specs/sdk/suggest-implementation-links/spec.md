# sdk:suggest-implementation-links

## Purpose

Correlating specifications with their implementation files and exported symbols is a critical step in spec-driven development. `SuggestImplementationLinks` is an application use case in `@specd/sdk` that deduces suggested implementation files and AST symbols for workspace specifications without requiring manual entry or LLM tokens, leveraging AST code block parsing from spec requirements, naming derivatives, and symbol search in `code-graph`.

## Requirements

### Requirement: Use Case Interface

`SuggestImplementationLinks` SHALL expose an `async execute(input: SuggestImplementationLinksInput): Promise<SuggestImplementationLinksResult>` method.

The input interface MUST support:

- `specId?: string` or `specIds?: readonly string[]`: Target specific spec IDs.
- `workspace?: string`: Target all specs within a specific workspace.
- `all?: boolean`: Target all specs across all workspaces.
- `apply?: boolean`: Optionally apply suggested files and symbols to `spec-lock.json` via `UpdatePersistedSpecImplementation`.
- `rebuildCache?: boolean`: Force invalidation and re-analysis of Pass 1/Pass 2 calculations.
- `confidenceThreshold?: 'HIGH' | 'MEDIUM' | 'MED' | 'LOW'`: Filter suggestions by confidence level (normalizing shorthand `MED` to `MEDIUM`).
- `onProgress?: OnSuggestImplementationProgress`: Optional progress callback emitting `discovery-start`, `discovery-done`, `start`, `spec-start`, `spec-done`, and `done` events.

### Requirement: Input Validation & Error Handling

`SuggestImplementationLinks` MUST validate input parameters before execution and throw specific errors extending `SpecdError`:

- If no targeting option is specified (neither `specId`, `specIds`, `workspace`, nor `all: true`), `execute()` MUST throw `InvalidInputError`.
- If `workspace` is specified but does not exist in configured spec repositories or is empty, `execute()` MUST throw `WorkspaceNotFoundError` or `InvalidInputError`.
- If `confidenceThreshold` is specified with an invalid string outside `['HIGH', 'MEDIUM', 'MED', 'LOW']`, `execute()` MUST throw `InvalidInputError`.
- When `specId` or `specIds` are specified in input, `SuggestImplementationLinks` MUST verify that each requested spec exists in the target repositories. If any requested spec ID is not found, `execute()` MUST throw a `SpecNotFoundError`.

### Requirement: Structured Markdown Symbol Evidence

`SuggestImplementationLinks` MUST parse each target `spec.md` as a Markdown AST so that
fenced code, inline code, headings, and prose are distinguished structurally rather than
discovered through a document-wide regular-expression scan.

The extractor MUST produce deterministic symbol evidence from three ordered sources:

1. **Fenced-code evidence** — identifier candidates found inside supported code blocks.
2. **Inline-code evidence** — identifier and file-path candidates found in Markdown
   `inlineCode` nodes.
3. **Prose evidence** — PascalCase, camelCase, and member-access candidates found in
   headings and text nodes.

When the same candidate is found through more than one source, the extractor MUST retain
the strongest evidence in the order above. Prose evidence MUST be accepted only when the
candidate resolves to an indexed symbol in the target workspace; prose tokens alone MUST
NOT create implementation suggestions. Evidence source MUST contribute a stable reason to
candidate scoring and diagnostics so consumers can distinguish explicit contract/code
mentions from weaker textual correlations.

The Markdown extractor MUST NOT recursively index source files, construct a second
codebase symbol index, infer primary spec ownership, or compare code signatures against
spec contracts. `code-graph` remains the authoritative source for indexed code symbols and
files; ownership and contract-completeness analysis are outside this capability.

### Requirement: 3-Tier Analysis Algorithm

`SuggestImplementationLinks` MUST execute a 3-tier cascade analysis algorithm with early short-circuiting:

1. **Tier 1 (AST Symbol & Direct Naming Derivatives)**:
   - Queries `SpecRepository.list({ includeMeta: true })` across target workspaces.
   - Evaluates cache staleness against `ImplementationSuggestionCachePort` (defaulting to `FsImplementationSuggestionCache` persisting under `configPath/tmp/fs-cache/implementation-suggestions/suggestions.json`) with a three-stage identity check that avoids paying for content hashes in the common case:
     1. **Cheap size/mtime pre-filter**: when the cached stamp carries `size` and the current artifact observation exposes `size`, equal `lastModified` + equal `size` is FRESH without computing any hash; a differing `size` is STALE (byte-length difference proves content change).
     2. **Content-hash precedence**: when the pre-filter cannot decide (mtime drifted with equal size) or no `size` is available, both usable hashes are compared — mismatch is stale, match is fresh, regardless of `lastModified`.
     3. **Timestamp fallback**: only when neither side provides a usable hash does `lastModified` decide, as before.
   - Uses domain-specific cache interfaces (`ImplementationSuggestionCacheHeader`, `ImplementationSuggestionSpecStamp`, `ImplementationSuggestionSpecEntry`).
   - Flushes cache entries incrementally to disk via atomic writes (`cache.flush()`) upon completing analysis of each specification, guaranteeing progress persistence and resilience against process interruptions during batch or workspace runs.
   - Reads `spec.md` artifacts via `SpecRepository` for cache misses.
   - Extracts explicit symbol and path evidence according to **Structured Markdown Symbol Evidence**, combining spec metadata (`GetSpecMetadata` title with fallbacks to `readMetadataSnapshot` and Markdown H1 title) with structurally classified fenced-code, inline-code, heading, and prose nodes while ignoring reserved language keywords and universal grammar stop-words (`SPEC_PROSE_KEYWORDS`).
   - Derives naming convention file path candidates from capability names.
   - Validates candidate file existence through an injected file-observation dependency before outputting suggestions.
   - Evaluates **Path & Spec Token Affinity (`computePathSpecAffinity`)**:
     - Normalizes spec capability segments and candidate file paths with token splitting `[\/\\_\-.:]+` and plural stemming (`length > 2 && !endsWith('ss')`).
     - Computes token coverage. If candidate file path is missing distinctive spec tokens, assigns a per-token score penalty (`missingTokens.length * 150`, i.e. `-150` per missing token) and records `missing-distinctive-tokens` in reasons. Candidates carrying `missing-distinctive-tokens` are excluded from `HIGH` confidence regardless of their final score.
   - Queries `code-graph` (`SymbolNode` search scoped directly to target workspace via `workspace` property on `SymbolQuery`).
   - Filters out variable symbol kinds (`SymbolKind.Variable`) and evaluates `parentId` relationships to preserve top-level parent class/interface symbols while sieving out loose child method matches in unrelated files.
   - Distinguishes compound identifiers from single-word PascalCase terms (`isCompoundIdentifier`), restricting single-word PascalCase candidate matches exclusively to candidate files that declare that term as their primary top-level entity (`parentId === undefined`).
   - Differentiates **Exact Primary Symbol Match** (+200 points, reason exactly `exact-primary-symbol-match`) from **Derivative Symbol Match** (+50 points).
   - Discards candidate files that do not declare any symbol matching the spec title (or compound/all title tokens).
   - Assigns a confidence level (`HIGH` >= 150 with clean affinity, `MEDIUM` 80–149, `LOW` < 80) and numeric score to each candidate.
   - Tier 2 refines and extends the Tier 1 candidate set: hierarchical-domain candidates compete in the same ranked list by score/confidence. Completion of Tier 2 ends the cascade only when the combined Tier 1/Tier 2 set is non-empty; it does not discard or bypass Tier 1 candidates.
2. **Tier 2 (Hierarchical Domain Prefix Derivation & Sub-token Content Match)**:
   - For multi-segment capability slugs (e.g. `schema-which-command`), derives parent domain candidates across standard source folders (e.g. `src/commands/schema.ts`, `src/application/schema.ts`).
   - Verifies whether missing distinctive sub-tokens (e.g. `which`) exist inside candidate file content via disk inspection and SQLite FTS5 search in `code-graph`.
   - Assigns `subtoken-content-match` bonus (+160 points) and associates top-level exported AST symbols from the matched domain container.
   - If the combined Tier 1/Tier 2 set contains matching candidates after Tier 2, the algorithm returns that ranked set and does not invoke Tier 3.
3. **Tier 3 (Fallback Syntax Tag & Requirement Keyword Co-occurrence Search)**:
   - Triggered **only when Tiers 1 and 2 yield zero candidate suggestions**.
   - Extracts distinctive syntax tags (e.g. `<rules>`, `<template>`) and keywords from Requirement headings in `spec.md`.
   - Queries `code-graph` for candidate source files exhibiting multi-term co-occurrence.
   - Ranks candidate files by co-occurrence density and assigns `fallback-content-co-occurrence` with `MEDIUM` confidence.

### Requirement: Already-Included Marking

Each `ImplementationSuggestionEntry` in the result MUST include an `alreadyIncluded: boolean` field indicating whether the suggested file is already present in the spec's persisted `spec-lock.json` implementation links. This allows consumers to display all candidates discovered by the algorithm with their inclusion status, analogous to `SuggestSpecDependencies`.

### Requirement: Additive Mutation Semantics (`apply: true`)

When `apply: true` is passed, `SuggestImplementationLinks` MUST perform a set union merging new discovered files and symbols into `spec-lock.json` via `UpdatePersistedSpecImplementation`, preserving all existing confirmed links. Suggestions with `alreadyIncluded: true` MUST be skipped during mutation.

### Requirement: Dependency-injected factory

The application module MUST provide the canonical dependency-injected factory:

- `createSuggestImplementationLinks(deps: SuggestImplementationLinksDeps): SuggestImplementationLinks`

Config-based overloads and concrete dependency resolution belong to `sdk:composition` and MUST delegate to this canonical factory.

## Constraints

- Operates exclusively through `SpecRepository`, `ImplementationSuggestionCachePort`, a required injected file-observation port, and core application ports. The application module MUST NOT import `node:fs`, filesystem repositories, filesystem caches, or config-path conventions. Composition MUST provide the observer explicitly; the use case MUST NOT install a permissive fallback that assumes files exist.
- Caching is abstracted via `ImplementationSuggestionCachePort`; selection and construction of `FsImplementationSuggestionCache` belongs to `sdk:composition`.

## Spec Dependencies

- [`code-graph:symbol-model`](../../code-graph/symbol-model/spec.md) — symbol search and file matching
- [`code-graph:traversal`](../../code-graph/traversal/spec.md) — AST traversal
- [`code-graph:language-adapter`](../../code-graph/language-adapter/spec.md) — language adapters and extension mappings
- [`core:get-persisted-spec-implementation`](../../core/get-persisted-spec-implementation/spec.md) — query persisted links
- [`core:update-persisted-spec-implementation`](../../core/update-persisted-spec-implementation/spec.md) — mutate persisted links
