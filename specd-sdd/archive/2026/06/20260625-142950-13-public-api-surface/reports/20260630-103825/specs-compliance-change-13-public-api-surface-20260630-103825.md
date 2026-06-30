# Specs Compliance Report — `13-public-api-surface`

**Mode:** change (full verify)  
**Timestamp:** 20260630-103825  
**Change:** `13-public-api-surface`  
**State at audit:** `verifying`

## Aggregate summary

| Area                | Specs | Implemented  | Partial  | Missing               | Test gaps                                |
| ------------------- | ----- | ------------ | -------- | --------------------- | ---------------------------------------- |
| Architecture + Core | 2     | Most         | 4        | 2                     | barrel-kernel-coverage masks factory gap |
| SDK + Code-graph    | 2     | Code-graph ✓ | SDK      | 1 blocking            | NodeContentHasher not tested             |
| Docs + Public-web   | 2     | Public-web ✓ | Docs SDK | Docs core audience    | use-cases/overview labels                |
| **Total findings**  | 6     | —            | —        | **3 blocking / high** | —                                        |

## Blocking / high-severity findings

### 1. SDK exports `NodeContentHasher` from `@specd/core/internal` (FAIL)

- **Spec:** `sdk:composition` — `"."` must not export symbols only on dependency `"./internal"` entry points
- **Code:** `packages/sdk/src/index.ts` L24 — `export { NodeContentHasher } from '@specd/core/internal'`
- **Fix options:** Move hasher to core `"."` or code-graph public; or narrow SDK spec exception with delta

### 2. Fourteen kernel use cases exported as classes, not `createX` factories (PARTIAL/FAIL)

- **Spec:** `core:composition` + `default:_global/architecture` — factory per kernel mount; constructors not on public `"."`
- **Code:** `packages/core/src/public.ts` exports `InvalidateChange`, `RunStepHooks`, etc. as classes
- **Tests:** `barrel-kernel-coverage.spec.ts` accepts classes — masks gap
- **Fix options:** Add missing factories + remove class exports; or relax spec/verify to allow class assembly

### 3. Documentation audience labels incomplete (FAIL)

- **Spec:** `default:_global/docs` — core docs labeled plugin/core-only; integrators directed to `docs/sdk/`
- **Code:** `docs/core/overview.md` still says core docs target integrators; `docs/core/use-cases.md` lacks audience label
- **Fix options:** Sweep docs per task 4.4 intent; or narrow docs verify scenarios

## Medium findings

- `createResolveSchema` not public; `kernel.specs.resolve` absent (verify vs implementation mismatch)
- `FsSchemaRepositoryOptions` / `SchemaRepositoryConfig` not on core `"."`
- `docs/sdk/index.md` missing `createSdkContext` and standalone factory examples
- Stale `core:composition` verify scenarios contradict merged spec (artifact drift in verify deltas)

## Passing areas

- Core/code-graph/sdk package.json export maps (`"."`, `./ports`, `./extensions`, `./internal`)
- No concrete adapters on `@specd/core` `"."` or `./ports`
- CLI/MCP sdk-only runtime deps
- Code-graph curated public barrel + internal split
- SDK no `export * from '@specd/core'` (uses `core-reexports.ts`)
- Public-web multi-package API generation (sdk → core → code-graph), sidebar, `gitRevision: main`, tests 22/22
- Package tests: core 2016, sdk 26, cli 796, public-web 22 (all pass)

---

## Detailed: core + architecture

See `_partial-core-architecture.md` in this directory.

## Detailed: sdk + code-graph

### sdk:composition

| Requirement                      | Status   | Evidence                                        |
| -------------------------------- | -------- | ----------------------------------------------- |
| Deps core + code-graph only      | PASS     | `packages/sdk/package.json`                     |
| No `export * from '@specd/core'` | PASS     | `core-reexports.ts`                             |
| Bootstrap/orchestration exports  | PASS     | `index.ts`                                      |
| No internal dependency exports   | **FAIL** | `NodeContentHasher` from `@specd/core/internal` |
| Ports/extensions subpaths        | PASS     | `ports.ts`, `extensions.ts`                     |

### code-graph:composition

| Requirement                | Status | Evidence                |
| -------------------------- | ------ | ----------------------- |
| public vs internal barrels | PASS   | `public.ts`, `index.ts` |
| package.json exports       | PASS   | `"."` + `"./internal"`  |
| Barrel tests               | PASS   | 2/2                     |

## Detailed: docs + public-web

### public-web:api-reference — PASS

All merged verify scenarios satisfied by implementation and tests.

### default:\_global/docs — PARTIAL

| Item                                       | Status                          |
| ------------------------------------------ | ------------------------------- |
| `docs/sdk/` integrator entry               | Partial — missing some examples |
| `docs/core/index.md` callout               | PASS                            |
| `docs/code-graph/index.md` callout         | PASS                            |
| Docusaurus sidebar SDK first               | PASS                            |
| `docs/core/use-cases.md` audience label    | FAIL                            |
| `docs/core/overview.md` integrator wording | FAIL                            |

---

## Verification scenario rollup (change specs)

| Spec                           | Scenarios                            | Result                         |
| ------------------------------ | ------------------------------------ | ------------------------------ |
| `default:_global/architecture` | Public entry points, adapters hidden | **PASS** (barrel tests)        |
| `core:composition`             | Factories, no constructors on `"."`  | **FAIL** (14 class exports)    |
| `code-graph:composition`       | Public barrel, provider facade       | **PASS**                       |
| `sdk:composition`              | No internal re-exports               | **FAIL** (`NodeContentHasher`) |
| `default:_global/docs`         | SDK-first docs, audience labels      | **PARTIAL**                    |
| `public-web:api-reference`     | Multi-package API                    | **PASS**                       |

## Recommended next steps

1. **Fix Implementation** — `NodeContentHasher` placement; optional `createX` factories for 14 use cases
2. **Update Specs** — align verify deltas with merged spec; document intentional class-export pattern if kept
3. **Both** — design delta first, then implement
4. **Proceed** — accept gaps as follow-up (not recommended for blocking items 1–2)
