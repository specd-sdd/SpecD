# Spec Compliance Audit: Core Area

## Scope

- **Spec**: `core:config` (with active deltas from change `code-graph-file-categories` applied)
- **Target Package**: `@specd/core`
- **Global Constraints & Dependencies**:
  - `default:_global/architecture`
  - `default:_global/conventions`
  - `default:_global/docs`
  - `core:vcs-adapter-port`

---

## 1. Requirements Summary

### `core:config` (with `code-graph-file-categories` deltas)

1. **Workspace-Level Graph Configuration (`testPaths`, `ignorePaths`)**:
   - Workspaces in `specd.yaml` may declare `graph.testPaths` (array of gitignore-syntax strings) to identify test and verification files relative to workspace `codeRoot`. When present, these supplement project-level `graph.testPaths`.
   - Workspaces in `specd.yaml` may declare `graph.ignorePaths` (array of gitignore-syntax strings) to identify auxiliary files (fixtures, mocks, scratch scripts) relative to workspace `codeRoot`. When present, these supplement project-level `graph.ignorePaths`.
   - Preserves existing workspace graph properties: `allowedPaths`, `excludePaths`, `respectGitignore`.

2. **Project-Level Graph Configuration (`testPaths`, `ignorePaths`)**:
   - `specd.yaml` root `graph` section supports optional `testPaths` (array of gitignore-syntax strings) identifying project-wide test files.
   - When omitted, built-in defaults apply:
     `['**/*.spec.*', '**/*.test.*', '**/test/**', '**/tests/**', '**/__tests__/**', '*_test.*']`.
   - `specd.yaml` root `graph` section supports optional `ignorePaths` (array of gitignore-syntax strings) identifying project-wide auxiliary files.
   - When omitted, defaults to an empty array (`[]`).
   - Defines file categorization precedence (evaluated during code graph indexing):
     1. Exclusion via `excludePaths` or `.gitignore` (absolute priority).
     2. Match against `ignorePaths` (project or workspace level) -> categorized as `ignored`.
     3. Match against `testPaths` (project or workspace level) -> categorized as `test`.
     4. Otherwise -> categorized as `source`.

3. **Strict Schema & Startup Validation**:
   - Graph schemas (`WorkspaceGraphZodSchema` and `ProjectGraphZodSchema`) enforce `.strict()`, rejecting unrecognized properties.
   - `testPaths` and `ignorePaths` must be string arrays; non-array values fail validation with `ConfigValidationError`.

---

## 2. Implementation Status

| Requirement / Component                       | Implementation Location                                                            | Status            |
| --------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------- |
| Workspace Graph Configuration Interface       | `packages/core/src/application/specd-config.ts` (`SpecdWorkspaceGraphConfig`)      | Fully Implemented |
| Project Graph Configuration Interface         | `packages/core/src/application/specd-config.ts` (`SpecdGraphConfig`)               | Fully Implemented |
| Default Test Patterns Constant                | `packages/core/src/application/specd-config.ts` (`DEFAULT_GRAPH_TEST_PATHS`)       | Fully Implemented |
| Default Ignored Patterns Constant             | `packages/core/src/application/specd-config.ts` (`DEFAULT_GRAPH_IGNORE_PATHS`)     | Fully Implemented |
| Workspace Graph Zod Schema                    | `packages/core/src/application/ports/config-schema.ts` (`WorkspaceGraphZodSchema`) | Fully Implemented |
| Project Graph Zod Schema                      | `packages/core/src/application/ports/config-schema.ts` (`ProjectGraphZodSchema`)   | Fully Implemented |
| Loader Workspace Graph Mapping                | `packages/core/src/infrastructure/fs/config-loader.ts` (lines 457–477)             | Fully Implemented |
| Loader Project Graph Normalization & Defaults | `packages/core/src/infrastructure/fs/config-loader.ts` (lines 629–638)             | Fully Implemented |
| Config Guard Shape Validation                 | `packages/core/src/application/specd-config.ts` (`isSpecdConfig`)                  | Fully Implemented |
| Public Barrel Re-exports                      | `packages/core/src/public.ts`, `packages/core/src/index.ts`                        | Fully Implemented |

---

## 3. Discrepancies

- **None detected.** The implementation in `@specd/core` precisely reflects all delta specifications in `spec.md` and verification scenarios in `verify.md`.

---

## 4. Test Coverage

All tests in `@specd/core` were executed and passed (210 test files, 2,526 tests passing).

### Targeted Test Suite: `packages/core/test/infrastructure/fs/config-loader.spec.ts`

| Scenario from `verify.md`                      | Test Description                                                                                                                                 | Status |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Workspace testPaths and ignorePaths configured | `parses graph.testPaths and graph.ignorePaths correctly on workspace`                                                                            | Passed |
| Workspace allowedPaths constrain indexing      | `parses graph.allowedPaths correctly`                                                                                                            | Passed |
| Workspace excludePaths replaces defaults       | `parses graph.excludePaths and graph.respectGitignore correctly`                                                                                 | Passed |
| Workspace graph block absent                   | `graph field is undefined on workspace when graph block is absent`                                                                               | Passed |
| Workspace respectGitignore false               | `parses graph.excludePaths and graph.respectGitignore correctly`                                                                                 | Passed |
| Workspace strict validation on graph block     | `rejects unknown fields inside the graph block`                                                                                                  | Passed |
| Workspace graph array validation               | `rejects graph.excludePaths when given a bare string instead of array`<br>`rejects graph.allowedPaths when given a bare string instead of array` | Passed |
| Project testPaths and ignorePaths configured   | `reads configured graph.testPaths and graph.ignorePaths into SpecdConfig`                                                                        | Passed |
| Project testPaths omitted defaults applied     | `populates default testPaths and ignorePaths when omitted in graph block`                                                                        | Passed |
| Project graph block completely omitted         | `populates default testPaths and ignorePaths when graph block is completely omitted`                                                             | Passed |
| Project graph includePaths / excludePaths      | `reads graph.includePaths and graph.excludePaths into SpecdConfig`                                                                               | Passed |
| Project graph array validation                 | `rejects graph.includePaths when given a bare string instead of array`                                                                           | Passed |

---

## 5. Missing Tests

- **None.** All verification scenarios defined in `verify.md.delta.yaml` have direct, automated unit tests in `packages/core/test/infrastructure/fs/config-loader.spec.ts`.

---

## 6. Spec Dependency Chain & Consistency

1. **`default:_global/architecture`**:
   - **Layered Structure**: Config types and contracts reside in `application/specd-config.ts` and `application/ports/config-schema.ts`. File reading and parsing reside strictly in `infrastructure/fs/config-loader.ts`.
   - **Domain Purity**: Domain entities remain untouched and pure of I/O.
   - **Infrastructure Validation**: External YAML parsing validates using strict Zod schemas at the infrastructure boundary before application entities are formed.
   - **Public Exports**: Public barrel (`src/public.ts`) exposes only curated contracts, types, and constants (`DEFAULT_GRAPH_TEST_PATHS`, `DEFAULT_GRAPH_IGNORE_PATHS`), without leaking concrete infrastructure classes.
   - **Dependency Flow**: One-way dependencies with no circular references.

2. **`default:_global/conventions`**:
   - TypeScript strict mode compliance verified (`strict: true`).
   - ESM-only with explicit `.js` import extensions.
   - Named exports only; no default exports.
   - Kebab-case file naming matching test file structure.
   - Immutability preserved with `readonly string[]` properties and `readonly` constant pattern arrays.
   - No usage of `any`.

3. **`default:_global/docs`**:
   - Full JSDoc documentation on all interfaces, constants, and exported types (`@param`, descriptions).
   - User guide and reference documentation in `docs/guide/configuration.md` and `docs/guide/code-graph.md` are aligned with the new fields and categorization precedence.

4. **`core:vcs-adapter-port`**:
   - Config path resolution properly accounts for repository root containment and boundaries.

---

## 7. Summary Counts

- **Requirements Audited**: 3
- **Fully Implemented**: 3
- **Discrepancies**: 0
- **Total `@specd/core` Test Files Passed**: 210 / 210
- **Total `@specd/core` Tests Passed**: 2,526 / 2,526
- **Targeted Config Loader Tests Passed**: 13 / 13
- **Missing Tests**: 0
