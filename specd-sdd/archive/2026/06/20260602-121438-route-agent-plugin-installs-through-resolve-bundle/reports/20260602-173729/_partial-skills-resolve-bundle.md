# Partial Compliance Audit: `skills:resolve-bundle`

**Audit date:** 2026-06-02T17:37:29Z  
**Change:** `route-agent-plugin-installs-through-resolve-bundle`  
**Spec ID:** `skills:resolve-bundle`  
**Implementation:** `packages/skills/src/application/use-cases/resolve-bundle.ts`  
**Tests:** `packages/skills/test/resolve-bundle.spec.ts`

---

## 1. Spec Summary

**Purpose:** Use case for resolving a skill bundle with structured install-time rendering and privacy-safe template variable exposure.

**Input:** `{ name: string, config?: SpecdConfig, context?: SkillTemplateContext }`

**Output:** `{ bundle: SkillBundle }`

**Behavior (10 requirements):**

1. Built-in safe variable injection from `SpecdConfig` (`configPath`, `schemaRef`)
2. Default `sharedFolder` injection when absent
3. Trailing `/` normalization on `sharedFolder`
4. `sharedFolder` escape-from-project-root validation
5. Merge built-in values with install-time context
6. Call `SkillRepository.getBundle(name, mergedContext)`
7. Resolve templates using recursive variables + capabilities
8. `variables.frontmatter` as frontmatter source when `frontmatter` capability present
9. Preserve non-content `ResolvedFile` metadata (including `shared` flag)
10. Return resolved bundle

---

## 2. Requirements × Implementation Status

| #   | Requirement                                                        | Impl Status | Evidence                                                                                            |
| --- | ------------------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------- |
| 1   | Built-in safe variable injection                                   | ✅ PASS     | Lines 58-73: `configPath` from `toRelativeProjectPath()`, `schemaRef` from `input.config.schemaRef` |
| 2   | Default `sharedFolder` injection                                   | ✅ PASS     | Lines 62-65: `resolveSharedFolder()` called; `sharedFolder` passed to `variables` on line 72        |
| 3   | Trailing `/` normalization                                         | ✅ PASS     | `normalizeSharedFolder()` in `shared-folder.ts:65` uses `.replace(/\/+$/, '')`                      |
| 4   | Escape-from-project-root validation                                | ✅ PASS     | `shared-folder.ts:36-41`: `path.relative()` check throws `InvalidSharedFolderError`                 |
| 5   | Merge built-ins with context                                       | ✅ PASS     | Lines 67-72: spread `{ configPath, schemaRef, ...variables, sharedFolder }`                         |
| 6   | Call `SkillRepository.getBundle`                                   | ✅ PASS     | Line 80: `this.repository.getBundle(input.name, mergedContext)`                                     |
| 7   | Resolve templates with recursive variables                         | ✅ PASS     | `SkillTemplateContext.variables` supports recursion via `SkillTemplateValue` type; passed through   |
| 8   | `variables.frontmatter` + `frontmatter` capability for composition | ✅ PASS     | Variables and capabilities forwarded as-is to repository (line 80)                                  |
| 9   | Preserve non-content `ResolvedFile` metadata                       | ✅ PASS     | Bundle returned directly from repository on line 81; use case does not transform files              |
| 10  | Return resolved bundle                                             | ✅ PASS     | Line 81: `return { bundle }`                                                                        |

**All 10 behavioural requirements are satisfied by the implementation.**

---

## 3. Scenario-by-Scenario Verification

### Requirement: Input

#### Scenario: With structured render context

- **Status:** ✅ PASS
- **Implementation:** Lines 55, 75-78 capture `variables` and `capabilities` from context and pass them to repository
- **Test:** Lines 78-107 ("given extra variables and capabilities...merges them with built-ins") verify merged context is passed to `getBundle`

#### Scenario: Nested variables are accepted in context.variables

- **Status:** ✅ PASS
- **Implementation:** Spread operator preserves nested objects; no flattening logic
- **Test:** Lines 109-135 ("given nested variables...preserves nested structure") verifies via inline assertion in mock

#### Scenario: Without context

- **Status:** ✅ PASS
- **Implementation:** Line 55: `input.context?.variables ?? {}`; line 77: `input.context?.capabilities ?? []`
- **Test:** Lines 52-76 test without `context` (only `config`), confirming built-ins are injected without context. No test for the bare `{ name: 'skill' }` case with neither config nor context, but the code paths are trivially covered by the `?? {}` / `?? []` defaults.

### Requirement: Output

#### Scenario: Returns resolved bundle with SkillBundle structure

- **Status:** ✅ PASS
- **Implementation:** Line 81: `return { bundle }`
- **Test:** Lines 137-153 assert `output.bundle.files[0]?.shared` and `output.bundle.files[0]?.filename`

### Requirement: Behavior

#### Scenario: Built-in safe values merge with install-time context

- **Status:** ✅ PASS
- **Implementation:** Lines 67-72 merge built-ins first, then user variables, then `sharedFolder`
- **Test:** Lines 78-107 verify all built-ins + custom variables in merged context

#### Scenario: sharedFolder is injected when absent

- **Status:** ✅ PASS
- **Implementation:** Lines 62-65: when `variables.sharedFolder` not a string, `undefined` passed → `defaultSharedFolder()` used
- **Test:** Lines 52-76 verify default `sharedFolder` value in merged context

#### Scenario: sharedFolder trailing slash is normalized away

- **Status:** ✅ PASS
- **Implementation:** `normalizeSharedFolder()` at `shared-folder.ts:65`
- **Test:** Lines 155-182 verify `/` stripped from `custom/path/` → `custom/path`

#### Scenario: sharedFolder escaping the project root is rejected

- **Status:** ✅ PASS
- **Implementation:** `shared-folder.ts:36-41` throws `InvalidSharedFolderError`
- **Test:** Lines 184-205 verify `rejects.toThrow(InvalidSharedFolderError)` for `../outside-project`

#### Scenario: projectRoot is not exposed as a template variable

- **Status:** ✅ PASS
- **Implementation:** `projectRoot` used only in `toRelativeProjectPath()` and `resolveSharedFolder()`, never added to `variables`
- **Test:** Lines 207-226 verify `capturedContext.variables.projectRoot` is `undefined`

#### Scenario: Structured context drives frontmatter composition

- **Status:** ✅ PASS (delegated)
- **Implementation:** The use case passes `variables.frontmatter` and `capabilities: ['frontmatter']` through to the repository (lines 75-78). Frontmatter composition is an infrastructure/repository concern.
- **Test:** Lines 109-135 verify nested `frontmatter` variable structure is preserved. No end-to-end test verifying the composed output in bundle content.

#### Scenario: Agent-plugin installs route bundle resolution through ResolveBundle

- **Status:** ⚠️ OUT OF SCOPE (architectural)
- **Implementation:** Not verifiable from this use case alone — requires inspecting agent plugin install code
- **Test:** No unit test covers this architectural direction

---

## 4. Test Coverage Assessment

| Metric                         | Count                                                        |
| ------------------------------ | ------------------------------------------------------------ |
| Total scenarios                | 10                                                           |
| ✅ Covered by unit tests       | 8                                                            |
| ⚠️ Delegated/partial coverage  | 1 (frontmatter composition — delegated to repository)        |
| ❌ Missing                     | 0                                                            |
| 🔲 Out of scope for unit tests | 1 (agent-plugin install routing — architectural integration) |

### Test Quality Observations

| Check                                                 | Status     | Notes                                                                                                                                                |
| ----------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Port mocks fully implement interface                  | ✅ PASS    | All 4 `SkillRepository` methods mocked (list, get, getBundle, listSharedFiles)                                                                       |
| No filesystem/network access                          | ✅ PASS    | All mocks return in-memory data                                                                                                                      |
| Test naming follows conventions                       | ⚠️ PARTIAL | Some tests use "given..., when..., then..." pattern; others use "given..., when execute is called, then..." — close but not exact                    |
| `InvalidSharedFolderError` exposed in test assertions | ✅ PASS    | Line 204: `.rejects.toThrow(InvalidSharedFolderError)`                                                                                               |
| Test file location mirrors source                     | ⚠️ ISSUE   | Source: `src/application/use-cases/resolve-bundle.ts`; Test: `test/resolve-bundle.spec.ts` (not `test/application/use-cases/resolve-bundle.spec.ts`) |

---

## 5. Spec Dependency Chain Check

| Dependent Spec                 | Relationship                           | Status       | Evidence                                                                                           |
| ------------------------------ | -------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------- |
| `core:config`                  | Defines `SpecdConfig` type             | ✅ Compliant | Imported from `@specd/core` at line 1                                                              |
| `skills:skill-bundle`          | Defines `SkillBundle` / `ResolvedFile` | ✅ Compliant | Imported at line 2 as `../../domain/skill-bundle.js` — matches domain type                         |
| `skills:skill-repository-port` | Defines `SkillRepository` port         | ✅ Compliant | Imported at line 5 as `../ports/skill-repository.js` — use case depends on port, not concrete impl |

### Port contract check: `SkillRepository.getBundle` signature

- **Spec says:** `getBundle(name: string, context?: SkillTemplateContext): SkillBundle`
- **Implementation calls:** `this.repository.getBundle(input.name, mergedContext)` where `mergedContext: SkillTemplateContext`
- **Port interface:** `getBundle(name: string, context?: SkillTemplateContext): SkillBundle`
- ✅ Match — `getBundle` signature aligns exactly between port spec, port interface, and use case call site

### Spec says `getBundle` "SHALL support receiving a SpecdConfig"

The port spec mentions `getBundle(name: string, variables?: Record<string, string>, config?: SpecdConfig)`, but the actual port interface and resolve-bundle use case use `SkillTemplateContext` instead. The `ResolveBundle` use case collapses `SpecdConfig` into `SkillTemplateContext` before calling the repository.

- ⚠️ Minor discrepancy: The port spec's suggested `getBundle` signature mentions `config?: SpecdConfig` as a separate parameter, but the actual port interface uses `context?: SkillTemplateContext`. The `ResolveBundle` use case acts as the adapter that converts `SpecdConfig` into context variables, so the port interface doesn't need `config` directly. This is a design evolution not reflected in the port spec.

---

## 6. Global Spec Compliance Check

### Architecture (`_global/architecture`)

| Rule                                                      | Status  | Evidence                                                                                                                                                 |
| --------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layered structure (domain / application / infrastructure) | ✅ PASS | Use case in `application/use-cases/`, port in `application/ports/`, domain types in `domain/`                                                            |
| Application layer uses ports only                         | ✅ PASS | Imports `SkillRepository` from `application/ports/` — no infrastructure imports                                                                          |
| Domain layer is pure                                      | ✅ PASS | `SkillBundle`, `SkillTemplateContext` are pure type definitions                                                                                          |
| Manual DI via constructor                                 | ✅ PASS | Constructor receives `repository: SkillRepository`                                                                                                       |
| Stateless = plain function                                | ✅ PASS | `resolveSharedFolder`, `normalizeSharedFolder`, `defaultSharedFolder`, `toRelativeProjectPath` are exported functions in `domain/services`-style pattern |

### Conventions (`_global/conventions`)

| Rule                                | Status  | Evidence                                                                                                    |
| ----------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| ESM imports with `.js` extensions   | ✅ PASS | All imports in `resolve-bundle.ts` use `.js` extensions                                                     |
| Named exports only                  | ✅ PASS | `export class ResolveBundle`, `export interface ResolveBundleInput`, `export interface ResolveBundleOutput` |
| File naming kebab-case              | ✅ PASS | `resolve-bundle.ts`                                                                                         |
| Explicit return types on public API | ✅ PASS | `execute(input: ResolveBundleInput): Promise<ResolveBundleOutput>`                                          |
| No `any` type                       | ✅ PASS | All types are explicit                                                                                      |
| `readonly` preference               | ✅ PASS | All interface properties use `readonly`                                                                     |

### Testing (`_global/testing`)

| Rule                                     | Status     | Evidence                                                                                                                                                             |
| ---------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest used                              | ✅ PASS    | `import { describe, expect, it, vi } from 'vitest'`                                                                                                                  |
| Tests in `test/` directory               | ✅ PASS    | File at `test/resolve-bundle.spec.ts`                                                                                                                                |
| `.spec.ts` suffix                        | ✅ PASS    | `resolve-bundle.spec.ts`                                                                                                                                             |
| Port mocks fully implement               | ✅ PASS    | All 4 methods mocked                                                                                                                                                 |
| No filesystem in unit tests              | ✅ PASS    | All mocks in-memory                                                                                                                                                  |
| No snapshot tests                        | ✅ PASS    | No `toMatchSnapshot` usage                                                                                                                                           |
| Test naming "given..., when..., then..." | ⚠️ PARTIAL | Not all tests follow exact pattern (e.g. line 52: "given a config, when execute is called, then injects built-in variables" — close but uses "injects" not "inject") |

---

## 7. Discrepancies Found

| #   | Severity    | Location                      | Description                                                                                                                                                                                                                                                    |
| --- | ----------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 🔵 MINOR    | `test/resolve-bundle.spec.ts` | Test file lives at `test/resolve-bundle.spec.ts` instead of `test/application/use-cases/resolve-bundle.spec.ts`. Violates `_global/testing` spec: "mirroring the `src/` structure"                                                                             |
| D2  | 🔵 MINOR    | Port spec vs implementation   | `skills:skill-repository-port` spec suggests `getBundle(name, variables?, config?)` but actual port uses `getBundle(name, context?)`. `ResolveBundle` bridges this gap by converting config → context, but the port spec is outdated.                          |
| D3  | 🟡 MODERATE | N/A                           | No end-to-end test verifying frontmatter composition output. The scenario exists in verify.md but no test validates the composed frontmatter block in resulting bundle content. The use case passes data through correctly, but the full scenario is untested. |

---

## 8. Summary

| Category                           | ✅ Pass | ⚠️ Partial                           | ❌ Fail | 🔲 Out of Scope |
| ---------------------------------- | ------- | ------------------------------------ | ------- | --------------- |
| Requirements met by implementation | 10      | 0                                    | 0       | —               |
| Scenarios with tests               | 8       | 1                                    | 0       | 1               |
| Spec dependency compliance         | 3       | 0                                    | 0       | —               |
| Global spec compliance             | 11      | 1                                    | 0       | —               |
| Discrepancies                      | —       | 3 issues found (2 minor, 1 moderate) | —       | —               |

**Overall assessment:** The `skills:resolve-bundle` spec implementation is sound. All 10 behavioural requirements are correctly implemented. Test coverage is strong (8/10 scenarios covered). Two minor structural issues exist (test directory mirroring, port spec documentation drift) and one moderate gap (no end-to-end frontmatter composition test).
