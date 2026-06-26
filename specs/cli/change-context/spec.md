# Change Context

## Purpose

AI agents need a single command to retrieve all relevant context — spec content, project context entries, and step availability — so they can operate on a change without manual assembly. `specd change context <name> <step>` compiles and prints the context block an agent receives when entering a lifecycle step for a named change. Artifact instructions and step hook instructions are separate concerns retrieved via `specd change artifact-instruction` and `specd change hook-instruction` respectively.

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

The CLI MUST assemble the final output from the structured `CompileContextResult` returned by the use case.

**In `text` mode** (default):

1. The first rendered line is `Context Fingerprint: <sha256...>`, before any project context or spec content.
2. Project context entries are rendered next, each preceded by its source label (for example `**Source: <path>**` for file entries and `**Source: instruction**` for instruction entries). Entries are separated by `---`.
3. Spec entries follow with explicit mode labels:
   - **Full-mode specs** (`mode: 'full'`) are rendered under a `### Spec: <specId>` heading and MUST include an explicit mode label.
   - **Summary-mode specs** (`mode: 'summary'`) are rendered under `## Available context specs` with spec ID, title, description, source, and an explicit summary label.
   - **List-mode specs** (`mode: 'list'`) are rendered under `## Available context specs` with spec ID, source, and an explicit list label.
   - Non-full sections include this instruction: `Use \`specd change spec-preview <change-name> <specId>\` to load the merged full content of any change spec you need.\`
   - Specs from `dependsOnTraversal` source MUST be visually distinguished from `includePattern` specs.
4. Available steps are rendered last, each annotated with availability status.

When `--fingerprint` is provided and matches the current fingerprint, text mode still begins with `Context Fingerprint: <sha256...>` and then outputs a brief unchanged message. The full context is not printed.

**In `json` or `toon` mode**, the output is the structured result directly. List entries include `specId`, `source`, and `mode`. Summary entries additionally include `title` and `description`. Full entries additionally include `content`.

### Requirement: Step availability warning

If the requested step is not currently available (i.e. `stepAvailable: false`), the command prints a warning to stderr listing the blocking artifacts returned by `CompileContext` and still prints the context block to stdout. The process exits with code 0.

The CLI must treat these fields as projections of core lifecycle interpretation; it MUST NOT re-evaluate workflow readiness independently.

### Requirement: Context warnings

Any warnings from the `CompileContext` use case (for example stale metadata, missing specs, or unknown workspaces) are printed to stderr as `warning:` lines. The context block is still printed to stdout and the process exits with code 0.

### Requirement: Error cases

- If the change does not exist, exits with code 1.
- If the schema cannot be resolved, exits with code 3.

## Constraints

- In text mode, the first line is `Context Fingerprint: <sha256...>`, before project context entries
- In text mode, project context entries appear before spec entries, and available steps appear last
- Text output MUST label each rendered spec entry explicitly as list, summary, or full content without relying on title rewriting
- Non-full specs in text output MUST include a note instructing the agent to use `specd change spec-preview <change-name> <specId>` for merged full content when applicable
- Summary-mode and list-mode specs from `dependsOnTraversal` MUST be rendered under a separate sub-heading from `includePattern` specs
- Section flags apply only to full-mode spec content
- All warnings go to stderr; the assembled output goes to stdout
- `dependsOn` traversal is opt-in via `--follow-deps`; without the flag, deps are not followed
- `--include-change-specs` is opt-in; without the flag, `change.specIds` are not direct seeds
- `--depth` without `--follow-deps` is a CLI usage error (exit code 1)
- `availableSteps`, `stepAvailable`, and `blockingArtifacts` are rendered from `CompileContext` output; the CLI must not re-derive lifecycle readiness locally
- Section flags override `llmOptimizedContext` to `false` unless the combination of requested sections includes both rules and constraints
- Optimization warnings for missing or stale optimized fields are suppressed whenever the effective `llmOptimizedContext` is `false`

## Examples

```
specd change context add-oauth-login designing
specd change context add-oauth-login implementing
specd change context add-oauth-login implementing --rules --constraints
specd change context add-oauth-login implementing --follow-deps --depth 1
```

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — CLI config discovery, exit codes, and output conventions
- [`cli:change-spec-preview`](../change-spec-preview/spec.md) — optional spec preview integration
- [`core:compile-context`](../../core/compile-context/spec.md) — `CompileContext` use case, `CompileContextResult` structured shape, `ContextSpecEntry` type
- [`core:config`](../../core/config/spec.md) — project context configuration
- [`core:get-artifact-instruction`](../../core/get-artifact-instruction/spec.md) — separate artifact instruction retrieval
- [`core:get-hook-instructions`](../../core/get-hook-instructions/spec.md) — separate hook instruction retrieval
- [`core:refresh-implementation-tracking`](../../core/refresh-implementation-tracking/spec.md) — VCS-backed refresh before context compilation
