# Spec Compliance Audit — `@specd/core` (architecture + composition)

**Change:** `13-public-api-surface`  
**Report:** `20260630-103825/_partial-core-architecture.md`  
**Specs audited (merged previews):** `default:_global/architecture`, `core:composition`  
**Implementation scope:** `packages/core` — `src/public.ts`, `src/ports.ts`, `src/extensions.ts`, `src/index.ts`, `package.json`, composition layer  
**Tests reviewed:** `test/barrel.spec.ts`, `test/barrel-kernel-coverage.spec.ts`

---

## Executive summary

The public API surface split is **largely implemented** and **barrel tests pass (8/8)**. The four `package.json` export entry points (`"."`, `"./ports"`, `"./extensions"`, `"./internal"`) are correctly mapped. Concrete filesystem/VCS adapters are absent from the public root and `./ports`; extension registration types and `createKernelBuilder` live on `./extensions`; the full monorepo barrel remains on `./internal`.

**Gaps (partial/missing):**

1. **14 kernel-mounted use cases** are reachable without `createKernel` only via **exported class constructors**, not `createX` factories — contradicts both `core:composition` requirements and the architecture constraint that every kernel capability must have a public factory path.
2. **`createResolveSchema` is not a public export**; `ResolveSchema` is wired only inside `createGetActiveSchema` / `createKernel`. Verify scenario expects `kernel.specs.resolve`, which does not exist on `Kernel`.
3. **Repository factory adapter ids** are typed as literal `'fs'` only (extensible `string` id + registry dispatch deferred per spec note, but signature is not yet extensible).
4. **`FsSchemaRepositoryOptions` / `SchemaRepositoryConfig`** not re-exported on `"."` (other repo option types are).
5. **`core:composition` verify.md drift:** two scenarios contradict merged `spec.md` (repository factories absent; use-case constructors absent).

**Out of scope (not audited in depth):** layered import enforcement, domain purity, YAML boundary validation, rich-entity/value-object patterns — pre-existing structural constraints assumed intact unless contradicted by public exports.

---

## Requirement matrix

| Requirement                                                             | Status                       | Evidence                                                                                                                                         | Tests                                                     | Notes                                                             |
| ----------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------- |
| **Architecture: Curated public package entry points**                   | **implemented**              | `packages/core/package.json` exports `.`, `./ports`, `./extensions`, `./internal`                                                                | `barrel.spec.ts`                                          | Maps to `dist/public.js`, `ports.js`, `extensions.js`, `index.js` |
| **Architecture: `"."` must not export concrete adapters**               | **implemented**              | `src/public.ts` — no `Fs*` / `Git*` adapter classes                                                                                              | `barrel.spec.ts` L19–23                                   | `FsSpecRepository`, `FsConfigLoader`, `GitVcsAdapter` absent      |
| **Architecture: `"./ports"` exports port contracts only**               | **implemented**              | `src/ports.ts` — abstract `Repository`, `SpecRepository`, etc.                                                                                   | `barrel.spec.ts` L44–48                                   | No `FsSpecRepository` on ports                                    |
| **Architecture: `"./extensions"` for registry types**                   | **implemented**              | `src/extensions.ts` — `*StorageFactory`, `createKernelBuilder`, `RegistryConflictError`                                                          | `barrel.spec.ts` L50–54                                   | `BUILTIN_ACTOR_PROVIDERS` correctly absent                        |
| **Architecture: `"./internal"` full dev barrel**                        | **implemented**              | `src/index.ts` re-exports domain/application/composition                                                                                         | —                                                         | Composition index exports concrete adapters (internal only)       |
| **Architecture: Repository factories on `"."`**                         | **implemented**              | `public.ts` L9–25 — `createSpec/Change/Archive/SchemaRepository`, `createSchemaRegistry`                                                         | `barrel.spec.ts` L25–31, `barrel-kernel-coverage` L96–101 | All five factories present                                        |
| **Architecture: Kernel-equivalent `createX` for every kernel use case** | **partial**                  | 33/47 kernel mounts have `createX`; 14 export **class** only (see §Gaps)                                                                         | `barrel-kernel-coverage` passes by accepting classes      | **Code bug vs spec**; test codifies weaker bar                    |
| **Architecture: `createKernel` recommended, not exclusive**             | **implemented**              | Standalone factories + repo factories work without kernel                                                                                        | `barrel.spec.ts` L34–42                                   |                                                                   |
| **Architecture: Config mutation not on kernel**                         | **implemented**              | `kernel.ts` — no `configWriter`, no `init`/`addPlugin`/`removePlugin` on `project`                                                               | —                                                         | `createConfigWriter()` separate                                   |
| **Architecture: Composition only layer importing infrastructure**       | **implemented** (structural) | `composition/` imports `infrastructure/`; `public.ts` does not                                                                                   | —                                                         | Not re-verified via compiler in this audit                        |
| **Composition: Use-case factories are unit of composition**             | **partial**                  | Most use cases have `createX` in `composition/use-cases/`                                                                                        | —                                                         | 14 mounts lack factories; classes exported on `"."`               |
| **Composition: Use-case constructors not on public barrel**             | **missing**                  | `public.ts` L194–217 exports `InvalidateChange`, `RunStepHooks`, etc.                                                                            | Test accepts classes                                      | **Contradicts spec**; verify.md scenario also wrong post-merge    |
| **Composition: Dual factory signatures (config \| context+options)**    | **implemented**              | e.g. `createArchiveChange`, `createGetStatus` overloads                                                                                          | —                                                         | Spot-checked across `composition/use-cases/`                      |
| **Composition: Config I/O factories return ports**                      | **implemented**              | `config-loader.ts`, `config-writer.ts` return `ConfigLoader`/`ConfigWriter`                                                                      | —                                                         | No pass-through use-case wrappers                                 |
| **Composition: `createConfigWriter()` + injected writer**               | **implemented**              | `config-writer.ts` L15–30                                                                                                                        | —                                                         | Both signatures                                                   |
| **Composition: `createConfigLoader()`**                                 | **partial**                  | `createConfigLoader(options: FsConfigLoaderOptions)` — **requires** options                                                                      | —                                                         | Architecture text implies zero-arg; no overload                   |
| **Composition: VCS auto-detect in standalone factories**                | **implemented**              | `composition/use-cases/` use `createVcsActorResolver`; no direct `GitActorResolver` imports                                                      | —                                                         | Grep clean                                                        |
| **Composition: Kernel grouped by domain area**                          | **implemented**              | `kernel.ts` `Kernel` interface — `changes`, `specs`, `project`                                                                                   | —                                                         | Approval gates on `changes` ✓                                     |
| **Composition: Kernel builder public**                                  | **implemented**              | `extensions.ts` exports `createKernelBuilder`, `KernelBuilder`                                                                                   | `barrel.spec.ts` L51; `kernel-builder.spec.ts`            | On `./extensions`, not `"."` (matches spec)                       |
| **Composition: `FsChangeRepositoryOptions` artifact resolution**        | **implemented**              | `change-repository.ts` L35–40, L81–83                                                                                                            | —                                                         | `artifactTypes` + `resolveArtifactTypes`                          |
| **Composition: `createResolveSchema` factory**                          | **missing**                  | No `createResolveSchema` symbol; inline `new ResolveSchema(...)` in `get-active-schema.ts` L82–87, `kernel.ts` L171–176                          | —                                                         | Type `ResolveSchema` exported; factory not                        |
| **Composition: `kernel.specs.resolve`**                                 | **missing**                  | `Kernel.specs` has no `resolve` key (`kernel.ts` L340–354)                                                                                       | —                                                         | Verify scenario expects `kernel.specs.resolve`                    |
| **Composition: `createGetActiveSchema` wires ResolveSchema**            | **implemented**              | `get-active-schema.ts` constructs `ResolveSchema` internally                                                                                     | —                                                         | Satisfies wiring intent, not factory-export intent                |
| **Composition: Public barrel entry points (files)**                     | **implemented**              | `public.ts`, `ports.ts`, `extensions.ts`, `index.ts`; no `export *` from domain/application/composition on `"."`                                 | `barrel.spec.ts`                                          | Curated named exports only                                        |
| **Composition: Kernel-mounted types + I/O types on `"."`**              | **implemented**              | `public.ts` large type export block L47–191                                                                                                      | —                                                         | Broad coverage                                                    |
| **Composition: Port types on `"."` for Kernel typing**                  | **implemented**              | `public.ts` L45 — `ChangeRepository`, `SpecRepository`, `SchemaRegistry`                                                                         | —                                                         |                                                                   |
| **Composition: Repository option types on `"."`**                       | **partial**                  | `FsSpec/Change/ArchiveRepositoryOptions`, `FsSchemaRegistryOptions` exported; **`FsSchemaRepositoryOptions` / `SchemaRepositoryConfig` missing** | —                                                         |                                                                   |
| **Composition: Repository adapter id extensibility**                    | **partial**                  | Factories take `type: 'fs'` literal (`spec-repository.ts` L38)                                                                                   | —                                                         | Spec allows deferred dispatch; signature not `string` yet         |
| **Composition: Extension registration surface**                         | **implemented**              | `extensions.ts` — all required types incl. `GraphStoreFactory`                                                                                   | `barrel.spec.ts`                                          | Builtin `FS_*` markers stay internal                              |
| **Composition: `@specd/sdk` host bootstrap (cross-package)**            | **implemented** (adjacent)   | `packages/sdk` re-exports `./ports`, `./extensions`; CLI/MCP depend only on `@specd/sdk`                                                         | —                                                         | Outside `core` but satisfies spec dependency                      |
| **Architecture: SDK re-exports core ports/extensions**                  | **implemented**              | `packages/sdk/src/ports.ts`, `extensions.ts` — `export * from '@specd/core/...'`                                                                 | —                                                         |                                                                   |

---

## Detailed findings

### A. Public barrel entry points — **implemented**

`packages/core/package.json`:

```json
".": "./dist/public.js",
"./ports": "./dist/ports.js",
"./extensions": "./dist/extensions.js",
"./internal": "./dist/index.js"
```

`src/public.ts` uses explicit named exports (no `export *` from `domain/`, `application/`, or `composition/`). `src/index.ts` remains the full internal barrel via `export *` from all layers.

### B. Adapter concealment — **implemented**

| Surface                               | Concrete adapters                                | Status            |
| ------------------------------------- | ------------------------------------------------ | ----------------- |
| `"."` (`public.ts`)                   | None                                             | ✓                 |
| `./ports`                             | None                                             | ✓                 |
| `./extensions`                        | None                                             | ✓                 |
| `./internal` (`composition/index.ts`) | `GitVcsAdapter`, `Fs*`, `Node*`, actor resolvers | ✓ (internal only) |

### C. Repository factories on public root — **implemented**

Exported: `createSpecRepository`, `createChangeRepository`, `createArchiveRepository`, `createSchemaRepository`, `createSchemaRegistry` with first-arg adapter discriminant `'fs'`. `barrel.spec.ts` constructs a repo without `createKernel`.

**Partial:** `createSchemaRepository` exported without `FsSchemaRepositoryOptions` / `SchemaRepositoryConfig` type exports (spec example cites `FsSpecRepositoryOptions` pattern for all repos).

### D. Kernel-equivalent assembly — **partial** (primary gap)

`barrel-kernel-coverage.spec.ts` maps every `kernel.{changes,specs,project}.*` mount to a public symbol. **14 mounts resolve to exported use-case classes, not `createX` factories:**

| Kernel mount                            | Public export                           | Expected per spec                     |
| --------------------------------------- | --------------------------------------- | ------------------------------------- |
| `changes.invalidate`                    | `InvalidateChange` (class)              | `createInvalidateChange`              |
| `changes.updateSpecDeps`                | `UpdateSpecDeps` (class)                | `createUpdateSpecDeps`                |
| `changes.runStepHooks`                  | `RunStepHooks` (class)                  | `createRunStepHooks`                  |
| `changes.getHookInstructions`           | `GetHookInstructions` (class)           | `createGetHookInstructions`           |
| `changes.getArtifactInstruction`        | `GetArtifactInstruction` (class)        | `createGetArtifactInstruction`        |
| `changes.updateImplementationTracking`  | `UpdateImplementationTracking` (class)  | `createUpdateImplementationTracking`  |
| `changes.refreshImplementationTracking` | `RefreshImplementationTracking` (class) | `createRefreshImplementationTracking` |
| `changes.getImplementationReview`       | `GetImplementationReview` (class)       | `createGetImplementationReview`       |
| `specs.getOutline`                      | `GetSpecOutline` (class)                | `createGetSpecOutline`                |
| `specs.validateSchema`                  | `ValidateSchema` (class)                | `createValidateSchema`                |
| `specs.generateMetadata`                | `GenerateSpecMetadata` (class)          | `createGenerateSpecMetadata`          |
| `specs.updateMetadata`                  | `UpdateSpecMetadata` (class)            | `createUpdateSpecMetadata`            |
| `project.getMetadata`                   | `GetProjectMetadata` (class)            | `createGetProjectMetadata`            |
| `project.updateMetadata`                | `UpdateProjectMetadata` (class)         | `createUpdateProjectMetadata`         |

**Classification:** **code bug** relative to merged spec (`Kernel-mounted use case surface`, architecture `createX` for every kernel capability). The coverage test intentionally lowers the bar by treating exported classes as sufficient assembly exports (`barrel-kernel-coverage.spec.ts` L29–37, L83–85).

**Additional:** `core:composition` requirement _"Use case constructors are not exported"_ — **missing**. `public.ts` L193–217 exports constructors for the classes above.

### E. ResolveSchema wiring — **partial / missing**

| Item                                         | Status          | Evidence                                                           |
| -------------------------------------------- | --------------- | ------------------------------------------------------------------ |
| `createResolveSchema(config)` public factory | **missing**     | No symbol in codebase                                              |
| `ResolveSchema` type on `"."`                | **implemented** | `public.ts` L84 (type-only)                                        |
| Wiring inside `createGetActiveSchema`        | **implemented** | `get-active-schema.ts` L82–88                                      |
| Wiring inside `createKernel`                 | **implemented** | `kernel.ts` L171–176, used by `getActiveSchema` / `validateSchema` |
| `kernel.specs.resolve` mount                 | **missing**     | `Kernel.specs` interface has no `resolve` property                 |

Verify scenario (_ResolveSchema factory is wired in kernel → `kernel.specs.resolve`_) does not match implementation. Wiring intent is met indirectly; public factory + kernel mount are not.

### F. Config I/O — **implemented** (minor partial on loader)

- `createConfigWriter()` zero-arg + `{ configWriter }` injection: **implemented** (`config-writer.ts`).
- `createConfigLoader(options)`: **requires** `FsConfigLoaderOptions`; no zero-arg overload. Architecture prose says `createConfigLoader()` — minor **partial** unless options are considered mandatory by design.
- Config mutation absent from kernel: **implemented**.

### G. Kernel builder — **implemented**

`createKernelBuilder` + `KernelBuilder` on `@specd/core/extensions`. Tested in `kernel-builder.spec.ts` and `barrel.spec.ts`. Not on `"."` (correct per extension-surface requirement).

### H. VCS auto-detect in factories — **implemented**

Standalone factories in `composition/use-cases/` import `createVcsActorResolver`; no hardcoded `GitActorResolver` / `HgActorResolver` / `SvnActorResolver` / `NullActorResolver` imports in that directory.

### I. Cross-package SDK policy — **implemented** (reference)

- `@specd/cli` runtime deps: `@specd/sdk` only (no direct `@specd/core` / `@specd/code-graph`).
- `@specd/mcp` runtime deps: `@specd/sdk` only.
- `@specd/sdk` re-exports `@specd/core/ports` and `@specd/core/extensions`.

---

## Test coverage assessment

| Test file                        | What it proves                                                                              | Gaps                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `barrel.spec.ts`                 | Version, no adapters on root, key factories, ports/extensions subpaths, repo without kernel | Does not assert absence of use-case class constructors; does not check all repo option types |
| `barrel-kernel-coverage.spec.ts` | Every kernel mount has _some_ public symbol                                                 | **Accepts class exports instead of `createX` factories** — masks spec gap                    |
| `kernel-builder.spec.ts`         | Builder semantics vs `createKernel`                                                         | Not run in this audit pass but exists                                                        |

**Tests passed:** 8/8 (`pnpm test test/barrel.spec.ts test/barrel-kernel-coverage.spec.ts`).

---

## Discrepancies: spec drift vs code bug

| Issue                                              | Kind                           | Detail                                                                               |
| -------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| 14 use cases lack `createX` factories              | **Code bug**                   | Merged `spec.md` requires factory per kernel mount; implementation exports classes   |
| Use-case class constructors on `"."`               | **Code bug**                   | Violates composition requirement; tests accept it                                    |
| `kernel.specs.resolve` absent                      | **Code bug** (or stale verify) | Verify expects mount; kernel has no `resolve` key                                    |
| `createResolveSchema` not exported                 | **Code bug**                   | Explicit requirement in `core:composition`                                           |
| verify.md: repository factories not on public root | **Spec drift**                 | Contradicts merged `spec.md` + `barrel.spec.ts`; scenario is stale                   |
| verify.md: use-case constructors not exported      | **Spec drift**                 | Contradicts current `public.ts`; scenario is stale                                   |
| Repository `type: 'fs'` literal                    | **Deferred / partial**         | Spec notes full registry dispatch out of scope; extensible signature not yet present |
| `createConfigLoader()` zero-arg                    | **Ambiguous**                  | Architecture prose vs required-options implementation                                |

---

## Recommendations (informational — no changes made)

1. Add `createX` factories for the 14 class-only use cases (or remove class constructor exports from `"."` once factories exist).
2. Export `createResolveSchema`; consider adding `kernel.specs.resolve` **or** update verify to match indirect wiring via `getActiveSchema`.
3. Export `FsSchemaRepositoryOptions` and `SchemaRepositoryConfig` on `"."`.
4. Tighten `barrel-kernel-coverage.spec.ts` to require `create*` prefix for every mount (fail on bare class exports).
5. Update stale `core:composition` verify scenarios for repository factories and constructor exports.
6. Widen repository factory first parameter from `'fs'` to `string` when registry dispatch lands.

---

## Files examined

- `packages/core/package.json`
- `packages/core/src/public.ts`
- `packages/core/src/ports.ts`
- `packages/core/src/extensions.ts`
- `packages/core/src/index.ts`
- `packages/core/src/composition/kernel.ts`
- `packages/core/src/composition/kernel-builder.ts`
- `packages/core/src/composition/config-loader.ts`
- `packages/core/src/composition/config-writer.ts`
- `packages/core/src/composition/spec-repository.ts`
- `packages/core/src/composition/change-repository.ts`
- `packages/core/src/composition/use-cases/get-active-schema.ts`
- `packages/core/test/barrel.spec.ts`
- `packages/core/test/barrel-kernel-coverage.spec.ts`
- `packages/cli/package.json`, `packages/mcp/package.json`, `packages/sdk/package.json` (cross-package refs)
