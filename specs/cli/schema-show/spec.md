# Schema Show

## Purpose

Agents entering a new project need to know what artifacts they must produce and in what order, without reading raw schema YAML. The `specd schema show` command prints the active schema's declared artifacts and workflow steps in a structured, human- and machine-readable form.

## Requirements

### Requirement: Command signature

```
specd schema show [--format text|json|toon]
```

- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Output format

In `text` mode (default), the command prints the schema metadata followed by two sections:

```
schema: <name>  version: <N>  kind: <kind>
extends: <ref>  (only if present)
plugins: <count> applied  (only if schemaPlugins is non-empty)

artifacts:
  <id>  <scope>  <optional>  requires=[<id>,...]
  ...

workflow:
  <step>  requires=[<id>,...]
  ...
```

where `<optional>` is `optional` or `required`, and `requires` lists the artifact IDs or step names that must be complete before this entry is available. The `requires` field is omitted when empty.

In `json` or `toon` mode, the output is (encoded in the respective format):

```json
{
  "schema": {"name": "...", "version": N, "kind": "schema", "extends": "..."},
  "plugins": ["@specd/plugin-rfc"],
  "artifacts": [
    {
      "id": "...",
      "scope": "change|spec",
      "optional": false,
      "requires": [],
      "format": "...",
      "delta": false
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

### Requirement: Error cases

- If the schema reference in `specd.yaml` cannot be resolved, exits with code 3.

## Constraints

- This command is read-only
- Artifact `instruction`, `deltaInstruction`, and `validations` are not included in the output — this command focuses on structure, not content

## Examples

```
$ specd schema show
schema: specd-std  version: 1

artifacts:
  proposal   change  optional
  spec       change  required  requires=[proposal]
  tasks      change  required  requires=[spec]

workflow:
  designing     requires=[]
  ready         requires=[spec]
  implementing  requires=[spec]
  verifying     requires=[tasks]

$ specd schema show --format json
{"schema":{"name":"specd-std","version":1},"artifacts":[...],"workflow":[...]}
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/schema-format/spec.md`](../../core/schema-format/spec.md) — schema structure, artifact and workflow declarations
