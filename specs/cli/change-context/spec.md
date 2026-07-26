# Change Context

## Purpose

AI agents need a single command to retrieve relevant working context — spec content and project context entries — so they can operate on a change without manual assembly. `specd change context <name> <step>` compiles and prints the context block an agent receives when entering a lifecycle step for a named change. Lifecycle state and readiness are separate concerns retrieved through `specd change status`; artifact instructions and step hook instructions remain separate concerns retrieved via `specd change artifact-instruction` and `specd change hook-instruction` respectively.

## Requirements

### Requirement: Command signature

```
specd change context <name> <step>
  [--rules] [--constraints] [--scenarios]
  [--include-change-specs]
  [--follow-deps [--depth <n>]]
  [--optimized] [--no-optimized]
  [--fingerprint <hash>]
  [--format text|json|toon]
```

- `<name>` — required positional; the name of the change to compile context for
- `<step>` — required positional; the lifecycle step being entered (e.g. `designing`, `implementing`, `verifying`)
- `--rules` — when present, includes only the rules sections of full-mode spec content in the output
- `--constraints` — when present, includes only the constraints sections of full-mode spec content in the output
- `--scenarios` — when present, includes only the scenarios sections of full-mode spec content in the output
- `--include-change-specs` — when present, directly includes the change's `specIds` in the collected context. By default, direct `specIds` inclusion is disabled; those specs may still appear if selected by include patterns or dependency traversal.
- `--follow-deps` — when present, follows `dependsOn` links from `.specd-metadata.yaml` transitively to discover additional specs. By default (without this flag) `dependsOn` traversal is **not** performed.
- `--depth <n>` — optional; only valid with `--follow-deps`; limits dependency traversal to N levels (1 = direct deps only); defaults to unlimited when `--follow-deps` is passed without `--depth`
- `--optimized` — optional; force prefer optimized context
- `--no-optimized` — optional; suppress preference for optimized context
- `--fingerprint <hash>` — optional; when provided, the CLI compares this value against the current context fingerprint. If the fingerprint matches, returns `status: "unchanged"` without the full context. If omitted or the fingerprint does not match, returns the full context with the new fingerprint.
- `--format text|json|toon` — optional; output format, defaults to `text`

When none of `--rules`, `--constraints`, or `--scenarios` are passed, all available full-mode sections are included. When one or more are passed, only those sections appear in each full-mode spec's content block. Section flags have no effect on list-mode or summary-mode entries.

### Requirement: Optimization warning signal

When `llmOptimizedContext: true` is active, if any spec in the context (or the project context itself) is missing optimized fields or has stale project metadata, the command SHALL surface a warning.

The warning MUST include an instruction on how to generate the missing metadata (e.g., using `specd-spec-metadata` or a project-level equivalent).

For structured formats (`json`, `toon`), the warning state and instructions SHALL be included alongside the context data.

### Requirement: Implementation tracking refresh before context compilation

Before invoking `CompileContext`, the command MUST call `RefreshImplementationTracking` for the same change name.

The CLI MUST NOT invoke `ImplementationDetector` directly and MUST NOT duplicate detection merge logic.

When `--fingerprint` short-circuits the command with an unchanged context response, refresh MUST still run before the fingerprint comparison so tracked implementation state is current for that check.

### Requirement: Behaviour

The command invokes the `CompileContext` use case.

The CLI MUST NOT construct a `CompileContextConfig` object inline from `SpecdConfig`. Yaml-derived context configuration is baked into the kernel-wired `CompileContext` instance at composition time.

The CLI MUST pass only runtime overrides to `CompileContext.execute`:

- `name` and `step` from positional arguments
- `contextMode` from `--mode` or the CLI's effective-mode derivation (section flags may force `hybrid` when yaml default is not `full`/`hybrid`)
- `llmOptimizedContext` only when explicitly resolved via `--optimized` or `--no-optimized` and the resolved value differs from the yaml default (omit the field when it matches the baked default)
- `includeChangeSpecs`, `followDeps`, `depth`, `sections`, and `fingerprint` from the corresponding CLI flags

The effective `llmOptimizedContext` value for explicit CLI overrides is determined as follows:

- If `--no-optimized` is passed, it is `false`.
- If `--optimized` is passed, it is `true`.
- Otherwise, the CLI does not pass `llmOptimizedContext` on `execute` — the baked yaml default applies.

Optimization bypass when only a subset of sections is requested (for example `--rules` without `--constraints`) is enforced by `CompileContext` from the forwarded `sections` input and the baked `llmOptimizedContext` default. The CLI MUST NOT recompute or override `llmOptimizedContext` based on section flags.

When `--include-change-specs` is omitted, the command passes `includeChangeSpecs: false`; the use case does not directly seed `change.specIds`, but those specs may still be included by include patterns or dependency traversal.

When `--fingerprint` is provided, the CLI first checks whether the provided fingerprint matches the current context fingerprint calculated by `CompileContext`. If they match, the CLI returns a minimal response indicating unchanged status without the full context. If they do not match (or `--fingerprint` is omitted), the CLI returns the full context with the new fingerprint.

### Requirement: Output

The CLI MUST obtain the structured `CompileContextResult` from the use case and MUST NOT assemble agent-facing markdown inline.

**In `text` mode** (default):

The CLI MUST call `changeContextToMarkdown(context, { changeName: <name> })` from `@specd/sdk` (passing the `CompileContextResult` as `context`) and print the returned string to stdout. The helper owns fingerprint rendering, project-context formatting, full-spec content, catalogue tables, and source-aware load hints:

- Catalogue entries with `source: 'specIds'` (change-scoped; may have deltas or be new) → guide agents to `specd changes spec-preview <name> <specId>` for merged full content. These MUST NOT be loaded via `specs context`.
- Catalogue entries with any other `source` (canonical specs) → guide agents to `specd specs context <specId>` for optimized context.
- Catalogue layout partitions by hint group: `specIds` table first (with preview prose when non-empty), then other sources with a shared `specs context` prose, with `dependsOnTraversal` under `### Via dependencies`.

Fingerprint comparison remains in `CompileContext`. When `status` is `'unchanged'`, the CLI still calls the helper; the helper emits the fingerprint line plus `Context unchanged since last call.` The CLI MUST NOT assemble that message inline.

**In `json` or `toon` mode**, the output is the structured context-only result directly. List entries include `specId`, `source`, and `mode`. Summary entries additionally include `title` and `description`. Full entries additionally include `content`. The output MUST NOT include lifecycle state, requested-step availability, blocking artifacts, or per-step availability. Structured formats MUST NOT invoke the markdown helper.

### Requirement: Context warnings

Any warnings from the `CompileContext` use case (for example stale metadata, missing specs, or unknown workspaces) are printed to stderr as `warning:` lines. The context block is still printed to stdout and the process exits with code 0.

### Requirement: Error cases

- If the change does not exist, exits with code 1.
- If the schema cannot be resolved, exits with code 3.

## Constraints

- In text mode, rendering MUST come from `changeContextToMarkdown`; the CLI MUST NOT hardcode catalogue hints or markdown tables.
- Catalogue hints MUST be source-aware: `spec-preview` only for change-scoped catalogue entries (`source: 'specIds'`); `specs context` for canonical catalogue entries.
- Section flags apply only to full-mode spec content.
- All warnings go to stderr; the assembled output goes to stdout.
- `dependsOn` traversal is opt-in via `--follow-deps`; without the flag, deps are not followed.
- `--include-change-specs` is opt-in; without the flag, `change.specIds` are not direct seeds.
- `--depth` without `--follow-deps` is a CLI usage error (exit code 1).
- The CLI MUST NOT derive or render lifecycle readiness; callers MUST use `change status` for lifecycle state and blockers.
- Optimization warnings for missing or stale optimized fields are suppressed whenever the effective `llmOptimizedContext` is `false`.

## Examples

```
specd change context add-oauth-login designing
specd change context add-oauth-login implementing
specd change context add-oauth-login implementing --rules --constraints
specd change context add-oauth-login implementing --follow-deps --depth 1
```

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — CLI config discovery, exit codes, and output conventions
- [`cli:change-spec-preview`](../change-spec-preview/spec.md) — merged preview for change specs (`source: specIds`)
- [`sdk:context-markdown`](../../sdk/context-markdown/spec.md) — `changeContextToMarkdown` text presentation
- [`core:compile-context`](../../core/compile-context/spec.md) — `CompileContext` use case, `CompileContextResult` structured shape, `ContextSpecEntry` type
- [`core:config`](../../core/config/spec.md) — project context configuration
- [`core:get-artifact-instruction`](../../core/get-artifact-instruction/spec.md) — separate artifact instruction retrieval
- [`core:get-hook-instructions`](../../core/get-hook-instructions/spec.md) — separate hook instruction retrieval
- [`core:refresh-implementation-tracking`](../../core/refresh-implementation-tracking/spec.md) — VCS-backed refresh before context compilation
