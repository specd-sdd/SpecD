# Partial: Core specs — `code-graph-file-categories`

**Specs audited:** `core:config`  
**Dependencies checked:** `default:_global/architecture`, `core:vcs-adapter-port`

---

## 1. Requirements Summary

| Spec          | Requirement / Area                                                                  | Impl Status | Notes                                                                |
| :------------ | :---------------------------------------------------------------------------------- | :---------- | :------------------------------------------------------------------- |
| `core:config` | Workspace-level graph configuration (`testPaths`, `ignorePaths`)                    | ✅ Pass     | Supported in types, Zod schema, and loader                           |
| `core:config` | Project-level graph configuration (`testPaths` defaults & overrides, `ignorePaths`) | ✅ Pass     | Defaults applied when omitted; overrides respected                   |
| `core:config` | Categorization precedence specification                                             | ✅ Pass     | Documented in spec; consumed by `@specd/code-graph`                  |
| `core:config` | Verification scenarios satisfaction                                                 | ✅ Pass     | All workspace and project graph verification scenarios covered       |
| `core:config` | Hexagonal architecture & boundary validation                                        | ✅ Pass     | YAML inputs validated at boundary; pure interfaces preserved         |
| `core:config` | Direct dependencies conformance (`_global/architecture`, `vcs-adapter-port`)        | ✅ Pass     | No circular dependencies; repository bounding via VCS adapter intact |

---

## 2. Implementation Status

### 2.1 Domain & Application Types (`packages/core/src/application/specd-config.ts`)

- **`SpecdWorkspaceGraphConfig`**:
  - Added `readonly testPaths?: readonly string[]` for workspace-specific test patterns.
  - Added `readonly ignorePaths?: readonly string[]` for workspace-specific ignored patterns.
  - Preserved existing `respectGitignore`, `excludePaths`, and `allowedPaths`.
- **`SpecdGraphConfig`**:
  - Added `readonly testPaths?: readonly string[]` for project-global test patterns.
  - Added `readonly ignorePaths?: readonly string[]` for project-global ignored patterns.
  - Preserved existing `includePaths` and `excludePaths`.
- **Constants**:
  - `DEFAULT_GRAPH_TEST_PATHS`: Exported as `['**/*.spec.*', '**/*.test.*', '**/test/**', '**/tests/**', '**/__tests__/**', '*_test.*']`.
  - `DEFAULT_GRAPH_IGNORE_PATHS`: Exported as empty array `[]`.
- **Public Exports**:
  - Re-exported from `packages/core/src/application/index.ts` and `packages/core/src/public.ts`, ensuring availability to downstream consumers (`@specd/code-graph`, `@specd/cli`) via public entry points.

### 2.2 Boundary Schema Validation (`packages/core/src/application/ports/config-schema.ts`)

- **`WorkspaceGraphZodSchema`**:
  - Extended with `testPaths: z.array(z.string()).optional()` and `ignorePaths: z.array(z.string()).optional()`.
  - Maintained `.strict()` mode to reject unrecognized fields.
- **`ProjectGraphZodSchema`**:
  - Extended with `testPaths: z.array(z.string()).optional()` and `ignorePaths: z.array(z.string()).optional()`.
  - Maintained `.strict()` mode to reject unrecognized fields.
- Conforms to architecture invariant: unvalidated YAML cannot reach domain or application objects.

### 2.3 Configuration Loader (`packages/core/src/infrastructure/fs/config-loader.ts`)

- **Workspace parsing** (lines 457–477):
  - Preserves `testPaths` and `ignorePaths` onto `SpecdWorkspaceConfig.graph` when defined.
  - Keeps `SpecdWorkspaceConfig.graph` `undefined` when the `graph` block is absent on the workspace.
- **Project-level parsing** (lines 629–638):
  - Populates `testPaths` with `data.graph?.testPaths ?? DEFAULT_GRAPH_TEST_PATHS`.
  - Populates `ignorePaths` with `data.graph?.ignorePaths ?? DEFAULT_GRAPH_IGNORE_PATHS`.
  - Guarantees default test and ignore paths are present even when `graph` is completely omitted from `specd.yaml`.

---

## 3. Verification Scenarios Satisfaction

### Workspace-level Graph Configuration

| Scenario                                              | Spec Expectation                                                                   | Implementation / Test                                                                                      | Result  |
| :---------------------------------------------------- | :--------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------- | :------ |
| **Allowed paths constrain workspace indexing**        | Declared `graph.allowedPaths` preserved on workspace config                        | `config-loader.spec.ts:1568` (`it('parses graph.allowedPaths correctly')`)                                 | ✅ Pass |
| **excludePaths replaces built-in defaults**           | Declared `graph.excludePaths` preserved without merging built-in defaults          | `config-loader.spec.ts:1514` (`it('parses graph.excludePaths and graph.respectGitignore correctly')`)      | ✅ Pass |
| **graph block absent — no field on workspace config** | Workspace `graph` is `undefined` when omitted                                      | `config-loader.spec.ts:1558` (`it('graph field is undefined on workspace when graph block is absent')`)    | ✅ Pass |
| **respectGitignore defaults to true**                 | `respectGitignore` omitted is `undefined` on config (treated as `true` by indexer) | `config-loader.spec.ts:1568` & `code-graph` indexer                                                        | ✅ Pass |
| **respectGitignore set to false**                     | Explicit `respectGitignore: false` preserved                                       | `config-loader.spec.ts:1514`                                                                               | ✅ Pass |
| **Workspace testPaths and ignorePaths configured**    | Workspace `testPaths` and `ignorePaths` parsed and preserved                       | `config-loader.spec.ts:1753` (`it('parses graph.testPaths and graph.ignorePaths correctly on workspace')`) | ✅ Pass |

### Project-level Graph Configuration

| Scenario                                         | Spec Expectation                                                                     | Implementation / Test                                                                                                                                                                                                  | Result  |
| :----------------------------------------------- | :----------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------ |
| **Project graph include paths discovered**       | `graph.includePaths` parsed into `config.graph.includePaths`                         | `config-loader.spec.ts:1795` (`it('reads graph.includePaths and graph.excludePaths into SpecdConfig')`)                                                                                                                | ✅ Pass |
| **Project graph exclude paths discovered**       | `graph.excludePaths` parsed into `config.graph.excludePaths`                         | `config-loader.spec.ts:1795`                                                                                                                                                                                           | ✅ Pass |
| **Project testPaths and ignorePaths configured** | Explicit `testPaths` and `ignorePaths` loaded into `SpecdConfig.graph`               | `config-loader.spec.ts:1826` (`it('reads configured graph.testPaths and graph.ignorePaths into SpecdConfig')`)                                                                                                         | ✅ Pass |
| **Project testPaths omitted defaults applied**   | Defaults applied when `testPaths` omitted from `graph` or when `graph` block omitted | `config-loader.spec.ts:1844` (`it('populates default testPaths and ignorePaths when omitted in graph block')`) and `1867` (`it('populates default testPaths and ignorePaths when graph block is completely omitted')`) | ✅ Pass |

---

## 4. Discrepancies & Observations

### OBS-CORE-1 — Negative Type Validation Test Gap (Severity: Low / Test Gap)

- **Finding:** While negative tests exist in `packages/core/test/infrastructure/fs/config-loader.spec.ts` for non-array `includePaths` (`it('rejects graph.includePaths when given a bare string instead of array')`), non-boolean `respectGitignore`, non-array `excludePaths`, non-array `allowedPaths`, and unknown fields in `graph`, there is no explicit test verifying that non-array / bare string `testPaths` or `ignorePaths` causes a validation failure.
- **Assessment:**
  - `ProjectGraphZodSchema` and `WorkspaceGraphZodSchema` strictly declare `z.array(z.string()).optional()`, so Zod will correctly reject strings, numbers, or objects.
  - However, adding explicit test cases for `testPaths: "bare-string"` and `ignorePaths: "bare-string"` would improve full symmetry across all array fields in `config-loader.spec.ts`.
- **Action:** Non-blocking test gap recommendation for future cleanup.

### OBS-CORE-2 — Interface Optionality vs Loader Guarantee (Severity: Info / Design Note)

- **Finding:** In `packages/core/src/application/specd-config.ts`, `SpecdConfig.graph` is defined as `readonly graph?: SpecdGraphConfig` (optional). In `packages/core/src/infrastructure/fs/config-loader.ts`, `ConfigLoader.load()` always populates `graph: { ... testPaths: [...], ignorePaths: [...] }`.
- **Assessment:**
  - This is intentional: typing `graph?: SpecdGraphConfig` allows flexibility for mock configs, partial overrides, or non-filesystem loader implementations, while `ConfigLoader` guarantees default values are populated at runtime.
  - Downstream consumers in `@specd/code-graph` (e.g. `buildProjectGraphConfig`) safely use `config.graph?.testPaths ?? DEFAULT_GRAPH_TEST_PATHS`.

---

## 5. Test Coverage Analysis

| Test Suite / Block                    | Coverage Scope                                                                                                                                                                | Status            |
| :------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------- |
| `Requirement: Workspace graph config` | 8 tests: `excludePaths`, `respectGitignore`, absent block, `allowedPaths`, invalid types, unknown keys, `testPaths`, `ignorePaths`                                            | ✅ 8 / 8 Pass     |
| `Requirement: Project graph config`   | 5 tests: `includePaths`, `excludePaths`, non-array `includePaths` rejection, explicit `testPaths`/`ignorePaths`, omitted defaults in block, completely omitted block defaults | ✅ 5 / 5 Pass     |
| Full `config-loader.spec.ts` suite    | 133 tests covering entire config loading, cascade, validation, and defaults                                                                                                   | ✅ 133 / 133 Pass |

---

## 6. Architecture & Direct Dependency Compliance

1. **Hexagonal Architecture (`default:_global/architecture`):**
   - Pure domain contracts: Interfaces `SpecdGraphConfig`, `SpecdWorkspaceGraphConfig`, and constants `DEFAULT_GRAPH_TEST_PATHS`, `DEFAULT_GRAPH_IGNORE_PATHS` reside in `application/`.
   - Port validation: Zod schemas in `application/ports/config-schema.ts`.
   - Infrastructure implementation: `ConfigLoader` in `infrastructure/fs/config-loader.ts`.
   - Public barrel curation: `packages/core/src/public.ts` exports types and constants, without leaking internal adapter classes.
2. **VCS Port Bounding (`core:vcs-adapter-port`):**
   - `ConfigLoader` resolution continues to use the active VCS adapter for bounding repository walk-up without interference from new graph configuration fields.
3. **No Circular Package Dependencies:**
   - `@specd/core` has zero dependencies on `@specd/code-graph` or other downstream packages. `@specd/code-graph` imports the types and default constants from `@specd/core`.

---

## 7. Summary

- **Total requirements / scenarios audited:** 10
- **Passing:** 10
- **Failing:** 0
- **Spec Drift:** 0
- **Test Gaps:** 1 minor (negative type tests for new array fields)
- **Verdict:** **COMPLIANT**
