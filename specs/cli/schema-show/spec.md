# Schema Show

## Purpose

Agents entering a new project need to know what artifacts they must produce and in what order, without reading raw schema YAML. The `specd schema show` command prints the active schema's declared artifacts and workflow steps in a structured, human- and machine-readable form.

## Requirements

### Requirement: Command signature

```
specd schema show [ref] [--file <path>] [--format text|json|toon]
```

- `[ref]` — optional positional argument; a schema reference in the same format as `specd.yaml`'s `schema` field (e.g. `@specd/schema-std`, `#workspace:name`, `#name`, bare name). Resolved through `SchemaRegistry`.
- `--file <path>` — optional; show a schema from an external file path (absolute or relative to CWD).
- `--format text|json|toon` — optional; output format, defaults to `text`.

When neither `[ref]` nor `--file` is provided, the command shows the project's active (configured) schema — the current default behaviour.

`[ref]` and `--file` are mutually exclusive. If both are provided, the command SHALL fail with an error: `[ref] and --file are mutually exclusive`.

### Requirement: Output format

In `text` mode (default), the command prints the schema metadata followed by two sections:

```
schema: <name>  version: <N>  kind: <kind>
extends: <ref>  (only if present)
plugins: <count> applied  (only if schemaPlugins is non-empty — project mode only)

artifacts:
  <id>  <scope>  <optional>  requires=[<id>,...]  output=<pattern>  [<description>]
  ...

workflow:
  <step>  requires=[<id>,...]
  ...
```

where `<optional>` is `optional` or `required`, and `requires` lists the artifact IDs or step names that must be complete before this entry is available. The `requires` field is omitted when empty. `output` is always shown. `<description>` is shown in brackets when present.

The `plugins` line is only shown when the project's active schema is displayed (no `[ref]` or `--file`), because plugins and overrides are not applied when resolving by ref or file.

In `json` or `toon` mode, the output is (encoded in the respective format):

```json
{
  "schema": {"name": "...", "version": N, "kind": "schema", "extends": "..."},
  "plugins": ["@specd/plugin-rfc"],
  "mode": "project" | "ref" | "file",
  "artifacts": [
    {
      "id": "...",
      "scope": "change|spec",
      "optional": false,
      "requires": [],
      "format": "...",
      "delta": false,
      "description": "..." | null,
      "output": "...",
      "hasTaskCompletionCheck": false
    }
  ],
  "workflow": [
    {
      "step": "...",
      "requires": []
    }
  ]
}
```

- `mode` (string) — indicates how the schema was resolved: `"project"` for the active schema, `"ref"` when `[ref]` was provided, `"file"` when `--file` was provided
- `plugins` (string array) — list of applied schema plugins; empty array when mode is `ref` or `file` (plugins are not applied)
- `description` (string | null) — human-readable summary of the artifact's purpose; `null` when the schema does not declare one
- `output` (string) — the filename or glob pattern for the artifact's output files (e.g. `"proposal.md"`, `"specs/**/spec.md"`)
- `hasTaskCompletionCheck` (boolean) — `true` when the artifact declares a `taskCompletionCheck` configuration; `false` otherwise

When resolving by `[ref]` or `--file`, the schema is resolved with its extends chain but WITHOUT the project's plugins or overrides. Only the project mode applies plugins and overrides.

### Requirement: Error cases

- If the schema reference in `specd.yaml` cannot be resolved (project mode), exits with code 3.
- If `[ref]` is provided and the reference cannot be resolved, exits with code 3.
- If `--file` is provided and the file does not exist, exits with code 3.
- If both `[ref]` and `--file` are provided, the command SHALL write an error: `[ref] and --file are mutually exclusive` and exit with code 1.

## Constraints

- This command is read-only
- Artifact `instruction`, `deltaInstruction`, `validations`, and `template` are not included in the output — this command focuses on structure, not content

## Examples

```
$ specd schema show
schema: specd-std  version: 1

artifacts:
  proposal   change  optional   output=proposal.md  [Initial proposal outlining why the change is needed]
  spec       change  required   requires=[proposal]  output=specs/**/spec.md
  tasks      change  required   requires=[spec]  output=tasks.md

workflow:
  designing     requires=[]
  ready         requires=[spec]
  implementing  requires=[spec]
  verifying     requires=[tasks]

$ specd schema show @specd/schema-std
schema: specd-std  version: 1
...

$ specd schema show --file ./my-schema.yaml
schema: my-schema  version: 1
...

$ specd schema show --format json
{"schema":{"name":"specd-std","version":1},"mode":"project","plugins":[],"artifacts":[...],"workflow":[...]}

$ specd schema show @specd/schema-std --format json
{"schema":{"name":"specd-std","version":1},"mode":"ref","plugins":[],"artifacts":[...],"workflow":[...]}
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/schema-format/spec.md`](../../core/schema-format/spec.md) — schema structure, artifact and workflow declarations
