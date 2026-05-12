# Proposal: fix-graph-impact-type-alias-deps

## Motivation

`graph impact` is meant to give agents and developers a reliable blast-radius view before editing code. The initial symptom was missing dependents when the connection to a target symbol flows through static type relations such as aliases, registry types, typed constructor parameters, or other deterministic type-use constructs.

Code analysis shows the current source already has much of the required `USES_TYPE` support. A forced reindex changed the observed result, so graph derivation freshness is one confirmed factor. It is not yet proven to be the only cause, because `--force` had reportedly been used before without surfacing the missing dependent.

## Current behaviour

Impact analysis for `ArtifactParser` and `ArtifactParserRegistry` originally reported fewer semantic dependents than the current source graph implies. A concrete repro was `packages/core/src/application/use-cases/generate-spec-metadata.ts`: the file was indexed and uses `ArtifactParserRegistry`, but it was absent from `graph impact --symbol "ArtifactParserRegistry"` results even with increased depth.

Text search finds the mention, and `graph search --symbols "GenerateSpecMetadata"` confirms the file is indexed, so the gap appears to be in relation extraction, relation persistence, or traversal semantics rather than file discovery.

Existing GitHub issue `#52` (`code-graph: complete dependency detection in TypeScript, Python, and Go`) already tracks the broader multi-language dependency detection gap. Issue `#54` (`Add a shared scoped binding environment for multi-language call resolution`) captured a related architecture for scoped binding and was closed, but its focus is call and receiver resolution. This change narrows the problem to static type-use impact, especially `USES_TYPE` relations and alias expansion.

After running `graph index --force` during this investigation, the missing `generate-spec-metadata.ts` dependency appeared and `ArtifactParserRegistry` impact expanded from 20 affected files to 273 affected files. This confirms that the previously queried persisted graph lacked edges that the current indexer can now produce. It does not fully explain why earlier forced indexes reportedly did not produce the same result, so the design must include diagnostics for index configuration, graph storage path, adapter extraction output, and CLI build/version identity rather than assuming stale data alone.

There is also a CLI semantics gap between `graph impact --file` and `graph impact --changes`. For the same single file, `--changes` returns a narrower symbol set than `--file` because it uses a different `detectChanges()` path rather than file-impact semantics. The name also collides with specd lifecycle "changes", making the command harder to explain. Because specd is still alpha, this change should remove `--changes` entirely instead of preserving a confusing compatibility alias.

## Proposed solution

Update the code-graph specifications so derived graph freshness accounts for the index model that produced the stored graph, not only the source-file content and VCS ref. For this change, keep the fingerprint deliberately small and stable: derive it from the resolved workspace configuration and the installed `@specd/code-graph` package version.

The workspace component should hash the normalized, already-resolved workspace objects instead of raw `specd.yaml` text. This avoids unnecessary invalidation from comments, key ordering, or unrelated config formatting while still detecting changes to indexed workspace roots, prefixes, ownership, external paths, or other fields that affect discovery and graph identity. The package component should use the effective `@specd/code-graph` version that the running CLI loaded.

When `graph index` detects that the stored graph fingerprint differs from the current fingerprint, it should not silently perform a normal incremental skip. The preferred behaviour is to treat the run as an implicit `--force`, recreate the graph, and print a visible warning explaining the mismatch, for example that the code-graph version or resolved workspace configuration changed. This keeps `graph index` self-healing while still making the expensive full rebuild and its cause explicit. A hard error that tells the user to rerun with `--force` is an acceptable fallback only if automatic recreation would be unsafe for a given backend.

In addition, add a diagnostic path for mismatches where `--force` results differ across runs: graph commands should make it possible to identify the storage path, graph-store backend, indexed workspaces, package/CLI build identity, schema version, and extraction fingerprint that produced the current graph.

Unify file impact semantics by making `graph impact --file` accept one or more file paths. Multi-file `--file` should aggregate the existing file-impact semantics for each target, deduplicate affected files and symbols, and report the changed symbols that belong to the requested files. The obsolete `--changes` selector should be removed from the CLI, help text, docs, AGENTS instructions, and skill templates rather than kept as an alias.

Fix path resolution for graph file selectors at the same time. Today agents often pass repository-relative or absolute paths without a workspace prefix, and those paths are prone to being interpreted as `default:` paths instead of the indexed workspace file. The graph should persist, alongside the current workspace-prefixed path, a second normalized path relative to the directory containing the `specd.yaml` used for indexing. When a graph command receives a file path without an explicit `<workspace>:` prefix, it should resolve that input against this config-relative path index. If the input is absolute, the CLI should first convert it to the equivalent path relative to the active config directory, then look it up. Explicit workspace-prefixed paths should continue to resolve by the canonical graph path.

Also close the spec gaps around the behavior already present in code: static type dependencies represented by `USES_TYPE`, including deterministic references through type aliases and registry-like aliases, must be part of impact analysis. The graph-store contract should make those symbol dependency semantics explicit so traversal does not depend on hidden backend behavior.

The behavior should be language-agnostic. TypeScript's `ArtifactParserRegistry = ReadonlyMap<string, ArtifactParser>` is the initial regression case, but equivalent patterns exist in Go (`type ParserRegistry map[string]ArtifactParser`), Rust (`type ParserRegistry = HashMap<String, Box<dyn ArtifactParser>>`), Python typing aliases, Java/Kotlin maps, C# dictionaries, and Swift typealiases. Each adapter should emit `USES_TYPE` when it can resolve the referenced type deterministically.

The implementation should remain conservative: unresolved, ambiguous, or runtime-only references must not create speculative impact edges.

## Specs affected

### New specs

_none_

### Modified specs

- `code-graph:symbol-model`: clarify that deterministic type alias expansion and registry alias references emit `USES_TYPE` relations when the referenced type symbols resolve.
  - Depends on (added): none
- `code-graph:graph-store`: expose `USES_TYPE` as part of the minimum persisted graph semantics and add query support for incoming and outgoing static type usage relations.
  - Depends on (added): none
- `code-graph:traversal`: require impact analysis to include `USES_TYPE` relations in affected symbol discovery, counts, risk calculation, and affected-file aggregation.
  - Depends on (added): none
- `code-graph:indexer`: require indexing to compare the stored graph fingerprint with the current fingerprint and perform a full rebuild when the code-graph version or resolved workspace configuration changes.
  - Depends on (added): none
- `code-graph:staleness-detection`: extend freshness semantics to distinguish VCS freshness from graph derivation freshness, so commands can warn when graph data was produced by an older extraction model.
  - Depends on (added): none
- `cli:graph-impact`: remove `--changes`, make `--file` accept multiple files, and require text output to include changed and affected symbol details for file-impact analysis.
  - Depends on (added): `code-graph:traversal`, `code-graph:workspace-integration`
- `code-graph:workspace-integration`: persist config-relative file paths and define how graph file selectors resolve paths without an explicit workspace prefix.
  - Depends on (added): none
- `skills:skill-templates-source`: update canonical workflow skill templates so generated and installed agent skills use multi-file `graph impact --file` examples and no longer reference `--changes`.
  - Depends on (added): `cli:graph-impact`

## Impact

Affected code areas are expected to include:

- `packages/code-graph/src/domain/value-objects/relation.ts` for relation vocabulary consistency if needed.
- `packages/code-graph/src/domain/ports/graph-store.ts` for static type usage query methods if they are missing.
- `packages/code-graph/src/domain/services/analyze-impact.ts` and traversal helpers for including `USES_TYPE` edges.
- `packages/code-graph/src/application/use-cases/index-code-graph.ts` for comparing the stored graph fingerprint with the current index model before incremental indexing.
- `packages/code-graph/src/domain/value-objects/file-node.ts`, graph-store schemas, and indexer write paths for persisting both the canonical workspace-prefixed path and a config-relative path for each indexed file.
- `packages/cli/src/commands/graph/index-graph.ts`, `graph stats`, and related context resolution for reporting the exact graph storage path, backend, indexed workspaces, and derivation metadata used by query commands.
- `packages/cli/src/commands/graph/impact.ts` for removing `--changes`, changing `--file` to a variadic selector, resolving non-workspace file inputs through config-relative paths, aggregating multi-file impact results, and rendering changed/affected symbol details in text output.
- `docs/cli/cli-reference.md`, `AGENTS.md`, generated agent skills under `.agents/`, `.codex/`, `dev/ai-agents/skills/`, and `packages/skills/templates/` for removing `--changes` examples and replacing them with multi-file `--file` guidance.
- `packages/skills/templates/shared/shared.md`, `packages/skills/templates/specd-design/SKILL.md`, and generated skill copies for aligning the canonical skill source with the new graph impact selector semantics.
- Language adapters and relation resolution code if type annotations, aliases, and registry-like type references are not currently emitted as `USES_TYPE`.
- SQLite graph-store implementation if query methods or relation persistence need backend support.
- CLI graph commands that report freshness if they need to surface semantic graph staleness separately from VCS-ref staleness.
- Code-graph and CLI tests covering fingerprint mismatch handling, symbol-model extraction, graph-store queries, impact traversal, multi-file `--file`, and removal of the `--changes` selector.

CLI output shape should not need a breaking change: existing `affectedFiles`, `affectedSymbols`, dependent counts, and risk level fields can include the additional semantic edges.

## Technical context

During exploration, `graph impact --symbol "ArtifactParser"` reported 20 affected files while `rg -n "ArtifactParser"` reported 214 textual matches across 62 files. The relevant issue is not that impact should equal text search; it is that a semantically relevant indexed file is missing.

The repro centers on:

- `packages/core/src/application/ports/artifact-parser.ts`, where `ArtifactParser` and `ArtifactParserRegistry = ReadonlyMap<string, ArtifactParser>` are declared.
- `packages/core/src/application/use-cases/generate-spec-metadata.ts`, where `ArtifactParserRegistry` is imported, stored in `_parsers`, and used via `this._parsers.get(format)`.

Existing specs already define `USES_TYPE` as a first-class relation in `code-graph:symbol-model`, but `code-graph:traversal` currently calls out call/import and hierarchy relations for impact, not static type usage. `code-graph:graph-store` also needs to make the storage/query contract for `USES_TYPE` explicit so traversal can remain a pure domain service over the `GraphStore` port.

Code-level findings from this investigation:

- `packages/code-graph/src/domain/value-objects/relation-type.ts` already defines `RelationType.UsesType`.
- `packages/code-graph/src/domain/services/scoped-binding-environment.ts` already resolves type binding facts into `USES_TYPE` dependencies for parameters, return types, properties, imported types, class-managed bindings, inherited bindings, and framework-managed bindings.
- `packages/code-graph/src/domain/services/get-upstream.ts` uses `store.getCallers()`, and the SQLite test helper plus SQLite backend treat `CALLS`, `CONSTRUCTS`, and `USES_TYPE` as symbol dependency relations returned by `getCallers()`/`getCallees()`.
- `packages/code-graph/src/application/use-cases/index-code-graph.ts` uses content hashes for incremental skipping. If the file hash matches, adapter extraction is skipped entirely, so improvements to relation extraction do not refresh old graph rows for unchanged files.
- The persisted graph before a forced reindex was missing `IMPORTS` and `USES_TYPE` edges from `generate-spec-metadata.ts` to `artifact-parser.ts`. After `graph index --force`, those edges appeared and the impact output included `generate-spec-metadata.ts`.
- The CLI implementation of `graph index --force` calls `provider.recreate()` before indexing, and `createCodeGraphProvider(config)` derives graph storage from `config.configPath` (`.specd/config` in this project), which is the same storage path used by graph query commands in configured mode.
- The CLI implementation of `graph impact --changes` calls `provider.detectChanges(files, maxDepth)`. For the same file and depth, `--file` and `--changes` currently return different affected-symbol sets: `--changes` is a subset because it does not use `analyzeFileImpact()` and does not include the same file-level expansion. This confirms that the selectors are not two presentations of the same calculation.
- Repository search found `--changes` references in `AGENTS.md`, `docs/cli/cli-reference.md`, `specs/cli/graph-impact/*`, `.agents` and `.codex` skill copies, `dev/ai-agents/skills`, and `packages/skills/templates`. Removing the selector requires updating all of those sources so agents do not keep using stale command examples.
- Current graph APIs primarily address files by workspace-prefixed paths such as `core:src/application/use-cases/generate-spec-metadata.ts`. That is correct as the canonical graph identity, but it is brittle for CLI usage because agents frequently pass paths copied from diffs, terminals, or editor buffers, such as `packages/core/src/application/use-cases/generate-spec-metadata.ts` or an absolute filesystem path.
- The new path-resolution rule should not infer `default:` for unprefixed inputs. Instead, the indexer should persist a normalized path relative to the config directory used to load `specd.yaml`, for example `packages/core/src/application/use-cases/generate-spec-metadata.ts`, and commands should resolve unprefixed arguments by this config-relative path. This keeps canonical graph identity workspace-prefixed while making user-facing file selectors match how agents naturally reference files.
- Because earlier forced indexes reportedly did not surface the same dependent, the implementation should not rely on the forced-reindex observation as the sole root cause. It should add observable metadata so future comparisons can distinguish "old graph rows", "different config/storage path", "different CLI/dist build", "different workspace set", and "adapter extraction still failed".

The proposed implementation direction is therefore:

1. Add a graph index fingerprint persisted in graph-store metadata.
2. Compute the current fingerprint from two inputs: the effective `@specd/code-graph` package version and a canonical hash of the resolved workspace objects from the loaded config.
3. Prefer hashing resolved workspace objects over raw `specd.yaml` so formatting-only config changes do not invalidate the graph.
4. Compare the stored fingerprint with the current fingerprint at the start of `graph index`.
5. If the fingerprint differs, treat the run as an implicit `--force`: recreate the graph, index all discovered files, and print a visible warning that includes the mismatch reason.
6. If automatic recreation is unavailable or unsafe for a backend, fail with a clear error telling the user that the code-graph version or workspace fingerprint changed and that `graph index --force` is required.
7. Keep VCS-ref freshness as a separate signal; this fingerprint is about graph derivation identity and workspace scope, not whether source files changed since the last index.
8. Add graph diagnostics that report the active storage path, backend id, indexed workspace set, current VCS ref, stored VCS ref, CLI build id, stored fingerprint, current fingerprint, and mismatch reasons so impact differences can be reproduced without guessing.

This intentionally avoids a more granular extractor-module fingerprint for now. Package version plus resolved-workspace hash is less precise, but it is easier to reason about, avoids a brittle list of internal files, and still covers the two practical causes discussed here: upgraded code-graph semantics and changed workspace scope.

For graph impact CLI semantics:

1. Remove the `--changes` option from `graph impact`.
2. Change `--file <path>` to accept one or more paths.
3. Resolve each explicit workspace-prefixed path by canonical graph path.
4. Resolve each unprefixed relative path by the stored config-relative path.
5. Resolve each absolute path by first converting it to a normalized path relative to the active config directory, then looking up that config-relative path.
6. Preserve the current single-file output shape where practical for one input, or document any structured-output shape change in `cli:graph-impact`.
7. For multiple files, aggregate per-file impact using the same semantics as current `analyzeFileImpact()` for each input file.
8. Deduplicate `affectedFiles` and `affectedSymbols` across all file results.
9. Include changed symbols, affected symbols, and affected files in text output so humans can understand the risk without switching to JSON.
10. Remove `--changes` from CLI help, CLI reference docs, `AGENTS.md`, skill templates, generated skill copies, and graph-impact specs/verification scenarios.

For graph file identity:

1. Keep the current workspace-prefixed file path as the canonical `FileNode.path` and `SymbolNode.filePath`.
2. Add a config-relative path field to file metadata, derived from the directory containing the `specd.yaml` used for indexing.
3. Normalize config-relative paths to forward slashes and no leading `./`.
4. For files outside the config directory, store a normalized relative path with `..` segments rather than an absolute path, so the value remains portable with the indexed config root.
5. Ensure graph-store backends can look up files by either canonical workspace-prefixed path or config-relative path.
6. If an unprefixed input matches zero files, report a clear not-found error that includes the normalized config-relative path that was searched.
7. If an unprefixed input matches multiple files, fail with an ambiguity error listing the matching workspace-prefixed paths rather than guessing a workspace.

Issue review found:

- `#52` is open and documents the general dependency-detection debt across TypeScript, Python, and Go, including type annotations and constructor injection.
- `#54` is closed and proposes a shared scoped binding environment for multi-language call resolution. It is adjacent but does not fully specify how static type-use relations should participate in impact traversal.
- No existing issue appears to mention the exact `ArtifactParserRegistry` alias/registry repro, so this change should reference `#52` as the parent context while specifying the missing `USES_TYPE` behavior in the specs.

## Open questions

_none_
