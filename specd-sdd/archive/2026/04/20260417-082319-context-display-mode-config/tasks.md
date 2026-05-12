# Tasks: context-display-mode-config

## 1. Config contract and loader validation

- [x] 1.1 Expand context mode domain in core config types
      `packages/core/src/application/specd-config.ts`: `SpecdConfig.contextMode`, `CompileContextConfig.contextMode` comments/types — replace `'full' | 'lazy'` with `'list' | 'summary' | 'full' | 'hybrid'` and remove lazy-era wording.
      Approach: introduce a shared union (or equivalent inline union) and update JSDoc to document summary default and hybrid semantics consistently.
      (Req: core:core/config / Requirement: Context mode)
- [x] 1.2 Enforce new contextMode values at startup
      `packages/core/src/infrastructure/fs/config-loader.ts`: `SpecdYamlZodSchema.contextMode` — accept only `list|summary|full|hybrid`; reject `lazy`.
      Approach: change zod enum and keep workspace-level strict rejection via existing workspace schema; preserve current `ConfigValidationError` surface.
      (Req: core:core/config / Requirement: Startup validation, scenario: legacy lazy value is rejected)
- [x] 1.3 Update loader tests for accepted/default/rejected contextMode behavior
      `packages/core/test/infrastructure/fs/config-loader.spec.ts`: `contextMode` describe block — replace lazy acceptance assertions with list/summary/full/hybrid acceptance and lazy rejection.
      Approach: align fixtures to new enum and keep explicit workspace-level rejection coverage.
      (Req: core:core/config / Requirement: Context mode + startup validation scenarios)

## 2. CompileContext mode and seeding semantics

- [x] 2.1 Add includeChangeSpecs input and conditional direct spec seeding
      `packages/core/src/application/use-cases/compile-context.ts`: `CompileContextInput`, `execute()` seed block — add `includeChangeSpecs?: boolean` and gate `change.specIds` seeding behind this flag.
      Approach: default to `false`; keep `change.specDependsOn` seeding independent; preserve reinjection via include patterns and traversal.
      (Req: core:core/compile-context / Requirement: Input, Requirement: Context spec collection)
- [x] 2.2 Replace lazy/full tier logic with list/summary/full/hybrid display classification
      `packages/core/src/application/use-cases/compile-context.ts`: mode resolution and `ContextSpecEntry` shaping — support `mode: 'list' | 'summary' | 'full'`.
      Approach: implement mode matrix exactly as deltas define; treat `summary` as default when omitted.
      (Req: core:core/compile-context / Requirement: Context display modes, Requirement: Result shape)
- [x] 2.3 Keep section filters and preview behavior constrained to full entries
      `packages/core/src/application/use-cases/compile-context.ts`: rendering branches for list/summary/full — ensure section flags are ignored for list/summary and preview is used only for eligible full entries.
      Approach: short-circuit list/summary before full rendering path; preserve preview fallback warnings and fingerprint determinism.
      (Req: core:core/compile-context / Requirement: Structured result assembly, Requirement: Materialized delta view)
- [x] 2.4 Update compile-context tests for new modes and include-change-spec scenarios
      `packages/core/test/application/use-cases/compile-context.spec.ts`: mode and seeding describe blocks — replace lazy assumptions with list/summary/full/hybrid and includeChangeSpecs true/false reinjection cases.
      Approach: keep assertions on `mode`, `source`, and presence/absence of `content`; add section-flag no-op assertions in list/summary.
      (Req: core:core/compile-context / verify scenarios for context display modes and includeChangeSpecs)

## 3. Project and spec context use cases

- [x] 3.1 Make GetProjectContext mode-aware
      `packages/core/src/application/use-cases/get-project-context.ts`: `execute()` spec rendering — emit list/summary/full entries according to `contextMode` (hybrid behaves as full).
      Approach: reuse `ContextSpecEntry` shape and keep project `contextEntries` always fully rendered.
      (Req: core:core/get-project-context / Requirement: Returns GetProjectContextResult on success)
- [x] 3.2 Make GetSpecContext mode-aware and keep stale handling shape-correct
      `packages/core/src/application/use-cases/get-spec-context.ts`: input/result entry assembly — add resolved mode to output and apply section filtering only to full mode.
      Approach: add a mode input field or resolved mode parameter from caller; keep stale warnings and dependency traversal behavior unchanged.
      (Req: core:core/get-spec-context / Requirement: Build context entry from metadata, Requirement: Section filtering)
- [x] 3.3 Update use-case tests for project/spec mode behavior
      `packages/core/test/application/use-cases/get-project-context.spec.ts`, `packages/core/test/application/use-cases/get-spec-context.spec.ts`: mode-specific assertions and section-filter scope.
      Approach: add list/summary/full/hybrid fixtures and verify field presence by mode.
      (Req: core:core/get-project-context + core:core/get-spec-context verify scenarios)

## 4. CLI context commands

- [x] 4.1 Add and wire `--include-change-specs` in change context command
      `packages/cli/src/commands/change/context.ts`: command options and use-case call payload — pass `includeChangeSpecs` as `false` by default and `true` when flag is present.
      Approach: preserve existing `--follow-deps`, `--depth`, and `--fingerprint` validation behavior.
      (Req: cli:cli/change-context / Requirement: Command signature, Requirement: Behaviour)
- [x] 4.2 Render explicit list/summary/full output blocks and spec-preview guidance
      `packages/cli/src/commands/change/context.ts`: text renderer for specs — print mode label per entry and include guidance to `specd change spec-preview <change-name> <specId>` for non-full entries.
      Approach: separate full and non-full rendering paths; keep dependency-traversal subgroup separation in non-full catalogue.
      (Req: cli:cli/change-context / Requirement: Output, Requirement: Constraints)
- [x] 4.3 Propagate contextMode and mode-shaped rendering for project/spec commands
      `packages/cli/src/commands/project/context.ts`, `packages/cli/src/commands/spec/context.ts`: pass mode from loaded config and render mode-aware text/json output.
      Approach: include explicit mode labels in text output and keep list/summary field omission in json/toon mode.
      (Req: cli:cli/project-context + cli:cli/spec-context / Requirement: Behaviour, Requirement: Output)
- [x] 4.4 Update CLI command tests for new mode contracts
      `packages/cli/test/commands/change-context.spec.ts`, `packages/cli/test/commands/project-context.spec.ts`, `packages/cli/test/commands/spec-context.spec.ts`: replace lazy-era expectations and add include-change-specs + mode-label assertions.
      Approach: validate payload forwarding to use cases and verify rendered stdout/stderr strings for each mode family.
      (Req: cli:cli/change-context + cli:cli/project-context + cli:cli/spec-context verify scenarios)

## 5. Documentation and verification

- [x] 5.1 Update user-facing docs for context modes and CLI behavior
      `docs/config/config-reference.md`, `docs/cli/cli-reference.md`, `docs/guide/_sections/getting-started/context-compilation.md`: remove `lazy`, document `list|summary|full|hybrid`, add `--include-change-specs`, and non-full `spec-preview` guidance.
      Approach: align docs language with final CLI flags and output semantics; include migration note from `lazy` to `hybrid/summary/full/list`.
      (Req: default:\_global/docs, core:core/config, cli:cli/change-context)
- [x] 5.2 Execute regression test suites for touched context surfaces
      `packages/core` and `packages/cli` tests: run focused command/use-case specs plus full package tests if needed.
      Approach: run at minimum `compile-context`, `get-project-context`, `get-spec-context`, `config-loader`, and three CLI context command test files before marking implementation done.
      (Req: default:\_global/testing; all modified spec verify scenarios)
- [x] 5.3 Perform manual command verification on all three context commands
      CLI runtime checks using built binary: `change context`, `project context`, `spec context`, and `change spec-preview`.
      Approach: validate mode labels, section-filter behavior, include-change-specs semantics, and non-full preview guidance in text output.
      (Req: cli context command output scenarios and end-to-end behavior)
