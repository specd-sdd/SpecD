# spec deps

Manage persisted `dependsOn` links in `spec-lock.json`.

## Usage

```bash
specd specs deps list <specPath>
specd specs deps add <specPath> --dep <id>...
specd specs deps remove <specPath> --dep <id>...
specd specs deps set <specPath> [--dep <id>...]
specd specs deps clear <specPath>
specd specs deps suggest [<specPath>] [--spec <id>...] [--all] [--workspace <name>] [--apply] [--create-change] [--rebuild-cache]
```

Each subcommand accepts `--format text|json|toon` (default `text`) and `--config <path>`.

## Rules

- Every subcommand delegates to the `UpdatePersistedSpecDeps` / `GetPersistedSpecDeps` kernel use cases; the CLI performs no persisted-state writes itself.
- `add` appends every supplied `--dep` id; duplicates are ignored by the use case.
- `remove` on an uninitialized spec reports a no-op instead of an error.
- `suggest` traces AST import graphs and barrel re-exports to deduce inter-spec dependencies.
- A cold dependency-suggestion run warms implementation suggestions for every configured spec before analyzing the requested target. On large workspaces this initial dry run can take substantially longer than cached runs; JSON/TOON output is emitted only after analysis completes.
- Inverted `file -> specId` reverse-lookups rank candidate specs deterministically using the tuple `(confirmed, evidenceStrength, workspaceAffinity, capabilitySymbolAffinity, score)`:
  - Confirmed `spec-lock.json` links always win over suggestions.
  - When an imported symbol is known, candidates listing that symbol are narrowed first.
  - Evidence strength ranks fenced (`3`) > inline (`2`) > prose (`1`) > naming-only (`0`).
  - Spec and file sharing a workspace adds workspace affinity.
  - Basename match between capability and symbol kebab-name adds capability affinity.
  - Semantic ties return `null` and drop the candidate edge rather than inventing an arbitrary dependency.
- `suggest --apply` unions suggested dependencies into `spec-lock.json` and runs post-apply validation against the canonical per-spec validation entries.
- If invalid specs exist and `--create-change` is set, the SDK supplies diagnostic exploration content to `CreateChange`; the active change repository decides how to persist it (`FsChangeRepository` uses `.specd-exploration.md`).
- JSON/TOON results expose `postApplyValidation.status`, `invalidSpecs`, the suggested alignment command, and optional created-change metadata without prompting. Validator and mutation failures remain errors and are never reported as `all-valid`.
- Missing lock: `set` / `clear` create incidental state; non-empty `add` creates via initialization; `remove` / empty `add` are no-ops.

## Errors

Validation errors are returned for conflicting flags. `ReadOnlyWorkspaceError` and `ArtifactConflictError` surface on illegal workspace or concurrent writes.
