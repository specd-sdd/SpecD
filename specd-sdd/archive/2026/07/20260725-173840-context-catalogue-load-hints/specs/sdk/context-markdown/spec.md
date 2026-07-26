# Context Markdown Presentation

## Purpose

Delivery hosts (CLI, MCP, future API/IPC) need a shared, agent-facing markdown rendering of compiled change and project context — including correct drill-down hints — without each host reimplementing catalogue tables and load guidance. This spec defines pure presentation helpers in `@specd/sdk` that turn structured core context results into markdown.

Load hints exist because change-scoped specs (`source: 'specIds'`) may carry deltas or be newly introduced in the change, so they cannot be read correctly via `specs context` (which shows the canonical workspace spec). Those specs MUST be loaded through `changes spec-preview`. All other catalogue specs are canonical and MUST be loaded through `specs context`.

## Requirements

### Requirement: changeContextToMarkdown

`@specd/sdk` MUST export a pure function:

```typescript
function changeContextToMarkdown(
  context: CompileContextResult,
  options: ChangeContextToMarkdownOptions,
): string
```

`ChangeContextToMarkdownOptions` MUST include:

- `changeName` (string, required) — the change name used in `spec-preview` hints
- `includeFingerprint` (boolean, optional, default `true`) — when `true`, emit the fingerprint line

Behaviour:

1. When `context.status` is `'unchanged'`, the function MUST return markdown that includes the fingerprint line (when `includeFingerprint` is true) and exactly the message `Context unchanged since last call.`, and MUST NOT render project context or spec catalogues.
2. When `context.status` is `'changed'`:
   - If `includeFingerprint` is true, the first rendered line MUST be `Context Fingerprint: <context.contextFingerprint>`.
   - Project context entries MUST be rendered next: file entries as `**Source: <path>**` followed by content; instruction entries as `**Source: instruction**` followed by content. Entries MUST be separated by `---`.
   - Specs with `mode: 'full'` MUST be rendered under `## Spec content` with `### Spec: <specId>`, an explicit `Mode: full` label, and `content`.
   - Specs with `mode` other than `'full'` (`summary` or `list`) MUST be rendered under `## Available context specs` according to the catalogue grouping rules below.

### Requirement: Change catalogue grouping and load hints

Under `## Available context specs`, the helper MUST partition catalogue entries (`mode !== 'full'`) by `source` and render them in this order:

1. **Change specs** — `source: 'specIds'`
   - When this group is non-empty, emit this prose (once, above the group's table):
     `Use \`specd changes spec-preview <changeName> <specId>\` to load the merged full content of any change spec you need.`
   - Then a markdown table for that group.
   - Rationale: these specs belong to the change — they may have deltas or be new — so `specs context` cannot show the correct content.

2. **Other context specs** — `source: 'specDependsOn'` or `'includePattern'`
   - When this group **or** the dependency-traversal group is non-empty, emit this prose once (before the first of those tables):
     `Use \`specd specs context <specId>\` to load the full optimized context of any listed spec.`
   - Then a markdown table for this group when non-empty.

3. **Via dependencies** — `source: 'dependsOnTraversal'`
   - When non-empty, render under a `### Via dependencies` sub-heading, then a markdown table.
   - Do not emit a second `specs context` prose line if it was already emitted for group 2.

Omit any empty group entirely. Do not emit the `spec-preview` prose when group 1 is empty. Do not emit the `specs context` prose when groups 2 and 3 are both empty.

The function MUST NOT suggest `spec-preview` for specs whose `source` is not `'specIds'`.

Catalogue table columns:

- `summary` mode: `| Spec ID | Mode | Source | Title | Description |`
- `list` mode: `| Spec ID | Mode | Source |` (omit Title and Description)

The same grouping and hint rules apply whether catalogue entries are `summary` or `list`.

### Requirement: projectContextToMarkdown

`@specd/sdk` MUST export a pure function:

```typescript
function projectContextToMarkdown(context: GetProjectContextResult): string
```

Behaviour:

1. Render `context.contextEntries` first (already pre-rendered strings from the use case), separated by `---`.
2. Specs with `mode: 'full'` under `## Spec content` with `### Spec: <specId>`, `Mode: full`, and content.
3. Specs with `mode` other than `'full'` under `## Available context specs` with this prose (when the catalogue is non-empty):
   `Use \`specd specs context <specId>\` to load the full optimized context of any listed spec.`
4. The function MUST NEVER mention `changes spec-preview` or any change-scoped preview command (project context has no change scope; every listed spec is canonical).
5. When both `contextEntries` and `specs` are empty, the function MUST return exactly `no project context configured`.

Project catalogue table columns:

- `summary` mode: `| Spec ID | Mode | Title | Description |`
- `list` mode: `| Spec ID | Mode |`

### Requirement: Purity and host reuse

Both helpers MUST be synchronous pure functions: no I/O, no kernel access, no process side effects. Hosts MAY call them for text-mode presentation; structured formats (JSON/TOON) remain the host's responsibility to emit from the raw use-case result.

Fingerprint short-circuit comparison remains the responsibility of `CompileContext` (via the caller's `--fingerprint` / `fingerprint` input). The helper only formats whatever `CompileContextResult` it receives — including `status: 'unchanged'`.

### Requirement: Module location

Helpers MUST live under `packages/sdk/src/presentation/` and MUST be re-exported from the SDK public barrel (`src/index.ts`). Shared catalogue/table helpers MAY live in `presentation/` internals but MUST NOT be required exports unless needed by hosts.

## Constraints

- Helpers MUST accept core context types (`CompileContextResult`, `GetProjectContextResult`) already re-exported by `@specd/sdk`.
- Helpers MUST NOT invent optimized content; they only format fields present on the context argument.
- Command strings in hints MUST use plural groups (`changes`, `specs`) for agent-facing guidance.
- This spec MUST NOT declare a dependency on `sdk:composition` — composition exports these helpers; the presentation helpers do not depend on the composition barrel contract.

## Spec Dependencies

- [`core:compile-context`](../../core/compile-context/spec.md) — `CompileContextResult`, `ContextSpecEntry`, `ContextSpecSource`
- [`core:get-project-context`](../../core/get-project-context/spec.md) — `GetProjectContextResult`
