# Tasks: 13-public-api-surface

## 1. @specd/core public barrels

- [x] 1.1 Create `packages/core/src/public.ts` with kernel-equivalent exports
      `packages/core/src/public.ts`: new — bootstrap; every kernel-mounted use-case type + I/O + `createX`; `createSpecRepository`, `createChangeRepository`, `createArchiveRepository`, `createSchemaRepository`, `createSchemaRegistry` + option types; domain/errors; no concrete adapters
      Approach: re-export from `composition/use-cases/index.ts` and repository modules; explicit list, no `export *`
      (Req: Kernel-mounted use case surface, Repository factories on public root)

- [x] 1.2 Create `packages/core/src/ports.ts`
      `packages/core/src/ports.ts`: new — port interfaces/abstract classes; no `Fs*` implementations
      Approach: thin re-export module
      (Req: Internal ports are never exported — contracts on ./ports)

- [x] 1.3 Create `packages/core/src/extensions.ts`
      `packages/core/src/extensions.ts`: new — `*StorageFactory`, registry types, `KernelBuilder`, providers; no `FS_*` markers
      Approach: re-export from composition registry modules
      (Req: Extension registration surface)

- [x] 1.4 Retarget `packages/core/src/index.ts` to internal barrel
      `packages/core/src/index.ts`: full `export *` + infra symbols (`GitVcsAdapter`, `Fs*`, `kernel-internals` exports)
      Approach: mapped to `"./internal"` only
      (Req: Public barrel entry points — ./internal)

- [x] 1.5 Update core `package.json` exports and build
      `packages/core/package.json`: `"."`, `"./ports"`, `"./extensions"`, `"./internal"`; tsup all four entries
      Approach: `"."` → `dist/public.js`
      (Req: Public barrel entry points)

- [x] 1.6 Add core barrel tests
      `packages/core/test/barrel.spec.ts`: new — `FsSpecRepository` absent; `createGetStatus`, `createArchiveChange`, `createSpecRepository` present; `createGetStatus(config).execute` works without kernel; subpath tests
      Approach: vitest
      (Req: verify scenarios for core:composition)

- [x] 1.7 Sweep monorepo imports for removed infra symbols only
      `packages/**`: retarget `Fs*`, `GitVcsAdapter`, `kernel-internals` imports to `@specd/core/internal`
      Approach: grep concrete adapter classes; do NOT retarget `createX` / `create*Repository`
      (Req: Curated public package entry points)

## 2. @specd/code-graph public barrels

- [x] 2.1 Create `packages/code-graph/src/public.ts`
      `packages/code-graph/src/public.ts`: new — curated list per code-graph:composition Package exports
      Approach: explicit exports minus internal-only symbols
      (Req: Public and internal entry points)

- [x] 2.2 Retarget `packages/code-graph/src/index.ts` to internal barrel
      `packages/code-graph/src/index.ts`: full barrel including `InMemoryIndexSession`, store adapters
      Approach: `"./internal"` entry
      (Req: Public and internal entry points)

- [x] 2.3 Update code-graph `package.json` exports and build
      `packages/code-graph/package.json`: `"."` + `"./internal"`; tsup multi-entry
      (Req: Public and internal entry points)

- [x] 2.4 Extend code-graph barrel tests
      `packages/code-graph/test/barrel.spec.ts`: internal-only negative tests
      (Req: verify InMemoryIndexSession only on internal)

- [x] 2.5 Sweep code-graph test imports to internal
      `packages/code-graph/test/**`: `InMemoryIndexSession` and adapter imports → `@specd/code-graph/internal`
      (Req: Package exports constraints)

## 3. @specd/sdk explicit barrels

- [x] 3.1 Remove `export * from '@specd/core'` from SDK index
      `packages/sdk/src/index.ts`: explicit re-exports including kernel-equivalent factories from core `"."`
      Approach: maintain CLI 78-symbol floor + `createGetStatus`, `createSpecRepository`, etc.
      (Req: Public barrel exports)

- [x] 3.2 Add SDK subpath modules
      `packages/sdk/src/ports.ts`, `packages/sdk/src/extensions.ts`
      (Req: SDK package.json exports)

- [x] 3.3 Update SDK `package.json` exports and build
      (Req: Public barrel exports)

- [x] 3.4 Extend SDK barrel tests
      `packages/sdk/test/barrel.spec.ts`: no `export *`; `createGetStatus`, `createSpecRepository` from SDK; subpath smoke tests
      (Req: verify SDK scenarios)

## 4. Documentation

- [x] 4.1 Create `docs/sdk/` integrator section
      Single-import rule; all host examples from `@specd/sdk`; migrate from `docs/core/sdk.md`
      (Req: SDK documentation)

- [x] 4.2 Add host callouts on package-reference indexes
      `docs/core/index.md`, `docs/code-graph/index.md` → point to `docs/sdk/`
      (Req: Core documentation, SDK documentation)

- [x] 4.3 Relabel Docusaurus sidebar
      SDK = integrators; Core / Code graph = package reference (position after SDK)
      (Req: SDK documentation)

- [x] 4.4 Sweep `docs/core/*` for audience labels
      `@specd/core` examples labeled plugin/core-only; no host mixed-import guidance
      (Req: Core documentation, verify scenarios)

## 5. Public web / API reference

- [x] 5.1 Document sdk, core, and code-graph public barrels
      `apps/public-web/src/lib/public-docs-config.ts` — `apiPackageEntryPoints` in integrator-first order
      (Req: Initial API coverage)

- [x] 5.2 Generate one TypeDoc tree per package
      `apps/public-web/scripts/generate-api-docs.mjs` — `.generated/api/sdk`, `core`, `code-graph`
      (Req: Initial API coverage)

- [x] 5.3 Group API sidebar by package then symbol kind
      `apps/public-web/api-sidebars.ts`
      (Req: Initial API coverage)

- [x] 5.4 Resolve TypeDoc through source barrels
      `apps/public-web/tsconfig.typedoc.json` path aliases to `public.ts`
      (Req: Generated API content)

- [x] 5.5 Sanitize inherited node_modules members and MDX braces
      `apps/public-web/scripts/generate-api-docs.mjs`
      (Req: Public-site integration)

- [x] 5.6 Pin TypeDoc source links to `main`
      `apps/public-web/typedoc.json` — `gitRevision: main`
      (Req: Public-site integration)

- [x] 5.7 Update public-web API generation tests
      `apps/public-web/test/lib/api-generation.spec.ts`, `public-docs-config.spec.ts`, `sidebar-config.spec.ts`
      (Req: verify TypeDoc entry points)

## 6. Compile gate and audit

- [x] 6.1 Run package test suites
      `pnpm --filter @specd/core test`, code-graph, sdk, cli, public-web
      (Req: CLI compile gate)

- [x] 6.2 Add Kernel-vs-public export audit test
      `packages/core/test/barrel-kernel-coverage.spec.ts`: every `Kernel` mount has type + `createX` or repo factory on `public.ts`
      (Req: Kernel-equivalent assembly)

- [x] 6.3 Verify CLI package.json sdk-only deps
      (Req: Import policy)
