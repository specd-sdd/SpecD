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

**In `text` mode** (default):

1. The first rendered line is `Context Fingerprint: <sha256...>`, before any project context or spec content.
2. Project context entries are rendered next, each preceded by its source label (for example `**Source: <path>**` for file entries and `**Source: instruction**` for instruction entries). Entries are separated by `---`.
3. Spec content follows under a `## Spec content` header:
   - **Full-mode specs** (`mode: 'full'`) are rendered under a `### Spec: <specId>` heading and MUST include an explicit mode label in the rendered block so the reader can tell that the spec content is complete without inferring it from layout alone.
   - **Summary-mode specs** (`mode: 'summary'`) are rendered in a separate section under a `## Available context specs` heading. Each summary entry MUST include an explicit mode label showing that it is summary content. The section includes an instruction: `Use \`specd spec show <spec-id>\` to load the full content of any spec you need.\`
   - Mode visibility in text output must not depend on rewriting or trusting the spec title. The reader must be able to identify full versus summary content even when title metadata is absent or incomplete.
   - Within the summary group, specs from `dependsOnTraversal` source MUST be visually distinguished from `includePattern` specs — rendered under a `### Via dependencies` sub-heading within the available context specs section.
4. Available steps are rendered last, each annotated with availability status.

When `--fingerprint` is provided and matches the current fingerprint, text mode still begins with `Context Fingerprint: <sha256...>` and then outputs a brief unchanged message. The full context is not printed.

**In `json` or `toon` mode**, the output is the structured result directly:

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

Any warnings from the `CompileContext` use case (for example stale metadata, missing specs, or unknown workspaces) are printed to stderr as `warning:` lines. The context block is still printed to stdout and the process exits with code 0.

### Requirement: Error cases

- If the change does not exist, exits with code 1.
- If the schema cannot be resolved, exits with code 3.

## Constraints

- In text mode, the first line is `Context Fingerprint: <sha256...>`, before project context entries
- In text mode, project context entries appear before spec entries, and available steps appear last
- Text output MUST label each rendered spec entry explicitly as full or summary content without relying on title rewriting
- Summary-mode specs in text output MUST include a note instructing the agent to use `specd spec show <spec-id>` for full content
- Summary-mode specs from `dependsOnTraversal` MUST be rendered under a separate sub-heading from `includePattern` specs
- All warnings go to stderr; the assembled output goes to stdout
- `dependsOn` traversal is opt-in via `--follow-deps`; without the flag, deps are not followed
- `--depth` without `--follow-deps` is a CLI usage error (exit code 1)
- Section flags (`--rules`, `--constraints`, `--scenarios`) only filter full-mode spec content; summary-mode specs and available steps are unaffected
- The fingerprint is calculated from the complete logical `CompileContext` output emitted by the use case for the selected result-shaping flags. Flags such as `--rules`, `--constraints`, `--scenarios`, `--follow-deps`, and `--depth` affect the fingerprint when they change the logical result. The `--format` flag does not affect the fingerprint.

## Examples

```
specd change context add-oauth-login designing
specd change context add-oauth-login implementing
specd change context add-oauth-login implementing --rules --constraints
specd change context add-oauth-login implementing --follow-deps --depth 1
```

## Spec Dependencies

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:core/compile-context`](../../core/compile-context/spec.md) — `CompileContext` use case, `CompileContextResult` structured shape, `ContextSpecEntry` type
- [`core:core/config`](../../core/config/spec.md) — `contextMode` field
- [`core:core/get-artifact-instruction`](../../core/get-artifact-instruction/spec.md) — artifact instructions (separate concern)
- [`core:core/get-hook-instructions`](../../core/get-hook-instructions/spec.md) — step hook instructions (separate concern)
