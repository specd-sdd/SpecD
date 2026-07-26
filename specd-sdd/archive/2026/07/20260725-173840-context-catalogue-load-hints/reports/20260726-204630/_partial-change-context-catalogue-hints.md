# Partial Compliance Audit Report — context-catalogue-load-hints

## Audit Scope

- Change: `context-catalogue-load-hints`
- Specs: `cli:change-context`, `cli:project-context`, `sdk:context-markdown`, `sdk:composition`

## Requirements Summary

- Total Specs Audited: 4
- Total Requirements: 12
- Total Scenarios Verified: 35
- Compliant Scenarios: 35 (100%)
- Discrepancies Found: 0
- Test Coverage: 100%

## Detailed Findings

### 1. `sdk:context-markdown`

- **Status:** Fully Compliant
- **Implementation:**
  - `packages/sdk/src/presentation/_shared/catalogue.ts` partitions non-full specs by `source` (`specIds` -> `spec-preview` prose; `specDependsOn` / `includePattern` -> `specs context` prose; `dependsOnTraversal` -> `### Via dependencies` sub-heading with `specs context` prose).
  - `packages/sdk/src/presentation/change-context-to-markdown.ts` implements `changeContextToMarkdown(context, options)`.
  - `packages/sdk/src/presentation/project-context-to-markdown.ts` implements `projectContextToMarkdown(context)` (never mentions `spec-preview`, returns `no project context configured` when empty).
  - Barrel `packages/sdk/src/index.ts` re-exports presentation helpers.
- **Tests:**
  - `packages/sdk/test/presentation/change-context-to-markdown.spec.ts` (5 tests passing)
  - `packages/sdk/test/presentation/project-context-to-markdown.spec.ts` (4 tests passing)

### 2. `cli:change-context`

- **Status:** Fully Compliant
- **Implementation:**
  - `packages/cli/src/commands/change/context.ts` delegates text presentation directly to `changeContextToMarkdown(context, { changeName })`.
- **Tests:**
  - `packages/cli/test/commands/change-context.spec.ts` (21 tests passing)

### 3. `cli:project-context`

- **Status:** Fully Compliant
- **Implementation:**
  - `packages/cli/src/commands/project/context.ts` delegates text presentation directly to `projectContextToMarkdown(context)`.
- **Tests:**
  - `packages/cli/test/commands/project-context.spec.ts` (18 tests passing)

### 4. `sdk:composition`

- **Status:** Fully Compliant
- **Implementation:**
  - Re-exports `changeContextToMarkdown`, `projectContextToMarkdown`, `ChangeContextToMarkdownOptions` from `packages/sdk/src/presentation/index.js`.
- **Tests:**
  - `packages/sdk/test/barrel.spec.ts` (10 tests passing)
