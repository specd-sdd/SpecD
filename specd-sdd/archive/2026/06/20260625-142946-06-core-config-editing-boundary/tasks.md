# Tasks: 06-core-config-editing-boundary

## 1. Composition factory

- [x] 1.1 Add `createConfigWriter` factory module
      `packages/core/src/composition/config-writer.ts`: `createConfigWriter`, `FsConfigWriterOptions` — new file mirroring `config-loader.ts`
      Approach: default branch returns `new FsConfigWriter()`; options branch returns injected `configWriter`
      (Req: ConfigWriter is an application port)

- [x] 1.2 Export factory from composition barrel
      `packages/core/src/composition/index.ts`: exports — add `createConfigWriter`, `FsConfigWriterOptions`
      Approach: named exports only; no `FsConfigWriter` export
      (Req: ConfigWriter is an application port)

- [x] 1.3 Add composition smoke test
      `packages/core/test/composition/config-writer.spec.ts`: new spec — factory returns object with `initProject`, `addPlugin`, `removePlugin`
      Approach: call `createConfigWriter()` without options; assert typeof each method is `function`
      (Req: createConfigWriter returns FsConfigWriter by default)

## 2. CLI migration

- [x] 2.1 Migrate project init to `createConfigWriter`
      `packages/cli/src/commands/project/init.ts`: `registerProjectInit`, `runInteractiveInit` — replace `createInitProject()` + `execute()` with `createConfigWriter().initProject(options)`
      Approach: build same `InitProjectOptions` object; single `await writer.initProject(...)` call
      (Req: Delegation to ConfigWriter)

- [x] 2.2 Migrate plugins install persistence
      `packages/cli/src/commands/plugins/install.ts`: install handler — replace `kernel.project.addPlugin.execute` with `createConfigWriter().addPlugin(configPath, type, name, config)`
      Approach: call writer after `InstallPlugin` succeeds; keep kernel only if still required for earlier steps
      (Req: Installation workflow)

- [x] 2.3 Migrate plugins uninstall persistence
      `packages/cli/src/commands/plugins/uninstall.ts`: uninstall handler — replace `kernel.project.removePlugin.execute` with `createConfigWriter().removePlugin(configPath, type, name)`
      Approach: call writer after plugin `uninstall()` hook succeeds
      (Req: Uninstall workflow)

## 3. Kernel slimming

- [x] 3.1 Remove config mutation from Kernel interface
      `packages/core/src/composition/kernel.ts`: `Kernel.project` — delete `init`, `addPlugin`, `removePlugin` properties and related imports/types
      Approach: remove `InitProject`, `AddPlugin`, `RemovePlugin` from interface and `createKernel` return literal
      (Req: Config mutation is not a kernel use case)

- [x] 3.2 Remove configWriter from kernel internals
      `packages/core/src/composition/kernel-internals.ts`: `KernelInternals`, `createKernelInternals` — drop `configWriter` field and `new FsConfigWriter()` construction
      Approach: delete field; remove any references in `createKernel` wiring
      (Req: Config mutation is not wired into createKernel)

## 4. Delete pass-through use cases

- [x] 4.1 Delete application use case files
      `packages/core/src/application/use-cases/{init-project,add-plugin,remove-plugin}.ts` — remove files
      Approach: delete all three; remove exports from `application/use-cases/index.ts`
      (Req: InitProject use case removed)

- [x] 4.2 Delete composition use case factories
      `packages/core/src/composition/use-cases/{init-project,add-plugin,remove-plugin}.ts` — remove files
      Approach: delete all three; remove exports from `composition/use-cases/index.ts`
      (Req: ConfigWriter is an application port)

- [x] 4.3 Delete application use case unit tests
      `packages/core/test/application/use-cases/{init-project,add-plugin,remove-plugin}.spec.ts` — remove files
      Approach: delete; behaviour covered by `config-writer.spec.ts` integration tests
      (Req: Delivery access via createConfigWriter)

## 5. Tests

- [x] 5.1 Update project-init CLI tests
      `packages/cli/test/commands/project-init.spec.ts`: mocks — replace `createInitProject` mock with `createConfigWriter` returning `{ initProject: vi.fn() }`
      Approach: `vi.mock('@specd/core')` or partial mock; assert `initProject` called with expected options
      (Req: Init uses createConfigWriter not InitProject use case)

- [x] 5.2 Update plugins CLI tests
      `packages/cli/test/commands/plugins.spec.ts`: install/uninstall tests — mock `createConfigWriter`; assert `addPlugin`/`removePlugin`; remove `kernel.project.addPlugin` expectations
      Approach: shared mock writer in test setup; verify not called on kernel.project
      (Req: Installation workflow, Uninstall workflow)

- [x] 5.3 Update kernel composition tests
      `packages/core/test/composition/kernel-get-config.spec.ts`: kernel shape assertions — ensure `project` has no `init`, `addPlugin`, `removePlugin`
      Approach: `expect(kernel.project).not.toHaveProperty('addPlugin')` etc.
      (Req: kernel.project does not expose config mutation entries)

- [x] 5.4 Update entrypoint test if needed
      `packages/cli/test/entrypoint.spec.ts`: `setupDashboard` — replace any `createInitProject` mock with `createConfigWriter`
      Approach: grep file; update only if references exist
      (Req: Delegation to ConfigWriter)

## 6. Cleanup and docs

- [x] 6.1 Grep for removed symbols
      repository-wide: `createInitProject`, `createAddPlugin`, `createRemovePlugin`, `kernel.project.init`, `kernel.project.addPlugin`, `kernel.project.removePlugin`
      Approach: zero hits outside changelog/archive; fix any stragglers
      (Req: InitProject use case is not exported)

- [x] 6.2 Update core documentation
      `docs/core/`: kernel and composition docs — document `createConfigWriter`; remove kernel `project.init`/`addPlugin`/`removePlugin` references
      Approach: mirror `createConfigLoader` documentation pattern
      (Req: Delivery access via createConfigWriter)

- [x] 6.3 Build and run affected test suites
      `packages/core`, `packages/cli`: test + build
      Approach: `pnpm --filter @specd/core test` and `pnpm --filter @specd/cli test`; fix failures
      (Req: all verify scenarios)

## 7. Manual verification

- [x] 7.1 Smoke test init and plugins commands
      CLI manual: `project init`, `plugins install`, `plugins uninstall`
      Approach: run commands from design.md Manual section; confirm `specd.yaml` mutations without kernel errors
      (Req: Delegation to ConfigWriter, Installation workflow, Uninstall workflow)
