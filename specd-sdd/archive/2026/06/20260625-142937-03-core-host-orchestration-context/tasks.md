# Tasks: 03-core-host-orchestration-context

## 1. Composition helpers

- [x] 1.1 Add `buildCompileContextConfig`
      `packages/core/src/composition/build-compile-context-config.ts`: `buildCompileContextConfig` — map `SpecdConfig` to yaml-stable `CompileContextConfig`
      Approach: port field mapping from current `change/context.ts` builder (projectRoot, configPath, context entries, include/exclude, contextMode, llmOptimizedContext, per-workspace patterns); do not apply CLI effective-mode logic
      (Req: Baked default configuration merge, Construction dependencies)

- [x] 1.2 Add composition unit tests for config builder
      `packages/core/test/composition/build-compile-context-config.spec.ts`: new describe — assert workspace patterns and project-level fields map correctly
      Approach: minimal `SpecdConfig` fixture with one workspace override block
      (Req: Baked default configuration merge)

- [x] 1.3 Add `mergeCompileContextRuntimeOverrides`
      `packages/core/src/application/use-cases/_shared/merge-compile-context-config.ts`: shallow merge helper for `contextMode` and `llmOptimizedContext` only
      Approach: spread defaults then conditionally assign override keys; respect `exactOptionalPropertyTypes`
      (Req: Baked default configuration merge)

- [x] 1.4 Add merge helper unit tests
      `packages/core/test/application/use-cases/_shared/merge-compile-context-config.spec.ts`: override wins; absent overrides preserve baked values
      Approach: two-case table test
      (Req: Baked default configuration merge)

## 2. CompileContext

- [x] 2.1 Extend `CompileContextInput` for runtime overrides
      `packages/core/src/application/use-cases/compile-context.ts`: `CompileContextInput` — remove `config`; add `contextMode?` and `llmOptimizedContext?`
      Approach: update interface and JSDoc only in this task
      (Req: Input)

- [x] 2.2 Store baked default on `CompileContext`
      `packages/core/src/application/use-cases/compile-context.ts`: constructor — add `defaultConfig: CompileContextConfig` parameter as `_defaultConfig`
      Approach: final constructor argument; update `@param` JSDoc
      (Req: Ports and constructor)

- [x] 2.3 Merge config at start of `CompileContext.execute`
      `packages/core/src/application/use-cases/compile-context.ts`: `execute()` — call `mergeCompileContextRuntimeOverrides`; replace `input.config` with merged local
      Approach: merge once at top; no other algorithm changes
      (Req: Baked default configuration merge)

- [x] 2.4 Wire `defaultConfig` in `createCompileContext`
      `packages/core/src/composition/use-cases/compile-context.ts`: `createCompileContext` — call `buildCompileContextConfig` on `SpecdConfig` overload; add `defaultConfig` to `FsCompileContextOptions`; pass to constructor
      Approach: build on outer overload; thread through inner `FsCompileContextOptions` path
      (Req: Ports and constructor)

## 3. GetProjectContext

- [x] 3.1 Extend `GetProjectContextInput` for runtime overrides
      `packages/core/src/application/use-cases/get-project-context.ts`: `GetProjectContextInput` — remove `config`; add `contextMode?` and `llmOptimizedContext?`
      Approach: mirror CompileContext input delta
      (Req: Accepts GetProjectContextInput as input)

- [x] 3.2 Store baked default on `GetProjectContext`
      `packages/core/src/application/use-cases/get-project-context.ts`: constructor — add `defaultConfig: CompileContextConfig` as `_defaultConfig`
      Approach: final constructor argument
      (Req: Construction dependencies)

- [x] 3.3 Merge config at start of `GetProjectContext.execute`
      `packages/core/src/application/use-cases/get-project-context.ts`: `execute()` — merge overrides then use effective config
      Approach: same helper as CompileContext
      (Req: Construction dependencies)

- [x] 3.4 Wire `defaultConfig` in `createGetProjectContext`
      `packages/core/src/composition/use-cases/get-project-context.ts`: bake via `buildCompileContextConfig`; thread `defaultConfig` through `FsGetProjectContextOptions`
      Approach: mirror compile-context factory pattern
      (Req: Construction dependencies)

## 4. CLI thinning

- [x] 4.1 Remove inline config builder from `change context`
      `packages/cli/src/commands/change/context.ts`: action handler — delete `workspacesConfig` / `compileConfig` block
      Approach: keep `effectiveMode` and `llmOptimizedContext` resolution; pass as `contextMode` / `llmOptimizedContext` on `kernel.changes.compile.execute`
      (Req: Behaviour)

- [x] 4.2 Remove inline config builder from `project context`
      `packages/cli/src/commands/project/context.ts`: action handler — delete `compileConfig` block; pass runtime overrides to `getProjectContext.execute`
      Approach: mirror change context forwarding
      (Req: Behaviour)

## 5. Tests

- [x] 5.1 Update `compile-context` unit tests for new constructor/input
      `packages/core/test/application/use-cases/compile-context.spec.ts`: `makeSut` — pass `defaultConfig`; remove `config` from execute calls; add override scenarios
      Approach: spy/mock unchanged; add tests for `contextMode` and `llmOptimizedContext` override
      (Req: Input, Baked default configuration merge)

- [x] 5.2 Update `get-project-context` unit tests
      `packages/core/test/application/use-cases/get-project-context.spec.ts`: constructor + `{}` execute + override scenarios
      Approach: mirror compile-context test updates
      (Req: Accepts GetProjectContextInput as input)

- [x] 5.3 Update CLI change-context tests
      `packages/cli/test/commands/change-context.spec.ts`: assert execute spy does not receive `config`; receives override fields when flags set
      Approach: inspect mock call args
      (Req: Behaviour — CLI does not build CompileContextConfig inline)

- [x] 5.4 Update CLI project-context tests
      `packages/cli/test/commands/project-context.spec.ts`: same spy assertion pattern
      Approach: inspect mock call args for `--mode` and `--no-optimized`
      (Req: Behaviour — CLI does not build CompileContextConfig inline)

## 6. Documentation

- [x] 6.1 Update core docs for context host orchestration
      `docs/core/` — CompileContext / GetProjectContext sections if they document per-call `config`
      Approach: document construction-time default + runtime override fields; note `buildCompileContextConfig` is composition-internal
      (Req: Ports and constructor, Construction dependencies)

## 7. Design revision — scope + verify alignment

- [x] 7.1 Align `cli:change-context` verify delta — section optimization delegated to core (F3)
      `deltas/cli/change-context/verify.md.delta.yaml` — remove CLI wire-format section-flag override scenarios
      Approach: reference `core:compile-context` verify for bypass behaviour
      (Req: Behaviour)

- [x] 7.2 Align `cli:change-context` spec delta — CLI only overrides via `--optimized` / `--no-optimized`
      `deltas/cli/change-context/spec.md.delta.yaml`
      Approach: document delegation to core for section bypass
      (Req: Behaviour)

- [x] 7.3 Align `cli:project-context` spec delta — same delegation pattern
      `deltas/cli/project-context/spec.md.delta.yaml`
      (Req: Behaviour)

- [x] 7.4 Add `cli:project-status` spec delta for baked `GetProjectContext` host pattern
      `deltas/cli/project-status/spec.md.delta.yaml`
      Approach: `--context` uses `execute({})` and `execute({ llmOptimizedContext: false })`; no inline config
      (Req: supports --context flag)

- [x] 7.5 Add `cli:project-status` verify scenarios
      `deltas/cli/project-status/verify.md.delta.yaml`
      Approach: spy assertions on `getProjectContext.execute` call shapes
      (Req: supports --context flag)

- [x] 7.6 Update `project-status` CLI tests for host orchestration
      `packages/cli/test/commands/project-status.spec.ts` — assert no inline config; assert execute call shapes
      Approach: mirror `project-context` spy pattern
      (Req: supports --context flag)

- [x] 7.7 Add core integration tests for runtime override (F1)
      `packages/core/test/application/use-cases/compile-context.spec.ts` — ctor `defaultConfig` + `execute({ contextMode })` without legacy shim
      (Req: Baked default configuration merge)

- [x] 7.8 Add change-context `--optimized` CLI test (F2)
      `packages/cli/test/commands/change-context.spec.ts` — yaml false + `--optimized` → `llmOptimizedContext: true` on execute
      (Req: Behaviour)

- [x] 7.9 Add implementation tracking for `cli:project-status`
      `packages/cli/src/commands/project/status.ts` — link symbols to spec
      (Req: supports --context flag)
