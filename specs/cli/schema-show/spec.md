# Schema Show

## Purpose

Agents entering a new project need to know what artifacts they must produce and in what order, without reading raw schema YAML. The `specd schema show` command prints the active schema's declared artifacts and workflow steps in a structured, human- and machine-readable form.

## Requirements

### Requirement: Command signature

```
specd schema show [ref] [--file <path>] [--raw] [--templates] [--format text|json|toon]
```

- `[ref]` — optional positional argument; a schema reference in the same format as `specd.yaml`'s `schema` field (e.g. `@specd/schema-std`, `#workspace:name`, `#name`, bare name). Resolved through `SchemaRegistry`.
- `--file <path>` — optional; show a schema from an external file path (absolute or relative to CWD).
- `--raw` — optional; show the schema's parsed YAML data without resolving `extends`, applying `schemaPlugins`, or merging `schemaOverrides`. Displays what the schema file declares on its own. Works with all three modes (project, ref, file).
- `--templates` — optional; resolve template references and show their full file content instead of just the reference path. Compatible with `--raw`.
- `--format text|json|toon` — optional; output format, defaults to `text`.

When neither `[ref]` nor `--file` is provided, the command shows the project's active (configured) schema — the current default behaviour.

`[ref]` and `--file` are mutually exclusive. If both are provided, the command SHALL fail with an error: `[ref] and --file are mutually exclusive`.

### Requirement: Output format

The command SHALL display the **complete** schema definition, not a structural summary.

#### Default mode (resolved schema)

In `json` or `toon` mode, the output SHALL be a faithful serialization of the resolved `Schema` entity — all fields of every artifact, workflow step, and metadata extraction entry — wrapped in an envelope with CLI-specific metadata:

```json
{
  "schema": {"name": "...", "version": N, "kind": "...", "extends": "..."},
  "mode": "project" | "ref" | "file",
  "plugins": ["..."],
  ...all schema fields (artifacts, workflow, metadataExtraction)
}
```

- `mode` (string) — indicates how the schema was resolved: `"project"` for the active schema, `"ref"` when `[ref]` was provided, `"file"` when `--file` was provided.
- `plugins` (string array) — list of applied schema plugins; empty array when mode is `ref` or `file` (plugins are not applied).

Every field present on the `Schema` entity, its artifacts, and its workflow steps SHALL be included in the output. The command SHALL NOT filter, rename, or summarize schema fields — if the schema format adds or removes fields, the output follows automatically.

The `template` field SHALL always be shown. By default it displays the template reference as declared in the schema (e.g. `templates/proposal.md`). When `--templates` is passed, the reference is resolved and replaced with the full template file content.

In `text` mode (default), the command prints the schema metadata followed by sections for artifacts, workflow, and metadata extraction. Each artifact shows all its fields in a readable format. Workflow steps include their hooks. The exact text layout is not prescribed — it SHALL be human-readable and include all the same information as the JSON format.

The `plugins` line is only shown when the project's active schema is displayed (no `[ref]` or `--file`), because plugins and overrides are not applied when resolving by ref or file.

When resolving by `[ref]` or `--file`, the schema is resolved with its extends chain but WITHOUT the project's plugins or overrides. Only the project mode applies plugins and overrides.

#### Raw mode (--raw)

When `--raw` is passed, the command SHALL display the parsed YAML data from the schema file without resolving `extends`, applying `schemaPlugins`, or merging `schemaOverrides`. The output represents what the schema file declares on its own.

In `json` or `toon` mode with `--raw`, the output structure matches the schema YAML structure (as `SchemaYamlData`), not the resolved `Schema` entity format. The `mode` and `plugins` fields are not included — the output is the raw data as-is.

When `--raw --templates` is used, template file references in the raw schema are resolved and replaced with the full file content.

In project mode with `--raw`, the command shows the base schema file's parsed data (the file referenced in `specd.yaml`) without applying extends, plugins, or overrides.

### Requirement: Error cases

- If the schema reference in `specd.yaml` cannot be resolved (project mode), exits with code 3.
- If `[ref]` is provided and the reference cannot be resolved, exits with code 3.
- If `--file` is provided and the file does not exist, exits with code 3.
- If both `[ref]` and `--file` are provided, the command SHALL write an error: `[ref] and --file are mutually exclusive` and exit with code 1.

## Constraints

- This command is read-only.
- The command SHALL NOT filter or rename schema fields — the output is a faithful representation of the schema entity (or raw data in `--raw` mode). The `template` field shows the reference path by default; `--templates` resolves it to file content.

## Examples

```
$ specd schema show
schema: schema-std  version: 1  kind: schema

artifacts:
  proposal   change  required  output=proposal.md
    instruction: Create the proposal document that establishes WHY...
    rules.pre: (none)
    rules.post: open-questions-gate, register-spec-deps
    validations: 2 rules
  ...

workflow:
  designing     requires=[]
    hooks.pre: designing-guidance
    hooks.post: designing-check-global-specs
  ...

metadataExtraction:
  title: specs → heading[depth=1]
  description: specs → section[Purpose] → first paragraph
  ...

$ specd schema show --format json
{"schema":{"name":"schema-std","version":1,"kind":"schema"},"mode":"project","plugins":[],"artifacts":[...],"workflow":[...],"metadataExtraction":{...}}

$ specd schema show --templates
(same as above, but each artifact includes its full template content)

$ specd schema show --raw
(shows parsed YAML data without resolving extends, plugins, or overrides)

$ specd schema show --raw --templates
(raw schema data with template file contents resolved)

$ specd schema show @specd/schema-std --raw
(raw data from the referenced schema package, no extends resolution)
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/schema-format/spec.md`](../../core/schema-format/spec.md) — schema structure, artifact and workflow declarations
