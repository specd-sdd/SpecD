# Tasks: implementation-file-tracking

## 1. Change domain and persistence

- [x] 1.1 Add tracked implementation state to the active change manifest
      `packages/core/src/infrastructure/fs/manifest.ts`: `ChangeManifest`
      Approach: Replace the old candidate-centric shape with `trackedImplementationFiles` and `implementationLinks`, with required/optional fields aligned to the proposal.
      (Req: Manifest structure, Implementation tracking state)
- [x] 1.2 Teach `Change` to own implementation invariants
      `packages/core/src/domain/entities/change.ts`: `Change`
      Approach: Add first-class mutation methods for tracked files and `spec + file` link sets, including `fileLinkExplicit` invariants and last-symbol removal behavior. Expose `getHistoricalImplementationAt(): Date | null` so both guards and detector baseline resolution reuse the same history scan.
      (Req: Implementation tracking state, Explicit vs container-only file links, Historical implementation detection guard)
- [x] 1.3 Round-trip the new manifest shape through the repository mutation boundary
      `packages/core/src/infrastructure/fs/change-repository.ts`
      Approach: Load and persist the new manifest fields through `ChangeRepository.mutate(name, fn)` without regressing locking or change snapshots.
      (Req: Manifest structure, Repository mutation semantics)

## 2. Detection and VCS integration

- [x] 2.1 Add `modifiedFiles(...)` to the VCS port and concrete adapters
      `packages/core/src/application/ports/vcs-adapter.ts`
      `packages/core/src/infrastructure/{git,hg,svn,null}/vcs-adapter.ts`
      Approach: Extend the port and implement repo-relative file enumeration plus `refAt(at)` historical revision lookup for all supported backends; null fallback returns `null` for `refAt` and an empty array for `modifiedFiles`.
      (Req: modifiedFiles lists changed repository files, refAt resolves the revision active at a timestamp)
- [x] 2.2 Define the `ImplementationDetector` application port
      `packages/core/src/application/ports/implementation-detector.ts`
      Approach: Expose detection in terms of the change/application layer, not raw CLI concerns.
      (Req: Detector interface)
- [x] 2.3 Implement the VCS-backed detector
      `packages/core/src/infrastructure/vcs/vcs-implementation-detector.ts`
      Approach: Resolve the base ref from `change.getHistoricalImplementationAt()` by calling `VcsAdapter.refAt(...)`, fall back to `ref()` when needed, normalize VCS output to raw project-relative paths, and add debug logging around detection start/end and counts.
      (Req: VCS implementation detector, Debug logging)
- [x] 2.4 Wire the detector in the kernel
      `packages/core/src/composition/kernel.ts`
      Approach: Compose the VCS-backed implementation once and inject it into all use cases that trigger autodetection.
      (Req: Construction dependencies, Trigger points)

## 3. Use cases and CLI for implementation tracking

- [x] 3.1 Trigger autodetection in `GetStatus`
      `packages/core/src/application/use-cases/get-status.ts`
      Approach: Guard on `getHistoricalImplementationAt()`, run detection through `ChangeRepository.mutate(...)`, persist newly tracked files. Project `implementationTracking` result shape (trackedFiles, links — no staleness). Constructor gains `implementationDetector`.
      (Req: Implementation autodetection on status load, Implementation status projection)
- [x] 3.2 Trigger autodetection in `CompileContext`
      `packages/core/src/application/use-cases/compile-context.ts`
      Approach: Guard on `getHistoricalImplementationAt()`, refresh tracked implementation state before composing agent context. Constructor gains `implementationDetector`.
      (Req: CompileContext detection trigger)
- [x] 3.3 Trigger autodetection before transitions
      `packages/core/src/application/use-cases/transition-change.ts`
      Approach: Guard on `getHistoricalImplementationAt()`, run detection before transition guards and persistence. Constructor gains `implementationDetector`.
      (Req: Transition detection trigger)
- [x] 3.4 Add a core use case for implementation mutations and review projection
      `packages/core/src/application/use-cases/{update-implementation-tracking,get-implementation-review}.ts`
      Approach: Keep CLI thin by centralizing `add`, `remove`, `ignore` (with `IMPLEMENTATION_LINKS_EXIST` guard), `resolve`, and raw tracking projection (no graph staleness — that stays in CLI) in core.
      (Req: Implementation command behavior, Review projection)
- [x] 3.5 Wire implementation-tracking use cases in the kernel
      `packages/core/src/composition/kernel.ts`
      Approach: Register and expose `update-implementation-tracking` and `get-implementation-review` alongside the detector-backed use cases so CLI commands consume the composed core surface.
      (Req: Construction dependencies, Review projection)
- [x] 3.6 Add the `change implementation` CLI group
      `packages/cli/src/commands/change/implementation.ts`
      `packages/cli/src/index.ts`
      Approach: Register `list`, `add`, `remove`, `ignore`, `resolve`, and `review`. `review` and `list` enrich core results with stale symbol diagnostics by querying `CodeGraphProvider` at the CLI layer (not in core). All commands share raw project-relative path semantics.
      (Req: Command signature, Add/remove/ignore/resolve/review subcommands)
- [x] 3.7 Extend `change status` output
      `packages/cli/src/commands/change/status.ts`
      Approach: Render tracked files grouped by `open | resolved | ignored`, confirmed links grouped by spec. Enrich with stale symbol-link diagnostics by querying code graph at the CLI layer. Show graph-state hint when not indexed or stale.
      (Req: Implementation status projection)
- [x] 3.8 Add composed-symbol fallback to CLI stale enrichment
      `packages/cli/src/commands/change/{status,implementation}.ts`
      `packages/cli/src/commands/change/_implementation-tracking.ts`
      Approach: When exact symbol lookup fails during CLI stale enrichment, retry same-file member resolution using the rightmost segment of composed symbols split on `.`, `#`, or `::`. Treat exactly one same-file match as non-stale for CLI output only; keep ambiguous or missing matches stale without rewriting stored links.
      (Req: Implementation status projection, Review subcommand, List subcommand)

## 4. Archive and `spec-lock` materialization

- [x] 4.1 Extend `spec-lock` parsing and persistence
      `packages/core/src/domain/services/parse-spec-lock.ts`
      `packages/core/src/application/ports/spec-repository.ts`
      `packages/core/src/infrastructure/fs/spec-repository.ts`
      Approach: Preserve existing `dependsOn` behavior while adding durable file-level and symbol-level implementation sections.
      (Req: spec-lock structure, Implementation projection)
- [x] 4.2 Plan and validate implementation materialization during archive
      `packages/core/src/application/use-cases/archive-change.ts`
      Approach: Build an in-memory plan that validates `specId -> workspace -> codeRoot`, filters `graph.excludePaths`, groups canonical links by spec, transforms manifest flat links into sidecar-scoped entries (strip `specId`, split file-level vs symbol-level), and replaces (not unions) existing sidecar implementation entries atomically.
      (Req: Implementation materialization into spec-lock, Raw-to-canonical conversion boundary)
- [x] 4.3 Implement spec-metadata extraction rules for implementation projection
      `packages/core/src/domain/services/extract-metadata.ts` (or equivalent extraction pipeline)
      `packages/core/src/infrastructure/fs/spec-repository.ts`
      Approach: Add extraction rules that derive `implementation.files` and `implementation.symbols` from the archived `spec-lock.json` into `metadata.json`. Plug into the existing `extractMetadata` pipeline so no separate metadata write pass is needed.
      (Req: Metadata projection for implementation data)
- [x] 4.4 Add archive guards and override handling
      `packages/core/src/application/use-cases/archive-change.ts`
      `packages/cli/src/commands/change/archive.ts`
      Approach: Fail on unresolved/open tracked files, fail on out-of-codeRoot links, and require `--allow-out-of-scope` for external sidecar updates with clear repair guidance.
      (Req: Tracked implementation review guard, Out-of-scope sidecar update guard)

## 5. Code graph model, store, and indexing

- [x] 5.1 Replace deferred `COVERS` semantics with `COVERS_FILE` and `COVERS_SYMBOL`
      `packages/code-graph/src/domain/value-objects/{relation-type,relation}.ts`
      Approach: Define the two relation families explicitly and preserve `stale` metadata only on `COVERS_SYMBOL`.
      (Req: Relation types, Relation staleness)
- [x] 5.2 Extend the graph-store abstraction with coverage queries
      `packages/code-graph/src/domain/ports/graph-store.ts`
      Approach: Add query methods for covered files/symbols and covering specs so traversal and CLI code remain backend-agnostic.
      (Req: Minimum graph semantics, Query methods)
- [x] 5.3 Persist coverage relations in SQLite and Ladybug
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`
      Approach: Store `COVERS_FILE` and `COVERS_SYMBOL` in both backends, including stale metadata round-trip for symbol coverage.
      (Req: Persisted relation storage, Relationship tables)
- [x] 5.4 Index implementation traceability from `spec-lock.json`
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`
      Approach: Load sidecars during spec indexing and emit `COVERS_FILE` / `COVERS_SYMBOL` relations, preserving stale metadata.
      (Req: Spec dependency indexing)

## 6. Traversal, provider facade, and graph impact CLI

- [x] 6.1 Add requirement-aware traversal
      `packages/code-graph/src/domain/services/traversal.ts`
      Approach: Introduce `analyzeSpecImpact(...)` that combines `DEPENDS_ON`, `COVERS_FILE`, and `COVERS_SYMBOL`.
      (Req: Spec impact)
- [x] 6.2 Expose requirement coverage and impact through the provider facade
      `packages/code-graph/src/composition/code-graph-provider.ts`
      Approach: Mirror the new graph-store coverage queries and traversal entry points on `CodeGraphProvider`.
      (Req: CodeGraphProvider facade)
- [x] 6.3 Extend `graph impact` with `--spec`
      `packages/cli/src/commands/graph/impact.ts`
      Approach: Add a third mutually exclusive selector, surface spec-oriented text/JSON output, and preserve existing file/symbol modes.
      (Req: Command signature, Spec impact analysis, Error cases)

## 7. Skills, automation, and docs

- [x] 7.1 Refresh skill templates and automation prompts
      `packages/skills/templates/...`
      Approach: Update implementation/archive workflow instructions to mention tracked files, `change implementation`, and archive-side repair flow.
      (Req: Implementation tracking instructions in templates)
- [x] 7.2 Update operator-facing CLI docs and examples
      `packages/cli/src/commands/change/{status,implementation,archive}.ts`
      `packages/cli/src/commands/graph/impact.ts`
      Approach: Align help text, examples, and diagnostics with stale-enrichment behavior in `change status`, `resolve`, `--allow-out-of-scope`, and `--spec`.
      (Req: CLI help and documentation updates)

## 8. Verification

- [x] 8.1 Add domain/repository tests for tracked files and links
      `packages/core/test/domain/entities/change.spec.ts`
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`
      Approach: Cover tracked-file state transitions, `fileLinkExplicit` invariants, `getHistoricalImplementationAt()` semantics, and manifest round-trip.
- [x] 8.2 Add VCS adapter and detector tests
      `packages/core/test/infrastructure/{git,hg,svn}/vcs-adapter.spec.ts`
      `packages/core/test/infrastructure/vcs/vcs-implementation-detector.spec.ts`
      Approach: Verify `modifiedFiles(...)` and `refAt(...)` contracts for each backend, `NullVcsAdapter.refAt(...) -> null`, `NullVcsAdapter.modifiedFiles(...) -> []`, detector normalization to raw project-relative paths, and base-ref resolution from change history.
- [x] 8.3 Add use-case and archive integration tests
      `packages/core/test/application/use-cases/{get-status,compile-context,transition-change,archive-change}.spec.ts`
      Approach: Verify autodetection trigger points (guarded by `getHistoricalImplementationAt()`), `IMPLEMENTATION_LINKS_EXIST` on ignore, archive filtering, sidecar replacement semantics, and out-of-scope guard behavior. No graph staleness tests in core — staleness is a CLI-layer concern.
- [x] 8.4 Add spec-metadata projection tests
      `packages/core/test/...`
      Approach: Verify `metadata.json` derives `implementation.files` and `implementation.symbols` from archived `spec-lock.json` data without mutating the sidecar source of truth.
- [x] 8.5 Add CLI enrichment tests for implementation tracking
      `packages/cli/test/...`
      Approach: Verify `change status` and `change implementation list/review` enrich raw core links with stale diagnostics only at the CLI layer and show graph-state hints when the graph is unavailable or stale.
- [x] 8.6 Add graph backend and traversal tests
      `packages/code-graph/test/...`
      Approach: Verify `COVERS_FILE` / `COVERS_SYMBOL` persistence in both backends, sidecar indexing, and `graph impact --spec` traversal/output.
- [x] 8.7 Add composed-symbol fallback CLI tests
      `packages/cli/test/...`
      Approach: Verify `change status` and `change implementation list/review` clear stale diagnostics when a composed symbol resolves uniquely within the same file by rightmost-segment fallback, and keep diagnostics when fallback yields zero or multiple matches.

## 10. Additional compliance and bug fixes

- [x] 10.1 Validate file existence in `add`, `resolve`, and `ignore`
      `packages/cli/src/commands/change/implementation.ts`: `mutateImplementationTracking`
      Approach: Before calling the core use case, split the input file path(s) and verify that every path exists on disk using `fs.stat()`. Throw `ImplementationFileNotFoundError` if any are missing.
      (Req: cli:change-implementation/Add, Resolve, Ignore subcommands)
- [x] 10.2 Add automated tests for universal file existence validation
      `packages/cli/test/commands/change-implementation.spec.ts`
      Approach: Add test cases that attempt to `add`, `resolve`, and `ignore` non-existent files and assert that the commands fail with the expected error.
      (Req: cli:change-implementation verification)
- [x] 10.3 Implement comma-separated file list support for `resolve` and `ignore`
      `packages/cli/src/commands/change/implementation.ts`: `registerChangeImplementation`
      Approach: Update the `resolve` and `ignore` command definitions to clarify multi-file support. Refine `mutateImplementationTracking` to handle the parsed array of files (from comma-splitting) by iterating and executing the core use case for each valid file.
      (Req: cli:change-implementation/Resolve, Ignore subcommands)
- [x] 10.4 Resolve spec-overlap drift for `core:archive-change` and `core:spec-metadata`
      `specd-sdd/changes/20260516-062814-implementation-file-tracking/deltas/core/{archive-change,spec-metadata}/spec.md.delta.yaml`
      Approach: Re-validate the drifted deltas against the new project specs updated by `fix-archive-preflight-atomicity`. Ensure structural selectors still target the intended sections.
      (Req: Internal consistency)
