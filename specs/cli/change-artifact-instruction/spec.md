# Change Artifact Instruction

## Purpose

When a skill is creating or modifying an artifact during the designing step, it needs the artifact-specific instructions (instruction, composition rules, delta guidance) separately from the project context. `specd change artifact-instruction` returns this instruction block for a given artifact, allowing skills to retrieve it at the right moment in their workflow — after loading context but before doing the work.

## Requirements

### Requirement: Command signature

```
specd change artifact-instruction <name> [artifact-id] [--format text|json|toon]
```

- `<name>` — required positional; the change name
- `[artifact-id]` — optional positional; the artifact ID from the schema (e.g. `specs`, `verify`, `tasks`). When omitted, the use case auto-resolves the next artifact to work on based on the dependency graph — the first artifact whose `requires` are all satisfied but that is not yet complete
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Delegates to GetArtifactInstruction

The command MUST delegate to the `GetArtifactInstruction` use case. It MUST NOT resolve schemas, collect rules, or generate delta context directly.

### Requirement: Exit code 0 on success

When the artifact is found, the command exits with code 0. When the artifact has no instruction content (all fields are null/empty), the command prints `no instructions` to stdout (text format) or a JSON result with null/empty fields (json/toon format) and exits with code 0.

### Requirement: Exit code 1 on domain errors

The command exits with code 1 for:

- Change not found (`ChangeNotFoundError`)
- Unknown artifact ID (`ArtifactNotFoundError`)
- Schema mismatch (`SchemaMismatchError`)
- No parser registered for the artifact's format (`ParserNotRegisteredError`)

### Requirement: Text output format

When `--format` is `text` (default), the structured result parts are printed with labelled sections. Each non-empty part is printed with a header (`[rules.pre]`, `[instruction]`, `[template]`, `[delta]`, `[rules.post]`), separated by blank lines. Empty parts are omitted. This allows skills to parse sections or consume the full output.

### Requirement: JSON output format

When `--format` is `json` or `toon`, output to stdout:

```json
{
  "result": "ok",
  "artifactId": "<artifact-id>",
  "rulesPre": ["<rule text>"],
  "instruction": "<instruction text>" | null,
  "template": "<resolved template content>" | null,
  "delta": {
    "formatInstructions": "<format guidance>",
    "domainInstructions": "<delta instruction>" | null,
    "outlines": [{ "specId": "<spec-id>", "outline": [...] }]
  } | null,
  "rulesPost": ["<rule text>"]
}
```

## Constraints

- The command is read-only — it never modifies state
- Text output uses labelled section headers (`[rules.pre]`, `[instruction]`, etc.) to separate parts

## Examples

```bash
# Get instruction for the specs artifact
specd change artifact-instruction add-auth specs

# Get instruction for the verify artifact in JSON
specd change artifact-instruction add-auth verify --format json

# Get instruction for tasks (may include delta instructions if delta: true)
specd change artifact-instruction add-auth tasks
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions, `--format` flag
- [`specs/core/get-artifact-instruction/spec.md`](../../core/get-artifact-instruction/spec.md) — `GetArtifactInstruction` use case, result shape
