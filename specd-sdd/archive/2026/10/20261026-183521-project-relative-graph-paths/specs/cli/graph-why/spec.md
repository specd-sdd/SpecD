# Graph Why

## Purpose

When a file is not indexed, or is indexed under an unexpected category, users need the decisive rule without reading `.gitignore`, `specd.yaml` and defaults by hand. `specd graph why <path>` explains, for one path, whether the code graph indexes it and which rule decides each step, by rendering the result of `runGraphWhy`. The command contains no evaluation logic.

## Requirements

### Requirement: Command signature

```text
specd graph why <path> [--config <path> | --path <path>] [--format text|json|toon]
```

- `<path>` is required and is a project-relative path, an absolute path (converted to project-relative), or a workspace-qualified path `workspace:path`.
- `--config <path>` and `--path <path>` and `--format` follow the same graph CLI context model, defaults and mutual exclusion as the other `graph` subcommands.
- The command SHALL obtain its data by calling `runGraphWhy` from `@specd/sdk` inside the standard graph provider wrapper. It MUST NOT import `@specd/code-graph` or `@specd/core` for evaluation.

### Requirement: Text output

In `text` mode the command SHALL print, in order:

1. the `projectRelativePath` and the top-level verdict, with the `owners`;
2. for each candidate workspace: its graph identity, its verdict and, for `indexable`, the category and node kind;
3. under each candidate, one line per step in evaluation order, showing the stage, the outcome, and for a matched rule its pattern, whether it is a negation, and its origin (layer, workspace, configuration key, and for `.gitignore` the file and line);
4. each candidate's `inGraph` status when known;
5. one line per diagnostic.

The text MUST state plainly when a global exclusion prevented a workspace pattern from re-including the path.

### Requirement: Structured output

In `json` and `toon` mode the command SHALL output the `RunGraphWhyResult` unchanged: `input`, `projectRelativePath`, `verdict`, `owners`, `candidates` (each with `workspace`, `identity`, `verdict`, `category`, `kind`, `steps`, `inGraph`), `diagnostics`. Field names and value sets are stable and documented in `docs/cli`.

### Requirement: Exit status

The command exits with status 0 whenever an explanation was produced, whatever the verdict (an explained exclusion is a successful answer). It exits non-zero only for errors: missing configuration, an unknown workspace in a `workspace:path` input, or graph provider failure, rendered through the standard CLI error contract with the `SpecdError` code.

### Requirement: Staleness notice

When the graph is stale, the command SHALL print the same staleness notice as other `graph` subcommands, since `inGraph` may not reflect current configuration, but rule evaluation does not depend on graph freshness.

### Requirement: CLI reference documentation

`docs/cli/cli-reference.md` under `## graph` SHALL document `graph why`: signature, accepted path forms, output fields, an example of an excluded path and of an indexable path, and the project-relative interpretation of configured patterns. The docs CLI index and sidebar MUST include the command, per `default:_global/docs`.

## Constraints

- The command is a thin presenter: no pattern matching, ownership resolution or classification.
- It is read-only: no graph writes and no `specd.yaml` changes.
- It is not exposed through MCP in this change.

## Spec Dependencies

- `sdk:run-graph-why` — SDK orchestration providing the explanation
- `cli:entrypoint` — global CLI contract: config discovery, formats, errors, exit codes
- `core:config` — project-relative path semantics that the explanation describes
