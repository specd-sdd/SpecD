# Change Context

## Purpose

AI agents need a single command to retrieve all relevant context — spec content, project context entries, and step availability — so they can operate on a change without manual assembly. `specd change context <name> <step>` compiles and prints the context block an agent receives when entering a lifecycle step for a named change. Artifact instructions and step hook instructions are separate concerns retrieved via `specd change artifact-instruction` and `specd change hook-instruction` respectively.

## Requirements

### Requirement: Command signature

```
specd change context <name> <step>
  [--rules] [--constraints] [--scenarios]
  [--follow-deps [--depth <n>]]
  [--fingerprint <hash>]
  [--format text|json|toon]
```

- `<name>` — required positional; the name of the change to compile context for
- `<step>` — required positional; the lifecycle step being entered (e.g. `designing`, `implementing`, `verifying`)
- `--rules` — when present, includes only the rules sections of spec content in the output
- `--constraints` — when present, includes only the constraints sections of spec content in the output
- `--scenarios` — when present, includes only the scenarios sections of spec content in the output
- `--follow-deps` — when present, follows `dependsOn` links from `.specd-metadata.yaml` transitively to discover additional specs. By default (without this flag) `dependsOn` traversal is **not** performed.
- `--depth <n>` — optional; only valid with `--follow-deps`; limits dependency traversal to N levels (1 = direct deps only); defaults to unlimited when `--follow-deps` is passed without `--depth`
- `--fingerprint <hash>` — optional; when provided, the CLI compares this value against the current context fingerprint. If the fingerprint matches, returns `status: "unchanged"` without the full context. If omitted or the fingerprint does not match, returns the full context with the new fingerprint.
- `--format text|json|toon` — optional; output format, defaults to `text`

When none of `--rules`, `--constraints`, or `--scenarios` are passed, all available sections are included. When one or more are passed, only those sections appear in each spec's content block.

### Requirement: Behaviour

The command invokes the `CompileContext` use case. The `CompileContextConfig`, `followDeps`, `depth`, `sections`, and `fingerprint` fields are populated from the loaded `SpecdConfig` and the corresponding CLI flags.

When `--fingerprint` is provided, the CLI first checks whether the provided fingerprint matches the current context fingerprint calculated by `CompileContext`. If they match, the CLI returns a minimal response indicating unchanged status without the full context. If they do not match (or `--fingerprint` is omitted), the CLI returns the full context with the new fingerprint.

### Requirement: Output

The CLI MUST assemble the final output from the structured `CompileContextResult` returned by the use case.

**In `text` or `toon` mode** (default `text`):

1. Project context entries are rendered first, each preceded by its source label (e.g. `**Source: <path>**` for file entries, `**Source: instruction**` for instruction entries). Entries are separated by `---`.
2. Spec content follows under a `## Spec content` header:
   - **Full-mode specs** (`mode: 'full'`) are rendered with their content under a `### Spec: <specId>` heading, as today.
   - **Summary-mode specs** (`mode: 'summary'`) are rendered in a separate section under a `## Available context specs` heading. Each summary spec is listed with its spec ID, title, and description. The section includes an instruction: `Use \`specd spec show <spec-id>\` to load the full content of any spec you need.\`
   - Within each group, specs from `dependsOnTraversal` source MUST be visually distinguished from `includePattern` specs — rendered under a `### Via dependencies` sub-heading within the available context specs section.
3. Available steps are rendered last, each annotated with availability status.

When `--fingerprint` is provided and matches the current fingerprint, text mode outputs only a brief message: `Context unchanged since last call.` The full context is not printed.

No additional framing or headers are added beyond those listed above.

**In `json` mode**, the output is the structured result directly:

```json
{
  "contextFingerprint": "sha256:abc123...",
  "status": "changed",
  "stepAvailable": true,
  "blockingArtifacts": [],
  "projectContext": [
    { "source": "file", "path": "specd-bootstrap.md", "content": "..." },
    { "source": "instruction", "content": "..." }
  ],
  "specs": [
    {
      "specId": "core:core/compile-context",
      "title": "CompileContext",
      "description": "...",
      "source": "specIds",
      "mode": "full",
      "content": "..."
    },
    {
      "specId": "default:_global/architecture",
      "title": "Architecture",
      "description": "...",
      "source": "includePattern",
      "mode": "summary"
    }
  ],
  "availableSteps": [{ "step": "designing", "available": true, "blockingArtifacts": [] }],
  "warnings": []
}
```

When `--fingerprint` is provided and matches, the JSON output still includes metadata fields but omits context content:

```json
{
  "contextFingerprint": "sha256:abc123...",
  "status": "unchanged",
  "stepAvailable": true,
  "blockingArtifacts": [],
  "availableSteps": [
    { "step": "designing", "available": true, "blockingArtifacts": [] },
    { "step": "ready", "available": true, "blockingArtifacts": [] }
  ],
  "warnings": []
}
```

The `projectContext` and `specs` arrays are omitted when `status` is `'unchanged'` — the agent uses its cached values. The `stepAvailable`, `blockingArtifacts`, `availableSteps`, and `warnings` fields are always included so the agent can still determine step availability without fetching the full context.

### Requirement: Step availability warning

If the requested step is not currently available (i.e. `stepAvailable: false`), the command prints a warning to stderr listing the blocking artifacts and still prints the context block to stdout. The process exits with code 0.

### Requirement: Context warnings

Any warnings from the `CompileContext` use case (stale metadata, missing specs, unknown workspaces, cycles) are printed to stderr as `warning:` lines. The context block is still printed to stdout and the process exits with code 0.

### Requirement: Error cases

- If the change does not exist, exits with code 1.
- If the schema cannot be resolved, exits with code 3.

## Constraints

- In text mode, project context entries appear first, then full-mode specs, then summary-mode specs, then available steps
- Summary-mode specs in text output MUST include a note instructing the agent to use `specd spec show <spec-id>` for full content
- Summary-mode specs from `dependsOnTraversal` MUST be rendered under a separate sub-heading from `includePattern` specs
- All warnings go to stderr; the assembled output goes to stdout
- `dependsOn` traversal is opt-in via `--follow-deps`; without the flag, deps are not followed
- `--depth` without `--follow-deps` is a CLI usage error (exit code 1)
- Section flags (`--rules`, `--constraints`, `--scenarios`) only filter full-mode spec content; summary-mode specs and available steps are unaffected
- The fingerprint is calculated from all inputs that affect the logical context content: change specIds, project context entries, context include/exclude patterns, step, schema version, and the flags `--rules`, `--constraints`, `--scenarios`, `--follow-deps`, `--depth`. The `--format` flag does not affect the fingerprint.

## Examples

```
specd change context add-oauth-login designing
specd change context add-oauth-login implementing
specd change context add-oauth-login implementing --rules --constraints
specd change context add-oauth-login implementing --follow-deps --depth 1
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/compile-context/spec.md`](../../core/compile-context/spec.md) — `CompileContext` use case, `CompileContextResult` structured shape, `ContextSpecEntry` type
- [`specs/core/config/spec.md`](../../core/config/spec.md) — `contextMode` field
- [`specs/core/get-artifact-instruction/spec.md`](../../core/get-artifact-instruction/spec.md) — artifact instructions (separate concern)
- [`specs/core/get-hook-instructions/spec.md`](../../core/get-hook-instructions/spec.md) — step hook instructions (separate concern)
