# Change Context

## Purpose

AI agents need a single command to retrieve all relevant context — spec content, project context entries, and step availability — so they can operate on a change without manual assembly. `specd change context <name> <step>` compiles and prints the context block an agent receives when entering a lifecycle step for a named change. Artifact instructions and step hook instructions are separate concerns retrieved via `specd change artifact-instruction` and `specd change hook-instruction` respectively.

## Requirements

### Requirement: Command signature

```
specd change context <name> <step>
  [--rules] [--constraints] [--scenarios]
  [--follow-deps [--depth <n>]]
  [--format text|json|toon]
```

- `<name>` — required positional; the name of the change to compile context for
- `<step>` — required positional; the lifecycle step being entered (e.g. `designing`, `implementing`, `verifying`)
- `--rules` — when present, includes only the rules sections of spec content in the output
- `--constraints` — when present, includes only the constraints sections of spec content in the output
- `--scenarios` — when present, includes only the scenarios sections of spec content in the output
- `--follow-deps` — when present, follows `dependsOn` links from `.specd-metadata.yaml` transitively to discover additional specs. By default (without this flag) `dependsOn` traversal is **not** performed.
- `--depth <n>` — optional; only valid with `--follow-deps`; limits dependency traversal to N levels (1 = direct deps only); defaults to unlimited when `--follow-deps` is passed without `--depth`
- `--format text|json|toon` — optional; output format, defaults to `text`

When none of `--rules`, `--constraints`, or `--scenarios` are passed, all available sections are included. When one or more are passed, only those sections appear in each spec's content block.

### Requirement: Behaviour

The command invokes the `CompileContext` use case. The `CompileContextConfig`, `followDeps`, `depth`, and `sections` fields are populated from the loaded `SpecdConfig` and the corresponding CLI flags.

### Requirement: Output

In `text` or `toon` mode (default `text`), the compiled context block is printed to stdout verbatim. No framing or additional headers are added by the CLI.

In `json` mode, the output is:

```json
{ "contextBlock": "...", "stepAvailable": true, "blockingArtifacts": [], "warnings": [] }
```

where `contextBlock` contains the full compiled context text, `stepAvailable` reflects whether the requested step is currently available, `blockingArtifacts` lists any blocking artifact IDs, and `warnings` lists any warning strings from the use case.

### Requirement: Step availability warning

If the requested step is not currently available (i.e. `stepAvailable: false`), the command prints a warning to stderr listing the blocking artifacts and still prints the context block to stdout. The process exits with code 0.

### Requirement: Context warnings

Any warnings from the `CompileContext` use case (stale metadata, missing specs, unknown workspaces, cycles) are printed to stderr as `warning:` lines. The context block is still printed to stdout and the process exits with code 0.

### Requirement: Error cases

- If the change does not exist, exits with code 1.
- If the schema cannot be resolved, exits with code 3.

## Constraints

- The raw context block is the sole stdout output — no wrapping, no summary header
- All warnings go to stderr; the context block goes to stdout
- `dependsOn` traversal is opt-in via `--follow-deps`; without the flag, deps are not followed
- `--depth` without `--follow-deps` is a CLI usage error (exit code 1)
- Section flags (`--rules`, `--constraints`, `--scenarios`) only filter spec content; available steps are unaffected

## Examples

```
specd change context add-oauth-login designing
specd change context add-oauth-login implementing
specd change context add-oauth-login implementing --rules --constraints
specd change context add-oauth-login implementing --follow-deps --depth 1
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/compile-context/spec.md`](../../core/compile-context/spec.md) — `CompileContext` use case, result shape
- [`specs/core/get-artifact-instruction/spec.md`](../../core/get-artifact-instruction/spec.md) — artifact instructions (separate concern)
- [`specs/core/get-hook-instructions/spec.md`](../../core/get-hook-instructions/spec.md) — step hook instructions (separate concern)
