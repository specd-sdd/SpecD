# Tasks: llm-optimized-metadata

## 1. Schema & Domain

- [x] 1.1 Update `SpecMetadata` and `strictSpecMetadataSchema`
      `packages/core/src/domain/services/parse-metadata.ts`: `SpecMetadata`, `strictSpecMetadataSchema` — add optional `optimizedDescription` and `optimizedContext` strings.
      Approach: update interface and Zod schema with `.optional()` fields; ensure `strictSpecMetadataSchema` remains strict for writes.
      (Req: Metadata storage and schema, Write-time structural validation)
- [x] 1.2 Define `ProjectMetadata` schema and storage
      `packages/core/src/domain/services/project-metadata.ts`: new file — define the persistence contract.
      Approach: implement the structure defined in the proposal (version, optimized, freshness hashes, generated timestamp).
      (Req: Data schema, Input tracking)

## 2. Use Case Logic (Update)

- [x] 2.1 Implement `UpdateSpecMetadata` use case
      `packages/core/src/application/use-cases/update-spec-metadata.ts`: new class `UpdateSpecMetadata` — perform merge-update on spec metadata.
      Approach: perform fresh extraction via `GenerateSpecMetadata`, merge the optimized fields (`optimizedDescription`, `optimizedContext`) from input, and delegate to `SaveSpecMetadata`.
      (Req: Deterministic extraction before merge, Merging optimized fields, Persistence)
- [x] 2.2 Implement `UpdateProjectMetadata` use case
      `packages/core/src/application/use-cases/update-project-metadata.ts`: new class `UpdateProjectMetadata` — compute hashes and save project metadata.
      Approach: compute current SHA-256 for `specd.yaml`, context files, and included specs; accept `{ optimizedContext: string }` and map to internal schema; persist to `project-metadata.json` in `configPath`.
      (Req: Hash computation, Atomicity, Payload separation)

## 3. Consumption Logic

- [x] 3.1 Update `CompileContext` to prefer optimized context
      `packages/core/src/application/use-cases/compile-context.ts`: `_renderFromMetadata` — use `optimizedContext` as fallback.
      Approach: if `llmOptimizedContext` is active and `optimizedContext` is present/non-empty, use it instead of `context`.
      (Req: Prefer LLM-optimized context)
- [x] 3.2 Update `GetSpecContext` to prefer optimized context
      `packages/core/src/application/use-cases/get-spec-context.ts`: `_buildEntry` — use `optimizedContext` as fallback.
      Approach: similar to `CompileContext`, prefer the optimized field for single-spec context injection.
      (Req: Prefer LLM-optimized context)
- [x] 3.3 Implement cache verification in `GetProjectContext`
      `packages/core/src/application/use-cases/get-project-context.ts`: `execute()` — verify `project-metadata.json` freshness.
      Approach: load file, compare stored hashes against current system state using `ContentHasher`; if fresh, use `optimized.context`; if stale, compile raw and emit warning.
      (Req: Project context optimization and invalidation)
- [x] 3.4 Update Code Graph indexer to use optimized descriptions
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: `SpecNode` mapping — prefer `optimizedDescription`.
      Approach: update the mapping from `SpecMetadata` to `SpecNode` to use the optimized description when available.
      (Req: Prefer LLM-optimized description)

## 4. CLI Implementation

- [x] 4.1 Implement `specd spec update-metadata` command
      `packages/cli/src/application/commands/spec-update-metadata.ts`: new command — delegate to `UpdateSpecMetadata`.
      Approach: accept spec ID and partial payload from stdin/file using `--file <path>`; call use case.
      (Req: Command signature, Partial schema input, Delegation)
- [x] 4.2 Implement `specd project update-metadata` command
      `packages/cli/src/application/commands/project-update-metadata.ts`: new command — delegate to `UpdateProjectMetadata`.
      Approach: accept optimized payload `{ optimizedContext: string }` from stdin or `--file <path>`; call use case.
      (Req: Input payload, Delegation)
- [x] 4.3 Implement `specd project metadata` command
      `packages/cli/src/application/commands/project-metadata.ts`: new command — display `project-metadata.json`.
      Approach: load and print full structured metadata with formatting support (`text`, `json`, `toon`).
      (Req: Display full structure, Formatted output)
- [x] 4.4 Add warnings to context commands
      `packages/cli/src/application/commands/change-context.ts`, `project-context.ts`: update output logic — show warnings at the top.
      Approach: if optimization warning signal is present, append instructions to the output.
      (Req: Optimization warning signal)

## 5. Documentation

- [x] 5.1 Update CLI reference documentation
      `docs/cli/`: Update or create documentation for `spec update-metadata`, `project update-metadata`, and `project metadata` commands.
      Approach: describe command signatures, inputs (stdin/file), and their role in the optimization workflow.
- [x] 5.2 Update Configuration reference
      `docs/config/config-reference.md`: explain `llmOptimizedContext` flag and `project-metadata.json`.
      Approach: detail the cache invalidation mechanism and how it improves agent performance.
- [x] 5.3 Update Optimization Guide
      `docs/guide/`: Update documentation on how to use optimization skills and commands.
      Approach: provide a clear workflow for agents to self-correct missing optimizations.

## 7. Refinements & Fixes

- [x] 7.1 Standardize CLI metadata update flags
      `packages/cli/src/commands/spec/update-metadata.ts`, `packages/cli/src/commands/project/update-metadata.ts`: rename `--input` to `--file`.
      Approach: update commander option definitions to use `--file` as required by the specifications.
- [x] 7.2 Implement spec-level optimization warnings in `CompileContext`
      `packages/core/src/application/use-cases/compile-context.ts`: `execute()` — check for missing `optimizedContext` in included specs.
      Approach: if `llmOptimizedContext` is true, iterate over result specs and add a `ContextWarning` for each one lacking optimization.
- [x] 7.3 Include remediation instructions in optimization warnings
      `packages/core/src/application/use-cases/compile-context.ts`, `get-project-context.ts`: update warning messages.
      Approach: append explicit instructions (e.g., "Run specd-spec-metadata skill to refresh") to the warning strings.
- [x] 7.4 Verify CLI warning placement alignment
      `packages/cli/src/commands/change/context.ts`, `packages/cli/src/commands/project/context.ts`: ensure warnings include instructions.
      Approach: confirm that warnings (even in stderr) carry the required remediation text from the core.

## 8. Code Graph Indexer Fixes

- [x] 8.1 Fix spec `contentHash` algorithm in indexer
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: `_indexSpecs()` — compute hash from content artifacts.
      Approach: collect all spec artifacts (excluding metadata), sort with `spec.md` first, then alphabetically; hash their contents combined.
- [x] 8.2 Enforce spec artifact concatenation ordering
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: `_indexSpecs()` — ensure `spec.md` is first.
      Approach: update content assembly logic to prioritize `spec.md` followed by other artifacts in alphabetical order.
- [x] 8.3 Add tests for indexer spec hashing and ordering
      `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`: add scenarios.
      Approach: verify that `contentHash` remains stable when metadata changes but artifacts don't; verify that `SpecNode.content` has the correct order.
