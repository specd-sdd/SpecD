# Design: context-modes-ux

## Affected areas

- `packages/cli/src/commands/project/context.ts`
  Change: Add `--mode` option; implement smart filtering logic; update output rendering to handle structured content for `full` mode.
- `packages/cli/src/commands/change/context.ts`
  Change: Add `--mode` option; ensure section flags filter only the `full` tier in `hybrid` mode; update output rendering.
- `packages/cli/src/commands/spec/context.ts`
  Change: Ignore project `contextMode`; default to `full`; implement new default sections (Description + Rules + Constraints).
- `packages/core/src/application/use-cases/compile-context.ts`
  Change: Modify `_renderFromMetadata` and `execute` to support default sections for `full` mode and header persistence.
- `packages/core/src/application/use-cases/get-spec-context.ts`
  Change: Update `_buildEntry` to implement default sections and header persistence in `full` mode.
- `packages/core/src/application/use-cases/get-project-context.ts`
  Change: Update structured rendering logic to include default sections and header persistence.

## Approach

### 1. Core Logic: Default Sections and Header Persistence

We will centralize the "what sections to show" logic in the Core use cases.

- **Header Persistence**: In `full` mode, the `title` and `description` fields will ALWAYS be included in the `ContextSpecEntry`.
- **Default Sections**: If the `sections` input is `undefined` or empty AND the mode is `full`, the use case will behave as if `sections = ['rules', 'constraints']` was passed, but WITHOUT filtering out the `description`.
- **Structured over Raw**: `CompileContext` and `GetProjectContext` will switch their default `full` mode path from raw markdown concatenation (`_renderSpecFiles`) to structured metadata-based rendering.

### 2. CLI: Explicit Mode and Smart Switching

- **Commander Options**: Add `.option('--mode <mode>', 'display mode (list, summary, full, hybrid)')`.
- **Flag Translation**:
  - In `project context` and `change context`, the `--mode` flag overrides the config value.
  - If `--rules`, `--constraints`, or `--scenarios` are provided, they are passed as the `sections` array to the kernel.
  - In `spec context`, the `mode` passed to the kernel will always be `full` unless explicitly overridden (though `full` is the only sensible mode for inspection).

## Key decisions

- **Decision** → Default `full` mode to structured `Description + Rules + Constraints` instead of raw markdown.
  - **Rationale** → Reduces noise for AI agents and provides a more consistent UX across different commands. Raw markdown can be extremely large and contains information (like examples or internal notes) that isn't always needed for high-level context.
- **Decision** → Header (Title + Description) is immutable in `full` mode.
  - **Rationale** → Ensures that even when filtered, the context entry is self-identifying and explains the purpose of the spec.

## Spec impact

- `cli:cli/project-context`, `cli:cli/change-context`, `cli:cli/spec-context`: Requirements and verification updated to reflect the new flag and rendering rules.
- `core:core/compile-context`, `core:core/get-spec-context`, `core:core/get-project-context`: Requirements updated to enforce structured defaults and header persistence.

## Testing

### Automated tests

- **CLI Command Tests**:
  - Update `packages/cli/test/commands/project/context.test.ts` to verify `--mode` and section defaults.
  - Update `packages/cli/test/commands/change/context.test.ts` to verify tiered filtering in `hybrid` mode.
  - Update `packages/cli/test/commands/spec/context.test.ts` to verify independence from global config.
- **Core Use Case Tests**:
  - Update `packages/core/test/application/use-cases/compile-context.test.ts` for structured `full` mode and header persistence.
  - Update `packages/core/test/application/use-cases/get-spec-context.test.ts` for default sections.
  - Update `packages/core/test/application/use-cases/get-project-context.test.ts` for consistent structured output.

### Manual / E2E verification

1. Run `specd project context --mode full` and verify it shows Description, Rules, and Constraints (no scenarios, no raw markdown).
2. Run `specd project context --rules` and verify it shows Title, Description, and Rules only.
3. Run `specd change context <name> <step> --mode hybrid --rules` and verify change specs are filtered but other specs remain as `summary`.
4. Run `specd spec context <spec-id>` with `contextMode: summary` in `specd.yaml` and verify it still shows full content (Rules/Constraints).
