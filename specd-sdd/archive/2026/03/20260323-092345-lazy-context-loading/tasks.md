# Tasks: lazy-context-loading

## 1. Config — contextMode field

- [x] 1.1 Add `contextMode` to `SpecdConfig`
      `packages/core/src/application/specd-config.ts`: `SpecdConfig` — add `contextMode?: 'full' | 'lazy'`
      Approach: optional field, defaults handled at config loading time
      (Req: Context mode)

- [x] 1.2 Add `contextMode` to `CompileContextConfig`
      `packages/core/src/application/use-cases/compile-context.ts`: `CompileContextConfig` — add `contextMode?: 'full' | 'lazy'`
      Approach: optional field passed through from SpecdConfig to use case input
      (Req: Input, Context mode)

- [x] 1.3 Validate `contextMode` at infrastructure boundary
      `packages/core/src/infrastructure/fs/config-loader.ts` (or Zod schema): validate `contextMode` is `'full'` or `'lazy'`; reject other values with `ConfigValidationError`; reject if present inside workspace entry
      Approach: add to the config validation schema; default to `'full'` when omitted; add a workspace-level check that rejects `contextMode` as unknown field
      (Req: Startup validation, Context mode)

- [x] 1.4 Test config validation
      `packages/core/test/infrastructure/fs/config-loader.spec.ts`: add tests for valid values, default, invalid values, workspace-level rejection
      Approach: add describe block with 4 cases — `'full'` accepted, `'lazy'` accepted, omitted defaults to `'full'`, invalid value throws, workspace-level throws
      (Req: Startup validation)

## 2. Core — structured result types

- [x] 2.1 Define `ProjectContextEntry` type
      `packages/core/src/application/use-cases/compile-context.ts`: new interface — `{ source: 'instruction' | 'file'; path?: string; content: string }`
      Approach: co-locate with `CompileContextResult`; export from module
      (Req: Structured result assembly)

- [x] 2.2 Define `ContextSpecEntry` and `ContextSpecSource` types
      `packages/core/src/application/use-cases/compile-context.ts`: new types — `ContextSpecSource = 'specIds' | 'specDependsOn' | 'includePattern' | 'dependsOnTraversal'`; `ContextSpecEntry = { specId, title, description, source, mode, content? }`
      Approach: co-locate with result types; export for reuse by GetProjectContext and CLI
      (Req: Structured result assembly, Tier classification)

- [x] 2.3 Define `AvailableStep` type
      `packages/core/src/application/use-cases/compile-context.ts`: new interface — `{ step: string; available: boolean; blockingArtifacts: string[] }`
      Approach: co-locate with result types
      (Req: Structured result assembly)

- [x] 2.4 Update `CompileContextResult` to structured shape
      `packages/core/src/application/use-cases/compile-context.ts`: replace `contextBlock: string` with `projectContext: ProjectContextEntry[]`, `specs: ContextSpecEntry[]`, `availableSteps: AvailableStep[]`
      Approach: remove `contextBlock`; add three new fields; update return type
      (Req: Result shape)

## 3. Core — source tracking during collection

- [x] 3.1 Track spec source through the 5-step pipeline
      `packages/core/src/application/use-cases/compile-context.ts`: `execute()` — maintain a parallel `Map<string, ContextSpecSource>` alongside the existing `includedSpecs` map
      Approach: after step 1-4 pattern matching, tag matched specs as `'includePattern'`; before pattern matching, tag `change.specIds` entries as `'specIds'` and flat values of `change.specDependsOn` as `'specDependsOn'`; after step 5 traversal, tag new discoveries as `'dependsOnTraversal'`. When a spec appears through multiple sources, keep highest-priority: `specIds > specDependsOn > dependsOnTraversal > includePattern`
      (Req: Structured result assembly — source field)

## 4. Core — tier classification

- [x] 4.1 Classify specs into tiers after collection
      `packages/core/src/application/use-cases/compile-context.ts`: `execute()` — after the full collection pipeline, determine `mode` per spec based on `config.contextMode`
      Approach: if `contextMode === 'lazy'`, specs with source `specIds` or `specDependsOn` get `mode: 'full'`; all others get `mode: 'summary'`. If `contextMode` is `'full'` or absent, all specs get `mode: 'full'`
      (Req: Tier classification)

## 5. Core — conditional rendering

- [x] 5.1 Render full-mode specs with content as before
      `packages/core/src/application/use-cases/compile-context.ts`: spec rendering loop — for `mode: 'full'` specs, produce `ContextSpecEntry` with `content` field from metadata or extraction fallback
      Approach: extract existing rendering logic into a helper that produces a `ContextSpecEntry` with all fields populated
      (Req: Structured result assembly, Staleness detection and content fallback)

- [x] 5.2 Render summary-mode specs with title and description only
      `packages/core/src/application/use-cases/compile-context.ts`: spec rendering loop — for `mode: 'summary'` specs, produce `ContextSpecEntry` with `title`, `description`, `specId`, `source`, `mode` but no `content`
      Approach: load metadata for title/description; if metadata absent, extract title from spec heading and use empty description with staleness warning
      (Req: Tier classification, Structured result assembly)

- [x] 5.3 Structure project context entries
      `packages/core/src/application/use-cases/compile-context.ts`: context entry rendering — produce `ProjectContextEntry[]` instead of assembling text
      Approach: for each `config.context` entry, create `{ source: 'instruction' | 'file', path?, content }` instead of concatenating into a string
      (Req: Structured result assembly)

- [x] 5.4 Structure available steps
      `packages/core/src/application/use-cases/compile-context.ts`: step availability — produce `AvailableStep[]` instead of text
      Approach: for each workflow step, create `{ step, available, blockingArtifacts }` object
      (Req: Step availability, Structured result assembly)

## 6. Core — GetProjectContext adaptation

- [x] 6.1 Update `GetProjectContextResult` to use `ContextSpecEntry[]`
      `packages/core/src/application/use-cases/get-project-context.ts`: change `specs` type from `GetProjectContextSpecEntry[]` to `ContextSpecEntry[]`; all entries `mode: 'full'`, `source: 'includePattern'`
      Approach: import `ContextSpecEntry` from compile-context; populate `specId`, `title`, `description` from metadata; keep `content` from existing rendering
      (Req: Returns GetProjectContextResult on success)

- [x] 6.2 Update GetProjectContext tests
      `packages/core/test/application/use-cases/get-project-context.spec.ts`: update assertions to match new `ContextSpecEntry` shape
      Approach: verify `specId`, `mode: 'full'`, `source: 'includePattern'` on all entries
      (Req: Returns GetProjectContextResult on success)

## 7. CLI — change context formatting

- [x] 7.1 Assemble text output from structured result
      `packages/cli/src/commands/change/context.ts`: replace `print(result.contextBlock)` with text assembly from `result.projectContext`, `result.specs`, `result.availableSteps`
      Approach: render project context entries with source labels separated by `---`; render full-mode specs under `### Spec: <specId>` headings; render summary-mode specs in a `## Available context specs` section as a table; render `dependsOnTraversal` summaries under `### Via dependencies` sub-heading; render available steps last
      (Req: Output — cli:cli/change-context)

- [x] 7.2 Update JSON output to structured result
      `packages/cli/src/commands/change/context.ts`: in JSON mode, output `{ projectContext, specs, availableSteps, stepAvailable, blockingArtifacts, warnings }` instead of `{ contextBlock, ... }`
      Approach: pass through structured result directly
      (Req: Output — cli:cli/change-context)

- [x] 7.3 Pass `contextMode` from config to CompileContextConfig
      `packages/cli/src/commands/change/context.ts`: include `config.contextMode` when building `CompileContextConfig`
      Approach: add `contextMode: config.contextMode` to the config object passed to `compile.execute()`
      (Req: Input, Context mode)

## 8. CLI — project context formatting

- [x] 8.1 Adapt to `ContextSpecEntry` shape
      `packages/cli/src/commands/project/context.ts`: update text assembly to use `spec.specId` and `spec.content` instead of `spec.workspace`/`spec.path`/`spec.content`
      Approach: update the text rendering loop; update JSON output to use the new shape
      (Req: Output — cli:cli/project-context)

## 9. Tests — CompileContext

- [x] 9.1 Update existing tests for structured result
      `packages/core/test/application/use-cases/compile-context.spec.ts`: replace all `result.contextBlock` assertions with assertions on `result.projectContext`, `result.specs`, `result.availableSteps`
      Approach: find all `.contextBlock` references; replace with structured field assertions
      (Req: Result shape, Structured result assembly)

- [x] 9.2 Add tier classification tests
      `packages/core/test/application/use-cases/compile-context.spec.ts`: new `describe('tier classification')` block
      Approach: test all 7 scenarios from verify.md — specIds full, specDependsOn full, includePattern summary, dependsOnTraversal summary, dual-source priority, full mode all full, default contextMode
      (Req: Tier classification)

- [x] 9.3 Add source tracking tests
      `packages/core/test/application/use-cases/compile-context.spec.ts`: new `describe('source tracking')` block
      Approach: test source priority — specIds > specDependsOn > dependsOnTraversal > includePattern; verify each source type assigned correctly
      (Req: Structured result assembly — source field)

## 10. CLI tests

- [x] 10.1 Test change context text output with lazy mode
      `packages/cli/test/commands/change/context.spec.ts`: verify catalogue section appears with summary specs
      Approach: mock CompileContext to return mixed full/summary specs; assert text output contains `## Available context specs` with table and `### Via dependencies` sub-heading
      (Req: Output — cli:cli/change-context)

- [x] 10.2 Test change context JSON output structure
      `packages/cli/test/commands/change/context.spec.ts`: verify JSON includes `projectContext`, `specs`, `availableSteps`
      Approach: mock and assert structured output
      (Req: Output — cli:cli/change-context)
