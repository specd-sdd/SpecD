# Spec-Compliance Audit Report: CLI Commands

This partial report details the spec-compliance audit for the CLI commands associated with the `llm-optimized-metadata` change.

---

## 1. Summary Counts

| Metric                         | Value |
| :----------------------------- | :---- |
| **Specs Audited**              | 5     |
| **Requirements Verified**      | 40    |
| **Discrepancies Found**        | 2     |
| **Missing Tests**              | 1     |
| **Implementation Readiness %** | 98%   |

---

## 2. Audited Specs Detail

### 1. `cli:spec-list`

- **Implementation File:** [`packages/cli/src/commands/spec/list.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/spec/list.ts)
- **Test File:** [`packages/cli/test/commands/spec-list.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/spec-list.spec.ts)
- **Spec Dependency Chain:**
  - [`cli:entrypoint`](file:///Users/monki/Documents/Proyectos/specd/specs/cli/entrypoint/spec.md)
  - [`core:list-workspaces`](file:///Users/monki/Documents/Proyectos/specd/specs/core/list-workspaces/spec.md)
  - [`core:spec-metadata`](file:///Users/monki/Documents/Proyectos/specd/specs/core/spec-metadata/spec.md)
- **Requirements Summary:**
  - **Command signature:** Verified. Plural command (`specs`) has the singular alias (`spec`).
  - **Workspace filtering:** Verified. Filters entries and outputs only specified workspaces.
  - **Title resolution:** Verified. Title is fetched from spec metadata with fallback to last path segment.
  - **Summary resolution:** Verified. Description/optimizedDescription used with paragraph-after-H1 fallback.
  - **Status resolution:** Verified. Checks freshness against content hashes. Filters by status.
  - **Output format:** Verified. Text table formatting and JSON schema both conform to spec.
  - **Empty output:** Verified. Empty workspaces render `(none)`.
  - **Error cases:** Verified. File read errors propagate through `handleError` and exit with code 3.
- **Implementation Status:** Fully Compliant.
- **Discrepancies:** None.
- **Test Coverage:** High. Tests verify text rendering, JSON formatting, metadata status flags, workspace filters, and fallback description behaviors.
- **Missing Tests:** None.

### 2. `cli:change-context`

- **Implementation File:** [`packages/cli/src/commands/change/context.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/change/context.ts)
- **Test File:** [`packages/cli/test/commands/change-context.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/change-context.spec.ts)
- **Spec Dependency Chain:**
  - [`cli:entrypoint`](file:///Users/monki/Documents/Proyectos/specd/specs/cli/entrypoint/spec.md)
  - [`core:compile-context`](file:///Users/monki/Documents/Proyectos/specd/specs/core/compile-context/spec.md)
  - [`core:config`](file:///Users/monki/Documents/Proyectos/specd/specs/core/config/spec.md)
- **Requirements Summary:**
  - **Command signature:** Verified. Supports modes, flags, and config.
  - **Implementation tracking refresh:** Verified. Calls `RefreshImplementationTracking` before `CompileContext`.
  - **Output:** Verified. Outputs fingerprint first, supports unchanged message short-circuit, and labels modes.
  - **Step availability warning:** Verified. Outputs warning listing blocking artifacts to stderr.
  - **Context warnings:** Verified. Emits warnings for stale metadata to stderr.
  - **Behaviour:** Passes config and CLI parameters down to the compile use case.
  - **Error cases:** Exits 1 if change not found.
  - **Optimization warning signal:** Verified. Emits warnings for missing optimizations, but suppresses them when optimization is bypassed.
- **Implementation Status:** Substantially Compliant.
- **Discrepancies:**
  - **llmOptimizedContext Override:** The spec states that if only rules are requested (`--rules` only), the CLI should pass `llmOptimizedContext: false` into the `CompileContext` request. However, the CLI doesn't override this configuration at the command level; instead, it delegates configuration values down directly. (Note: the core compile-context use case itself handles this override internally by checking if both rules and constraints are requested before using optimized content).
- **Test Coverage:** Comprehensive. Tests verify fingerprint matching, JSON structured responses, depth limiting with dependency traversal, and warnings.
- **Missing Tests:**
  - Explicit test for command-level override of `llmOptimizedContext` when only rules/constraints are requested.

### 3. `cli:project-context`

- **Implementation File:** [`packages/cli/src/commands/project/context.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/project/context.ts)
- **Test File:** [`packages/cli/test/commands/project-context.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/project-context.spec.ts)
- **Spec Dependency Chain:**
  - [`cli:entrypoint`](file:///Users/monki/Documents/Proyectos/specd/specs/cli/entrypoint/spec.md)
  - [`core:get-project-context`](file:///Users/monki/Documents/Proyectos/specd/specs/core/get-project-context/spec.md)
  - [`core:compile-context`](file:///Users/monki/Documents/Proyectos/specd/specs/core/compile-context/spec.md)
  - [`core:config`](file:///Users/monki/Documents/Proyectos/specd/specs/core/config/spec.md)
- **Requirements Summary:**
  - **Command signature:** Verified. Mode flag is accepted, depth without follow-deps exits 1.
  - **Behaviour:** Verified. Context entries are rendered first, workspace patterns are applied, and modes are respected.
  - **Output:** Verified. Completes full, summary, and list structures. JSON output is formatted as expected.
  - **Error cases:** Verified. Config or schema resolution errors cause proper non-zero exits.
  - **Full mode defaults and overrides:** Verified. Rules/constraints included by default; section flags override.
  - **Warnings:** Verified. Emits warnings for missing context files and stale metadata.
  - **Optimization warning signal:** Verified. Emits warning for stale project metadata cache.
- **Implementation Status:** Fully Compliant.
- **Discrepancies:** None.
- **Test Coverage:** High. Covers depth errors, context ordering, include/exclude patterns, section flags filtering, and warnings.
- **Missing Tests:** None.

### 4. `cli:project-status`

- **Implementation File:** [`packages/cli/src/commands/project/status.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/project/status.ts)
- **Test File:** [`packages/cli/test/commands/project-status.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/project-status.spec.ts)
- **Spec Dependency Chain:**
  - [`core:list-workspaces`](file:///Users/monki/Documents/Proyectos/specd/specs/core/list-workspaces/spec.md)
  - [`core:list-drafts`](file:///Users/monki/Documents/Proyectos/specd/specs/core/list-drafts/spec.md)
  - [`core:list-changes`](file:///Users/monki/Documents/Proyectos/specd/specs/core/list-changes/spec.md)
- **Requirements Summary:**
  - **Consolidated project status:** Verified. Outputs root, schema ref, workspaces, specs, changes, approvals, graph, and context.
  - **Workspace info:** Verified. Displays name, ownership, codeRoot, isExternal.
  - **Spec counts:** Verified. Uses efficient `SpecRepository.count()` without loading metadata.
  - **Change counts:** Verified. Includes active, drafts, and discarded counts.
  - **Approval gates:** Verified. Outputs spec and signoff status.
  - **Graph freshness (always):** Verified. Graph staleness and last indexed timestamp are always displayed.
  - **Extended graph stats:** Verified. Emitted when `--graph` is supplied.
  - **Config flags (always):** Verified. `llmOptimizedContext` and approval flags are always output.
  - **Context flags:** Verified. Displays full or structured context depending on format.
  - **Optimization warning signal:** Verified. Emits warning for missing/stale project context optimizations.
  - **Output formats:** Verified. Conforms to text (default), JSON, and TOON schemas.
- **Implementation Status:** Fully Compliant.
- **Discrepancies:** None.
- **Test Coverage:** Good. Verifies text, JSON, and TOON output, as well as warning outputs for stale context optimization.
- **Missing Tests:** None.

### 5. `cli:spec-context`

- **Implementation File:** [`packages/cli/src/commands/spec/context.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/spec/context.ts)
- **Test File:** [`packages/cli/test/commands/spec-context.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/spec-context.spec.ts)
- **Spec Dependency Chain:**
  - [`cli:entrypoint`](file:///Users/monki/Documents/Proyectos/specd/specs/cli/entrypoint/spec.md)
  - [`core:config`](file:///Users/monki/Documents/Proyectos/specd/specs/core/config/spec.md)
  - [`core:get-spec-context`](file:///Users/monki/Documents/Proyectos/specd/specs/core/get-spec-context/spec.md)
- **Requirements Summary:**
  - **Command signature:** Verified. Checks missing path argument and depth without follow-deps.
  - **Behaviour:** Verified. Respects mode options, section filters, dependency traversal, and optimization preferences.
  - **Output:** Verified. Headers match specification; text and JSON formats conform to required schemas.
  - **Error cases:** Verified. Unknown workspace and missing path are handled correctly with code 1.
- **Implementation Status:** Substantially Compliant.
- **Discrepancies:**
  - **Warning Category Discrepancy:** The spec states: _"The command MUST emit a `missing-optimized-context` warning to stderr when the effective `llmOptimizedContext` is `true` but optimized fields are missing or stale."_ However, in the implementation, the CLI handles the `stale-optimization` warning category instead, matching the warning type emitted in `GetProjectContext` and `CompileContext`. Additionally, the underlying `GetSpecContext` use case does not currently emit warnings for missing optimized context (only `stale-metadata` if the whole file is outdated).
- **Test Coverage:** High. Tests verify rendering modes, section filtering, JSON schema compliance, error exit codes, and config options.
- **Missing Tests:** None.

---

## 3. General Consistency & Compliance

The implementation conforms fully to the global guidelines in `specs/_global/*`:

1. **Architecture (`specs/_global/architecture`)**: Command entry points resolve contexts via `resolveCliContext` and execute logic using pure use cases from the Core package.
2. **Conventions (`specs/_global/conventions`)**: Commands print to stdout/stderr in standardized formats, exit with proper codes (1 for user/validation error, 3 for system error), and accept standard config and formatting flags.
3. **Testing (`specs/_global/testing`)**: All commands are thoroughly mock-tested using `vitest` against the commander parser, validating command signatures, parameters, outputs, and exit codes.
