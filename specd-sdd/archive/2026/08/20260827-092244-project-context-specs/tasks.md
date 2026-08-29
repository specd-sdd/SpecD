# Tasks: project-context-specs

## 1. Shared helper & CompileContext migration (done in fast-track)

- [x] 1.1 Add `resolveConfiguredContextSpecs` helper
      `packages/core/src/application/use-cases/_shared/resolve-configured-context-specs.ts`:
      `resolveConfiguredContextSpecs`, `ConfiguredContextSpecCollector`, `ConfiguredContextSpecOperationListener` — content-free ordered include/exclude
      Approach: project include → project exclude → active workspace include → active workspace exclude via `listMatchingSpecs`; collector without source args; optional `onOperation` for provenance; empty `activeWorkspaces` skips workspace steps
      (Req: Shared configured-context helper)

- [x] 1.2 Migrate CompileContext steps 1–4 onto the helper
      `packages/core/src/application/use-cases/compile-context.ts`: `CompileContext`
      Approach: wire collector with protect-on-exclude; empty project pattern arrays when optimized project context preferred; keep seeding and `followDeps` outside the helper
      (Req: Context spec collection — CompileContext)

## 2. ResolveContextSpecs use case (done in fast-track)

- [x] 2.1 Implement `ResolveContextSpecs` with partitioned result
      `packages/core/src/application/use-cases/resolve-context-specs.ts`:
      `ResolveContextSpecs`, `ResolveContextSpecsInput`, `ResolveContextSpecsResult`
      Approach: effective-set collector + `onOperation` provenance; dual listing; `workspaces` filter; `workspacesOnly`; unknown workspace errors
      (Req: Accepts ResolveContextSpecsInput; Returns ResolveContextSpecsResult; Dual listing; Workspace filter; workspacesOnly)

- [x] 2.2 Composition factory for ResolveContextSpecs
      `packages/core/src/composition/use-cases/resolve-context-specs.ts`:
      `createResolveContextSpecs`, `resolveResolveContextSpecsDeps`, `ResolveContextSpecsDeps`
      Approach: dual factory via `normalizeCompositionFactoryArgs`; deps = `listWorkspaces` + `getCompileContextConfig()`
      (Req: Construction and composition)

- [x] 2.3 Mount on kernel project slice
      `packages/core/src/composition/kernel.ts`: `createKernel` / `Kernel.project.resolveContextSpecs`
      Approach: `createResolveContextSpecs(resolveResolveContextSpecsDeps(resolver))`
      (Req: Construction and composition)

- [x] 2.4 Export from Core public barrels
      `packages/core/src/application/use-cases/index.ts`, `packages/core/src/composition/use-cases/index.ts`, `packages/core/src/public.ts`
      Approach: export class, input/result types, factory, and deps type
      (Req: Public surface)

- [x] 2.5 Re-export from SDK core-reexports only
      `packages/sdk/src/core-reexports.ts`: `ResolveContextSpecs`, types, `createResolveContextSpecs`
      Approach: no orchestration wrapper; types/class/factory only
      (Req: Public surface)

## 3. CLI command (done in fast-track)

- [x] 3.1 Implement `project context-specs` command
      `packages/cli/src/commands/project/context-specs.ts`:
      `registerProjectContextSpecs`, `formatContextSpecsText`
      Approach: repeatable `--workspace` via `collect`; `--workspaces-only`; text nesting; json/toon raw result; `resolveCliContext` → `kernel.project.resolveContextSpecs.execute`
      (Req: Command signature; Host wiring; Output shape; Errors; Relationship to project context)

- [x] 3.2 Register command on project group
      `packages/cli/src/index.ts`: project command registration
      Approach: call `registerProjectContextSpecs` immediately after `registerProjectContext`
      (Req: Command signature)

## 4. Docs (done in fast-track)

- [x] 4.1 Document CLI command
      `docs/cli/cli-reference.md`, `docs/cli/project-context-specs.md`
      Approach: signature, repeatable `--workspace`, `--workspaces-only`, output shape, related Core path
      (Req: Command signature; Output shape)

- [x] 4.2 Document Core use case and guide note
      `docs/core/use-cases.md`, `docs/guide/_sections/getting-started/context-compilation.md`
      Approach: ResolveContextSpecs section; ID-only discovery note next to context compilation
      (Req: Returns ResolveContextSpecsResult)

- [x] 4.3 Align SDK docs after dropping orchestration wrapper
      `docs/sdk/index.md`, `packages/sdk/src/orchestration/index.ts`, `packages/sdk/src/index.ts`
      Approach: remove `resolveProjectContextSpecs` export/docs; map CLI to `kernel.project.resolveContextSpecs`
      (Req: Public surface; Host wiring)

## 5. GetProjectContext helper adoption (in scope)

- [x] 5.1 Migrate GetProjectContext project include/exclude to shared helper
      `packages/core/src/application/use-cases/get-project-context.ts`: `GetProjectContext.execute`
      Approach: replace inline `listMatchingSpecs` project include/exclude loops with `resolveConfiguredContextSpecs({ config, activeWorkspaces: new Set(), workspaceMap, warnings, collector })`; keep followDeps/render/optimization unchanged; delete unused `projectExcludedKeysFrom` if orphaned
      (Req: Applies project-level include/exclude patterns; Does not apply workspace-level patterns)

- [x] 5.2 Regression + helper-usage coverage for GetProjectContext
      `packages/core/test/application/use-cases/get-project-context.spec.ts`
      Approach: ensure existing include/exclude/workspace-ignore scenarios stay green; add assertion or focused test that collection goes through the shared helper with empty active set
      (Req: Applies project-level include/exclude patterns; Does not apply workspace-level patterns)

## 6. Remaining tests & mocks

- [x] 6.1 Unit tests for ResolveContextSpecs edge cases
      `packages/core/test/application/use-cases/resolve-context-specs.spec.ts`
      Approach: extend coverage for empty/omitted workspaces, multi-unknown error text, exclude clearing dual listing, workspacesOnly empties `project`, active keys with empty arrays, empty-activeWorkspaces helper scenario
      (Req: Dual listing; Workspace filter; workspacesOnly; Shared configured-context helper)

- [x] 6.2 Parity tests helper vs CompileContext ID sets
      `packages/core/test/application/use-cases/` (new or extend compile-context / resolve-context-specs specs)
      Approach: same fixtures for project+workspace include/exclude; assert ResolveContextSpecs effective IDs match CompileContext collected IDs for steps 1–4 (ignore content/rendering)
      (Req: Shared configured-context helper; Context spec collection)

- [x] 6.3 Add kernel assembly mapping for resolveContextSpecs
      `packages/core/test/barrel-kernel-coverage.spec.ts`: `KERNEL_ASSEMBLY_EXPORTS`
      Approach: map `project.resolveContextSpecs` → `createResolveContextSpecs`
      (Req: Construction and composition)

- [x] 6.4 Extend CLI mock kernel with resolveContextSpecs
      `packages/cli/test/commands/helpers.ts`: `makeMockKernel`
      Approach: add `project.resolveContextSpecs.execute` mock; update entrypoint stubs if they enumerate project mounts
      (Req: Host wiring)

- [x] 6.5 CLI tests for project context-specs
      `packages/cli/test/commands/` (new `project-context-specs` suite or extend project tests)
      Approach: text sections / omit project with `--workspaces-only`; toon keeps `project: []`; repeatable `--workspace`; unknown workspace failure; excess positional rejected
      (Req: Command signature; Output shape; Errors)

## 7. Compliance follow-up (typed errors + stronger tests)

- [x] 7.1 Throw InvalidInputError for unknown workspaces
      `packages/core/src/application/use-cases/resolve-context-specs.ts`: `ResolveContextSpecs.execute`
      Approach: replace `throw new Error(...)` with `throw new InvalidInputError(...)` keeping the same single/multi message text; import from domain errors
      (Req: Workspace filter and unknown names)

- [x] 7.2 Assert InvalidInputError in ResolveContextSpecs unit tests
      `packages/core/test/application/use-cases/resolve-context-specs.spec.ts`
      Approach: `rejects.toBeInstanceOf(InvalidInputError)` plus `code === 'INVALID_INPUT'` and exact messages for one and many unknowns
      (Req: Workspace filter and unknown names)

- [x] 7.3 CLI unknown-workspace expects SpecdError exit 1
      `packages/cli/test/commands/project-context-specs.spec.ts`
      Approach: `mockRejectedValue(new InvalidInputError("Unknown workspace 'missing'"))`; expect `ExitSentinel`, `process.exit(1)`, stderr `/error:/` (not fatal/exit 3)
      (Req: Errors)

- [x] 7.4 Add dedicated helper unit tests
      `packages/core/test/application/use-cases/resolve-configured-context-specs.spec.ts` (new)
      Approach: assert project include→exclude then workspace include→exclude order via collector call sequence; empty `activeWorkspaces` skips workspace patterns; inactive workspace ignored
      (Req: Shared configured-context helper)
