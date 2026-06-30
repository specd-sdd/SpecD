# Partial Audit: Global Spec Compliance

**Scope:** Project-wide specs from `specd project context` relevant to `@specd/sdk`  
**Implementation:** `packages/sdk/`

---

## default:\_global/architecture

| Check                                           | Status | Notes                                                                                      |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| SDK is not a domain package with business logic | ✅     | No `domain/`, `application/`, or `infrastructure/` layers — composition/orchestration only |
| Delegates to core/code-graph use cases          | ✅     | All workflows call factories and kernel use cases                                          |
| No circular package dependencies                | ✅     | `sdk` → `core`, `code-graph` only                                                          |
| Manual DI at entry points                       | ✅     | `openSpecdHost` / `createSdkContext` wire dependencies explicitly                          |
| Delivery adapter rule                           | ✅     | SDK is host facade, not an adapter with embedded domain logic                              |

**Partial:** Verify scenario in `sdk:composition` mirrors architecture layering but `src/shared/` is an extra directory not covered by either global or SDK layer specs.

---

## default:\_global/conventions

| Check                    | Status | Notes                                                       |
| ------------------------ | ------ | ----------------------------------------------------------- |
| ESM (`"type": "module"`) | ✅     | `package.json`                                              |
| Named exports only       | ✅     | No default exports; no `export *`                           |
| TypeScript strict        | ✅     | `tsconfig.json` extends monorepo pattern                    |
| JSDoc on public APIs     | ✅     | Host context, orchestration, and version helpers documented |

---

## default:\_global/testing

| Check                      | Status     | Notes                                                                  |
| -------------------------- | ---------- | ---------------------------------------------------------------------- |
| Unit tests for SDK modules | ⚠️ Partial | 4 spec files under `packages/sdk/test/` with mocked dependencies       |
| Verify scenario coverage   | ⚠️ Partial | ~60% of verify scenarios have direct tests; gaps listed in SDK partial |
| Test structure (vitest)    | ✅         | `vitest.config.ts` present                                             |

**Finding (medium):** Several binding verify scenarios lack tests (SDK_VERSION, forced config path, barrel negative exports, process.exit absence, full index, hotspots).

---

## default:\_global/eslint

| Check                      | Status | Notes                             |
| -------------------------- | ------ | --------------------------------- |
| Package eslint config      | ✅     | `eslint.config.js` extends root   |
| Test file rule relaxations | ✅     | Standard pattern for vitest mocks |

---

## default:\_global/spec-layout

| Check                                         | Status | Notes                             |
| --------------------------------------------- | ------ | --------------------------------- |
| Change-owned specs under change `specs/sdk/*` | ✅     | Per change status artifacts       |
| Paired verify.md                              | ✅     | All 5 SDK specs have verify files |

---

## Spec Dependency Chain Consistency

| Change spec                       | Depends on                                                                         | Consistent?                                              |
| --------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| sdk:composition                   | architecture, core:composition, code-graph:composition                             | ✅                                                       |
| sdk:host-context                  | sdk:composition, core:kernel, core:composition                                     | ✅ Uses getConfig not duplicate config on SdkHostContext |
| sdk:with-open-graph-provider      | sdk:host-context, code-graph:composition                                           | ✅                                                       |
| sdk:build-project-status-snapshot | sdk:host-context, core:get-project-summary, code-graph:get-graph-health            | ✅ (factory signature prose drift only)                  |
| sdk:run-index-project-graph       | sdk:with-open-graph-provider, code-graph:index-project-graph, core:list-workspaces | ✅                                                       |

No contradictions found between change specs and global architecture/conventions.

---

## Global Aggregate

| Metric            | Count                                      |
| ----------------- | ------------------------------------------ |
| Conformant checks | 12                                         |
| Partial           | 2 (layer layout strictness, test coverage) |
| Missing           | 0                                          |
| Discrepancies     | 0 at global level                          |
