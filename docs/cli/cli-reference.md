# CLI Reference

The `specd` CLI is the primary interface for managing the spec-driven development workflow. It provides commands for creating and progressing changes, browsing specs, inspecting configuration and schemas, and managing plugins.

## Invocation

```
specd [--config <path>] <command> [options]
```

When `specd` is invoked with no subcommand and a `specd.yaml` is discoverable from the current directory, the project dashboard is shown automatically. If no config is found, the help text is printed instead.

**Global options:**

| Option                      | Description                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `--config <path>`           | Use this config file directly. Skips normal file discovery. Applies to all subcommands.     |
| `--format text\|json\|toon` | Output format. `text` is the default for interactive use; `json` is suitable for scripting. |

**Config discovery** — when `--config` is not given, SpecD walks up from the current working directory looking for `specd.local.yaml`, then `specd.yaml`, stopping at the git repo root. See the [configuration reference](../config/config-reference.md#file-discovery) for the full discovery algorithm.

---

## change

Manage active development changes. A change is the unit of work in SpecD — it tracks which specs are being modified, which artifacts have been produced, and where in the lifecycle the work sits.

### change create

```
specd change create <name> [options]
```

Create a new change and place it in the active changes directory.

`<name>` is a short slug identifying the change. It must be unique among active changes and match the slug conventions of your project (lowercase, hyphens). It becomes part of the change directory name and is used in all subsequent commands that reference this change.

| Option                      | Description                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `--spec <id>`               | Associate a spec with this change. Repeatable — pass multiple `--spec` flags for multiple specs. |
| `--description <text>`      | Short description of the change's intent.                                                        |
| `--format text\|json\|toon` | Output format.                                                                                   |
| `--config <path>`           | Config file path.                                                                                |

```bash
# Create a change for two specs
specd change create add-auth-flow --spec auth/login --spec auth/logout --description "Add login and logout flows"
```

### change list

```
specd change list [options]
```

List all active changes as a table with columns: `NAME`, `STATE`, `SPECS`, `SCHEMA`.

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

### change status

```
specd change status <name> [options]
```

Show the full status of a change: associated specs, artifact file statuses, current lifecycle state, available transitions, and any blockers preventing progression.

`change status` now exposes both the aggregate state of each artifact and the
state of each tracked file inside that artifact. Structured output also includes
a `review` block so agents can route back to designing without reading the
manifest directly. Within that block, `affectedArtifacts[].files[]` is projected
as concrete file entries with `filename`, absolute `path`, and optional
supplemental `key`; consumers should treat the path as the primary jump target.

Artifact and file states:

- `missing`
- `in-progress`
- `complete`
- `skipped`
- `pending-review`
- `drifted-pending-review`

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

### change transition

```
specd change transition <name> <step> [options]
specd change transition <name> --next [options]
```

Transition the change to a new lifecycle state. You can either provide an explicit
`<step>` or use `--next` to resolve the next logical forward transition from the
change's current state.

`--next` currently resolves:

- `drafting -> designing`
- `designing -> ready`
- `ready -> implementing`
- `spec-approved -> implementing`
- `implementing -> verifying`
- `verifying -> done`
- `done -> archivable`

The resolved target still goes through the normal `TransitionChange` flow, so
approval-gate routing, `requires` checks, task completion gating, and hook
execution behave exactly as they do for an explicit target.

`--next` is not available when the next user action is not another lifecycle
transition. In particular:

- `pending-spec-approval` fails with an explanation that human spec approval is pending
- `pending-signoff` fails with an explanation that human signoff is pending
- `archivable` fails with an explanation that archiving is not a lifecycle transition

| Option                      | Description                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `--next`                    | Resolve the next logical lifecycle target from the current state. Mutually exclusive with `<step>`.                |
| `--skip-hooks <phases>`     | Skip hooks at the specified phases. Valid values: `source.pre`, `source.post`, `target.pre`, `target.post`, `all`. |
| `--format text\|json\|toon` | Output format.                                                                                                     |
| `--config <path>`           | Config file path.                                                                                                  |

```bash
# Resolve the next transition automatically
specd change transition add-auth-flow --next

# Transition to implementing, skipping all hooks
specd change transition add-auth-flow implementing --skip-hooks all
```

### change draft

```
specd change draft <name> [options]
```

Shelve the change to the drafts directory. The change is removed from active changes and can be restored later with `drafts restore`. Use this when work needs to be paused without discarding it.

When a change has previously reached the `implementing` state, drafting is blocked by default because the code and specs may be out of sync. Use `--force` to override this guard when you are certain you want to shelve anyway.

| Option                      | Description                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `--reason <text>`           | Reason for shelving. Recorded with the draft.                                                                    |
| `--force`                   | Bypass the historical implementation guard. Required only when the change has previously reached `implementing`. |
| `--format text\|json\|toon` | Output format.                                                                                                   |
| `--config <path>`           | Config file path.                                                                                                |

### change edit

```
specd change edit <name> [options]
```

Edit the spec scope or description of an existing change. At least one of the options below is required.

| Option                      | Description                    |
| --------------------------- | ------------------------------ |
| `--add-spec <id>`           | Add a spec to the change.      |
| `--remove-spec <id>`        | Remove a spec from the change. |
| `--description <text>`      | Update the change description. |
| `--format text\|json\|toon` | Output format.                 |
| `--config <path>`           | Config file path.              |

### change validate

```
specd change validate <name> [specPath] [options]
```

Validate the artifacts for a change. When `<specPath>` is given, validates only the artifacts for that spec. When `--all` is given, validates every spec in the change. When `--artifact` is given, validates only that artifact.

For change-scoped artifacts (e.g., `design`, `tasks`), `<specPath>` can be omitted when using `--artifact` — the command will infer the specPath from the change's first spec.

| Option                      | Description                                     |
| --------------------------- | ----------------------------------------------- |
| `--all`                     | Validate artifacts for all specs in the change. |
| `--artifact <id>`           | Validate only the artifact with this ID.        |
| `--format text\|json\|toon` | Output format.                                  |
| `--config <path>`           | Config file path.                               |

### change approve spec

```
specd change approve spec <name> [options]
```

Record a spec approval for the change. This command is only meaningful when `approvals.spec: true` in `specd.yaml`. It moves the change from `pending-spec-approval` to `spec-approved`, unblocking the `ready → implementing` transition.

| Option                      | Description                    |
| --------------------------- | ------------------------------ |
| `--reason <text>`           | Reason for approval. Required. |
| `--format text\|json\|toon` | Output format.                 |
| `--config <path>`           | Config file path.              |

### change approve signoff

```
specd change approve signoff <name> [options]
```

Record a sign-off for the change. This command is only meaningful when `approvals.signoff: true` in `specd.yaml`. It moves the change from `pending-signoff` to `signed-off`, unblocking the `done → archivable` transition.

| Option                      | Description                    |
| --------------------------- | ------------------------------ |
| `--reason <text>`           | Reason for sign-off. Required. |
| `--format text\|json\|toon` | Output format.                 |
| `--config <path>`           | Config file path.              |

### change context

```
specd change context <name> <step> [options]
```

Compile the context block for a specific lifecycle step of the change. The compiled context is what an agent receives when working on that step — it includes specs, rules, constraints, scenarios, artifact instructions, and hook instructions as applicable.

Rendering mode is controlled by `contextMode` in `specd.yaml` (`list`, `summary`, `full`, `hybrid`; default `summary`). In `text` mode, the first line is always `Context Fingerprint: <sha256...>`. Full spec blocks include an explicit `Mode: full` label. Non-full entries are emitted under `## Available context specs` with explicit mode labels.

The fingerprint follows the compiled logical result, not the presentation format. Flags such as `--follow-deps`, `--depth`, `--rules`, `--constraints`, and `--scenarios` can change the fingerprint when they change the emitted context. Switching only `--format` does not.

When no section flags are provided, a full spec renders all schema artifacts with `scope: spec` in stable order: `spec.md` first when present, then the remaining files alphabetically, each labeled with its filename. When `--rules`, `--constraints`, or `--scenarios` is used, raw file rendering is replaced by metadata-derived section output; for specs in the change, those sections are derived from the merged preview artifacts so delta changes in files like `verify.md` affect the compiled context. In `list` and `summary` modes, section flags are accepted but do not change output shape.

When non-full entries are present, the command prints guidance to use:

`specd change spec-preview <change-name> <specId>`

to inspect merged full content for a specific spec in this change.

| Option                      | Description                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--rules`                   | Include rules extracted from spec metadata (full-mode rendering only).                                                                                              |
| `--constraints`             | Include constraints extracted from spec metadata (full-mode rendering only).                                                                                        |
| `--scenarios`               | Include scenarios extracted from spec metadata (full-mode rendering only).                                                                                          |
| `--include-change-specs`    | Include `change.specIds` as direct context seeds. Default is `false`.                                                                                               |
| `--follow-deps`             | Follow `dependsOn` links and include transitive specs.                                                                                                              |
| `--depth <n>`               | Maximum depth for dependency traversal. Used with `--follow-deps`.                                                                                                  |
| `--fingerprint <hash>`      | Provide a fingerprint to skip context return if unchanged. Returns status "unchanged" without full context. Use for caching to avoid re-fetching identical context. |
| `--format text\|json\|toon` | Output format.                                                                                                                                                      |
| `--config <path>`           | Config file path.                                                                                                                                                   |

If `--fingerprint <hash>` matches the current compiled fingerprint, `text` mode still prints `Context Fingerprint: <sha256...>` first and then `Context unchanged since last call.`. Structured output keeps the fingerprint plus the current step availability, available steps, and warnings, while omitting the full context body.

### change artifacts

```
specd change artifacts <name> [options]
```

Show the artifact files table for a change with columns: `ID`, `FILENAME`, `STATUS`, `EXISTS`. Useful for a quick check on what has been produced and whether files are present on disk.

`change artifacts` emits one row per tracked file. Structured output includes:

- `changeDir` — absolute path to the change directory
- `artifactState` — aggregate parent artifact state
- `fileState` — persisted state of the individual file
- `path` — absolute path to the file row

Delta rows are emitted as supplemental entries with `kind: "delta"` when the
active schema declares `delta: true`.

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

### change skip-artifact

```
specd change skip-artifact <name> <artifactId> [options]
```

Mark an optional artifact as intentionally skipped. A skipped artifact is treated as resolved in `requires` chains — it does not block downstream artifacts or workflow transitions. Only optional artifacts may be skipped.

| Option                      | Description          |
| --------------------------- | -------------------- |
| `--reason <text>`           | Reason for skipping. |
| `--format text\|json\|toon` | Output format.       |
| `--config <path>`           | Config file path.    |

### change deps

```
specd change deps <name> <specId> [options]
```

Manage the `dependsOn` relationships for a spec within a change. At least one of `--add`, `--remove`, or `--set` is required.

| Option                      | Description                                         |
| --------------------------- | --------------------------------------------------- |
| `--add <specId>`            | Add a dependency. Repeatable.                       |
| `--remove <specId>`         | Remove a dependency. Repeatable.                    |
| `--set <specId>`            | Replace all dependencies with this set. Repeatable. |
| `--format text\|json\|toon` | Output format.                                      |
| `--config <path>`           | Config file path.                                   |

### change discard

```
specd change discard <name> [options]
```

Permanently discard a change. The change is moved to the discarded directory and cannot be recovered. Use `change draft` if you want to pause work and resume it later.

When a change has previously reached the `implementing` state, discarding is blocked by default because the code and specs may be out of sync. Use `--force` to override this guard when you are certain you want to discard anyway.

| Option                      | Description                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `--reason <text>`           | Reason for discarding. Required.                                                                                 |
| `--force`                   | Bypass the historical implementation guard. Required only when the change has previously reached `implementing`. |
| `--format text\|json\|toon` | Output format.                                                                                                   |
| `--config <path>`           | Config file path.                                                                                                |

### change check-overlap

```text
specd change check-overlap [<name>] [options]
```

Detect specs targeted by multiple active changes. When `<name>` is given, shows only overlaps involving that change. Without a name, shows all overlaps across all active changes.

Overlap presence does not affect the exit code — the command exits 0 whether or not overlap is detected. Exit code 1 indicates an error (e.g. named change not found).

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

```bash
# Check all active changes for overlap
specd change check-overlap

# Check overlap for a specific change
specd change check-overlap add-auth-flow

# JSON output for scripting
specd change check-overlap --format json
```

### change archive

```
specd change archive <name> [options]
```

Archive a completed change. Scope-`spec` artifacts are synced into the spec repository, and the change is moved to the archive directory. The change must be in the `archivable` state.

If other active changes target the same specs, the archive is blocked by default. Use `--allow-overlap` to proceed despite the overlap.

| Option                      | Description                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| `--skip-hooks <phases>`     | Skip archive hook phases. Valid values: `pre`, `post`, `all`.    |
| `--allow-overlap`           | Permit archiving despite spec overlap with other active changes. |
| `--format text\|json\|toon` | Output format.                                                   |
| `--config <path>`           | Config file path.                                                |

### change run-hooks

```
specd change run-hooks <name> <step> [options]
```

Execute the `run:` hooks defined for a lifecycle step outside of a transition. Useful for re-running hooks after a failure or for manual invocation.

| Option                      | Description                        |
| --------------------------- | ---------------------------------- |
| `--phase pre\|post`         | Which hook phase to run. Required. |
| `--only <hook-id>`          | Run only the hook with this ID.    |
| `--format text\|json\|toon` | Output format.                     |
| `--config <path>`           | Config file path.                  |

### change hook-instruction

```
specd change hook-instruction <name> <step> [options]
```

Print the `instruction:` hook text for a lifecycle step. Returns the instruction content that would be injected into agent context at the specified phase, without executing anything.

| Option                      | Description                                    |
| --------------------------- | ---------------------------------------------- |
| `--phase pre\|post`         | Which hook phase to read. Required.            |
| `--only <hook-id>`          | Return only the instruction from this hook ID. |
| `--format text\|json\|toon` | Output format.                                 |
| `--config <path>`           | Config file path.                              |

### change artifact-instruction

```
specd change artifact-instruction <name> [artifact-id] [options]
```

Print the artifact instructions, rules, and delta guidance for a change. When `[artifact-id]` is given, returns instructions for that specific artifact only. Returns all artifact instructions when omitted.

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

---

## drafts

Manage shelved changes. Drafts are changes that have been paused without being discarded. They retain all their artifact files and can be restored to active changes at any time.

### drafts list

```
specd drafts list [options]
```

List all drafted changes as a table with columns: `NAME`, `STATE`, `DATE`, `BY`, `REASON`.

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

### drafts show

```
specd drafts show <name> [options]
```

Show the details of a specific draft, including its specs, artifacts, and the reason it was shelved.

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

### drafts restore

```
specd drafts restore <name> [options]
```

Restore a draft back to active changes. The change re-enters the `changes` directory in the same state it was in when drafted.

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

---

## discarded

View permanently discarded changes. Discarded changes cannot be recovered.

### discarded list

```
specd discarded list [options]
```

List all discarded changes as a table with columns: `NAME`, `DATE`, `BY`, `REASON`, `SUPERSEDED`.

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

### discarded show

```
specd discarded show <name> [options]
```

Show the details of a specific discarded change.

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

---

## archive

View archived changes. Archived changes are the permanent record of completed work.

### archive list

```
specd archive list [options]
```

List all archived changes as a table with columns: `NAME`, `WORKSPACE`, `DATE`, `BY`.

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

### archive show

```
specd archive show <name> [options]
```

Show the details of a specific archived change.

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

---

## spec

Browse and manage specs. These commands operate on spec files in the spec repository — they do not create or modify changes.

### spec list

```
specd spec list [options]
```

List all specs known to the project.

| Option                       | Description                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--summary`                  | Show a one-line summary per spec instead of the full table.                                                                                |
| `--metadata-status [filter]` | Filter by metadata freshness. Valid values: `fresh`, `stale`, `missing`, `invalid`. Omitting the value shows all with their status column. |
| `--format text\|json\|toon`  | Output format.                                                                                                                             |
| `--config <path>`            | Config file path.                                                                                                                          |

### spec show

```
specd spec show <specPath> [options]
```

Show the full contents of all artifacts in a spec directory. `<specPath>` is the spec identifier (e.g. `auth/login` or `billing:payments/invoicing`).

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

### spec context

```
specd spec context <specPath> [options]
```

Compile the context block for a spec. Useful for inspecting what an agent would receive when asked to work with this spec directly.

Rendering mode is controlled by `contextMode` in `specd.yaml` (`list`, `summary`, `full`, `hybrid`; default `summary`). `hybrid` behaves as `full` for this command. Text output includes per-entry `Mode` and `Source` labels.

| Option                      | Description                                                        |
| --------------------------- | ------------------------------------------------------------------ |
| `--rules`                   | Include rules extracted from spec metadata (full-mode only).       |
| `--constraints`             | Include constraints extracted from spec metadata (full-mode only). |
| `--scenarios`               | Include scenarios extracted from spec metadata (full-mode only).   |
| `--follow-deps`             | Follow `dependsOn` links and include transitive specs.             |
| `--depth <n>`               | Maximum depth for dependency traversal. Used with `--follow-deps`. |
| `--format text\|json\|toon` | Output format.                                                     |
| `--config <path>`           | Config file path.                                                  |

### spec metadata

```
specd spec metadata <specPath> [options]
```

Show the parsed metadata for a spec: title, content hashes, dependency links, and artifact counts. Reads from `metadata.json` if present and fresh; falls back to extraction from artifact content otherwise.

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

### spec resolve-path

```
specd spec resolve-path <path> [options]
```

Resolve a filesystem path to a SpecD spec identifier. Useful when working in a spec directory and needing the canonical identifier to pass to other commands.

```bash
specd spec resolve-path specs/auth/login/spec.md
# → auth/login
```

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

### spec validate

```
specd spec validate [specPath] [options]
```

Validate the artifact files for a spec against the active schema's validation rules. When `<specPath>` is given, validates that spec only. When `--all` is given, validates every spec in the project.

| Option                      | Description                                |
| --------------------------- | ------------------------------------------ |
| `--all`                     | Validate all specs in the project.         |
| `--workspace <name>`        | Validate all specs in the named workspace. |
| `--format text\|json\|toon` | Output format.                             |
| `--config <path>`           | Config file path.                          |

### spec write-metadata

```
specd spec write-metadata <specPath> [options]
```

Write a `metadata.json` file for a spec. By default reads from stdin unless `--input` is given.

| Option                      | Description                                    |
| --------------------------- | ---------------------------------------------- |
| `--input <file>`            | Read metadata from this file instead of stdin. |
| `--force`                   | Overwrite an existing metadata file.           |
| `--format text\|json\|toon` | Output format.                                 |
| `--config <path>`           | Config file path.                              |

### spec invalidate-metadata

```
specd spec invalidate-metadata <specPath> [options]
```

Mark a spec's `metadata.json` as stale. SpecD will fall back to live extraction on next context compilation until the metadata is regenerated.

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

### spec generate-metadata

```
specd spec generate-metadata [specPath] [options]
```

Generate metadata for a spec (or all specs) from the schema rules and artifact content. By default, prints the generated metadata without writing it. Pass `--write` to persist it.

| Option                      | Description                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `--write`                   | Write the generated metadata to `metadata.json`.                                                         |
| `--force`                   | Overwrite existing metadata files when writing.                                                          |
| `--all`                     | Generate metadata for all specs in the project.                                                          |
| `--status <filter>`         | Generate only for specs whose metadata matches this status. Valid values: `stale`, `missing`, `invalid`. |
| `--format text\|json\|toon` | Output format.                                                                                           |
| `--config <path>`           | Config file path.                                                                                        |

```bash
# Regenerate stale and missing metadata across the whole project
specd spec generate-metadata --all --status stale --write
specd spec generate-metadata --all --status missing --write
```

---

## project

Project-level management commands.

### project init

```
specd project init [options]
```

Initialize a new SpecD project in the current directory. When run in a TTY, launches an interactive wizard that prompts for schema, workspace configuration, and agent plugins. When run non-interactively (piped or in CI), all configuration must be supplied via flags.

`project init` creates `specd.yaml`, adds the default storage directories to `.gitignore`, and installs skills for any declared agent plugins.

| Option                      | Description                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `--schema <ref>`            | Schema reference to use (e.g. `@specd/schema-std`).                                    |
| `--workspace <name>`        | Workspace name. Defaults to `default`.                                                 |
| `--workspace-path <path>`   | Path to the specs directory for the workspace.                                         |
| `--agent <id>`              | Install skills for this agent. Repeatable. Valid values: `claude`, `copilot`, `codex`. |
| `--force`                   | Overwrite existing `specd.yaml` if present.                                            |
| `--format text\|json\|toon` | Output format.                                                                         |

```bash
# Non-interactive init with Claude integration
specd project init --schema @specd/schema-std --agent claude
```

### project context

```
specd project context [options]
```

Compile the project-level context block. This is the context an agent receives when asked about the project as a whole, rather than a specific change or spec.

Rendering mode is controlled by `contextMode` in `specd.yaml` (`list`, `summary`, `full`, `hybrid`; default `summary`). `hybrid` behaves as `full` for this command.

| Option                      | Description                                                    |
| --------------------------- | -------------------------------------------------------------- |
| `--rules`                   | Include rules from project-level specs (full-mode only).       |
| `--constraints`             | Include constraints from project-level specs (full-mode only). |
| `--scenarios`               | Include scenarios from project-level specs (full-mode only).   |
| `--follow-deps`             | Follow `dependsOn` links and include transitive specs.         |
| `--depth <n>`               | Maximum depth for dependency traversal.                        |
| `--format text\|json\|toon` | Output format.                                                 |
| `--config <path>`           | Config file path.                                              |

### project update

```
specd project update [options]
```

Update installed agent skills after upgrading SpecD. Reads the `plugins` list from `specd.yaml` and reinstalls skill files for each declared agent.

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

### project dashboard

```text
specd project dashboard [options]
```

Display a project-level dashboard showing schema, workspaces, spec counts, and change activity. Also runs automatically when `specd` is invoked with no subcommand and a config is present (see [Invocation](#invocation)).

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

---

## graph

Index and query the code graph for the workspace.

### graph index

```
specd graph index [options]
```

Indexes workspace source files into the code graph. When a `specd.yaml` is supplied with `--config` or discovered automatically, indexing uses the configured workspaces. When no config is available, or when `--path` is provided, the command enters bootstrap mode and indexes a synthetic `default` workspace rooted at the repository root. Bootstrap mode is intended for initial graph bootstrapping, not normal configured project operation.

| Option                      | Description                                                           |
| --------------------------- | --------------------------------------------------------------------- |
| `--workspace <name>`        | Index only the named workspace.                                       |
| `--force`                   | Recreate the graph backend and run a full re-index.                   |
| `--config <path>`           | Config file path. Mutually exclusive with `--path`.                   |
| `--path <path>`             | Repository root bootstrap path. Ignores any discovered config.        |
| `--exclude-path <pattern>`  | Gitignore-syntax pattern to exclude (repeatable; merges with config). |
| `--format text\|json\|toon` | Output format.                                                        |

#### Config fields: `graph.excludePaths` and `graph.respectGitignore`

Each workspace in `specd.yaml` may declare a `graph` block:

```yaml
workspaces:
  default:
    codeRoot: ./
    graph:
      respectGitignore: true # optional; default: true
      excludePaths: # optional; gitignore-syntax, supports ! negation
        - node_modules/
        - dist/
        - .specd/*
        - '!.specd/metadata/' # re-include .specd/metadata/ despite the wildcard above
```

**`graph.excludePaths`** — when set, replaces the built-in defaults entirely. Patterns follow gitignore syntax and support `!` negation. The built-in defaults are:

```
node_modules/   .git/   .specd/   dist/   build/   coverage/   .next/   .nuxt/
```

**`graph.respectGitignore`** — when `true` (default), `.gitignore` rules are loaded hierarchically and applied with **absolute priority**: no `excludePaths` negation can re-include a file that `.gitignore` excludes. When `false`, `.gitignore` files are not loaded.

#### `--exclude-path` merging

CLI `--exclude-path` flags merge (append) on top of the effective exclusion list — either `graph.excludePaths` from config or the built-in defaults when config is absent. They never reduce the exclusion set. This flag may be repeated:

```
specd graph index --exclude-path "packages/generated/*" --exclude-path "tmp/"
```

#### Shared indexing lock

`graph index` is the writer-side owner of a shared graph CLI lock stored under `{configPath}/graph/index.lock`.

- while this lock is held, `graph search`, `graph hotspots`, `graph stats`, and `graph impact` fail fast before opening the provider
- the user-facing message is: `The code graph is currently being indexed. Try again in a few seconds.`
- the lock is removed when `graph index` exits normally and is also cleaned up on termination signals

---

### graph search

```
specd graph search <query> [options]
```

Search for symbols or specs in the code graph. Context resolution follows the same configured-vs-bootstrap rules as `graph index`.

If a graph index is currently running, this command fails fast with: `The code graph is currently being indexed. Try again in a few seconds.`

| Option                       | Description                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `--symbols`                  | Search only symbols.                                                            |
| `--specs`                    | Search only specs.                                                              |
| `--kind <list>`              | Filter symbol results by comma-separated kinds, for example `class,method`.     |
| `--config <path>`            | Config file path. Mutually exclusive with `--path`.                             |
| `--path <path>`              | Repository root bootstrap path. Ignores any discovered config.                  |
| `--file <path>`              | Restrict symbol results to file paths matching the wildcard pattern.            |
| `--workspace <name>`         | Restrict results to the named workspace.                                        |
| `--exclude-path <pattern>`   | Exclude symbols/specs whose file path matches the wildcard pattern. Repeatable. |
| `--exclude-workspace <name>` | Exclude results from the named workspace. Repeatable.                           |
| `--limit <n>`                | Maximum number of results per category (default: 10).                           |
| `--spec-content`             | Include full spec content in `json` or `toon` output.                           |
| `--format text\|json\|toon`  | Output format.                                                                  |

---

### graph hotspots

```
specd graph hotspots [options]
```

List the most connected symbols in the graph ranked by coupling risk. Context resolution follows the same configured-vs-bootstrap rules as `graph index`.

If a graph index is currently running, this command fails fast with: `The code graph is currently being indexed. Try again in a few seconds.`

| Option                       | Description                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `--workspace <name>`         | Restrict hotspots to the named workspace.                                                                   |
| `--kind <list>`              | Filter hotspots by comma-separated symbol kinds, for example `class,method`. Replaces the default kind set. |
| `--file <path>`              | Restrict hotspots to a file path.                                                                           |
| `--exclude-path <pattern>`   | Exclude symbols whose file path matches the wildcard pattern. Repeatable.                                   |
| `--exclude-workspace <name>` | Exclude hotspots from the named workspace. Repeatable.                                                      |
| `--limit <n>`                | Maximum number of results. When omitted, defaults to `20`.                                                  |
| `--min-score <n>`            | Minimum score threshold. When omitted, defaults to `1`.                                                     |
| `--include-importer-only`    | Include symbols with no direct callers whose score comes only from file importers.                          |
| `--min-risk <level>`         | Minimum risk level to show. When omitted, defaults to `MEDIUM`.                                             |
| `--config <path>`            | Config file path. Mutually exclusive with `--path`.                                                         |
| `--path <path>`              | Repository root bootstrap path. Ignores any discovered config.                                              |
| `--format text\|json\|toon`  | Output format.                                                                                              |

By default, `graph hotspots` shows only `class`, `interface`, `method`, and `function` symbols, applies `min-score=1`, `min-risk=MEDIUM`, and `limit=20`, and excludes importer-only symbols that have no direct callers.

`--kind` accepts a single comma-separated list and validates every token against the supported symbol kinds. Invalid values fail the command before querying the graph. When you pass `--kind`, that list fully replaces the default kind set instead of merging with it.

Overriding `--min-risk`, `--limit`, or `--min-score` does not disable the other defaults. Use `--include-importer-only` when you explicitly want importer-only symbols to appear.

---

### graph stats

```
specd graph stats [options]
```

Print summary statistics for the current code graph. Context resolution follows the same configured-vs-bootstrap rules as `graph index`.

If a graph index is currently running, this command fails fast with: `The code graph is currently being indexed. Try again in a few seconds.`

| Option                      | Description                                                    |
| --------------------------- | -------------------------------------------------------------- |
| `--config <path>`           | Config file path. Mutually exclusive with `--path`.            |
| `--path <path>`             | Repository root bootstrap path. Ignores any discovered config. |
| `--format text\|json\|toon` | Output format.                                                 |

---

### graph impact

```
specd graph impact [options]
```

Analyze the downstream or upstream impact of a symbol or file. Context resolution follows the same configured-vs-bootstrap rules as `graph index`.

If a graph index is currently running, this command fails fast with: `The code graph is currently being indexed. Try again in a few seconds.`

| Option                                   | Description                                                    |
| ---------------------------------------- | -------------------------------------------------------------- |
| `--symbol <name>`                        | Symbol name to analyze.                                        |
| `--file <path>`                          | File path to analyze.                                          |
| `--changes <files...>`                   | Analyze impact of a set of changed files.                      |
| `--direction upstream\|downstream\|both` | Impact direction (default: `upstream`).                        |
| `--depth <n>`                            | Maximum traversal depth (default: `3`).                        |
| `--config <path>`                        | Config file path. Mutually exclusive with `--path`.            |
| `--path <path>`                          | Repository root bootstrap path. Ignores any discovered config. |
| `--format text\|json\|toon`              | Output format.                                                 |

---

## config

Inspect and validate project configuration.

### config show

```
specd config show [options]
```

Print the fully resolved configuration that SpecD has loaded — after local override files are applied and defaults are filled in.

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

---

## schema

Inspect and manage the active schema.

### schema show

```
specd schema show [ref] [options]
```

Display the full definition of a schema, including all artifact types, fields, and extraction rules.

When neither `[ref]` nor `--file` is provided, shows the project's active schema as resolved from `specd.yaml`. When `[ref]` is provided, resolves the referenced schema through the registry (with extends chain, but without project plugins or overrides). When `--file` is provided, resolves the schema from the given file path.

`[ref]` accepts any valid schema reference: npm package (`@specd/schema-std`), workspace-qualified (`#workspace:name`), bare name, or path.

| Option                      | Description                                                                      |
| --------------------------- | -------------------------------------------------------------------------------- |
| `--file <path>`             | Show a schema from a file. Mutually exclusive with `[ref]`.                      |
| `--raw`                     | Show raw schema data without resolving extends, plugins, or overrides.           |
| `--templates`               | Resolve template references and show file content instead of the reference path. |
| `--format text\|json\|toon` | Output format.                                                                   |
| `--config <path>`           | Config file path.                                                                |

```bash
# Show the project's active schema (full output)
specd schema show

# Show with resolved template content
specd schema show --templates

# Show raw schema without resolving extends/plugins/overrides
specd schema show --raw

# Raw with resolved templates
specd schema show --raw --templates

# Show a schema by reference
specd schema show @specd/schema-std

# Show raw data from a referenced schema
specd schema show @specd/schema-std --raw

# Show a schema from a file
specd schema show --file .specd/schemas/my-workflow/schema.yaml
```

### schema fork

```
specd schema fork <ref> <name> [options]
```

Fork a schema by copying `schema.yaml` and `templates/` into the local schemas directory as a fully standalone copy. Forking is appropriate when you need to make structural changes (new artifacts, modified lifecycle steps) that are incompatible with the original schema.

`<ref>` is any valid schema reference (npm package, bare name, workspace-qualified name, or path). `<name>` is the name for the forked schema (required) — used as the directory name and written into the forked `schema.yaml`.

| Option               | Description                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `--workspace <name>` | Target workspace for the forked schema. Defaults to `default`. Mutually exclusive with `--output`.         |
| `--output <path>`    | Explicit target directory. Created recursively if it doesn't exist. Mutually exclusive with `--workspace`. |
| `--config <path>`    | Config file path.                                                                                          |

```bash
# Fork the standard schema into the default workspace's schemasPath
specd schema fork @specd/schema-std my-workflow

# Fork to a specific directory
specd schema fork @specd/schema-std my-workflow --output .specd/schemas/my-workflow
```

After forking, update `specd.yaml` to point `schema:` at the new local name.

### schema extend

```
specd schema extend <ref> <name> [options]
```

Create a new schema that extends an existing one. The extending schema inherits all artifacts and workflow steps from the parent and can add or override entries. Extending is appropriate for lighter customisation — adding hooks, extra artifacts, or `artifactRules` — without duplicating the parent's full definition. Only `schema.yaml` is created — no templates are copied (they are inherited from the parent).

`<ref>` is any valid schema reference. `<name>` is the name for the new schema (required).

| Option               | Description                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `--workspace <name>` | Target workspace. Defaults to `default`. Mutually exclusive with `--output`.                               |
| `--output <path>`    | Explicit target directory. Created recursively if it doesn't exist. Mutually exclusive with `--workspace`. |
| `--config <path>`    | Config file path.                                                                                          |

```bash
# Extend the standard schema
specd schema extend @specd/schema-std my-custom

# Extend to a specific directory
specd schema extend @specd/schema-std my-custom --output .specd/schemas/my-custom
```

### schema validate

```
specd schema validate [ref] [options]
```

Validate a schema against the specd schema format. By default validates the project's active schema (fully resolved with plugins and overrides). Use `[ref]` to validate any schema by reference, `--file` to validate a schema file, or `--raw` to validate the base schema without plugins or overrides.

`[ref]` accepts any valid schema reference: npm package (`@specd/schema-std`), workspace-qualified (`#workspace:name`), bare name, or path. `[ref]`, `--file`, and `--raw` are mutually exclusive.

| Option                      | Description                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `--file <path>`             | Path to a schema file to validate. Mutually exclusive with `[ref]` and `--raw`.                      |
| `--raw`                     | Validate the base schema without plugins or overrides. Mutually exclusive with `[ref]` and `--file`. |
| `--format text\|json\|toon` | Output format.                                                                                       |
| `--config <path>`           | Config file path.                                                                                    |

```bash
# Validate the project's active schema
specd schema validate

# Validate a schema by reference
specd schema validate @specd/schema-std

# Validate a schema file before switching to it
specd schema validate --file .specd/schemas/my-workflow/schema.yaml

# Validate the base schema without plugins or overrides
specd schema validate --raw
```

---

## skills

Manage agent skill files. Skills are instruction files installed into the agent's configuration directory (e.g. `.claude/commands/` for Claude) that give the agent structured guidance for each SpecD workflow operation.

### skills list

```
specd skills list [options]
```

List available skills, optionally filtered by agent.

| Option                      | Description                                                     |
| --------------------------- | --------------------------------------------------------------- |
| `--agent <id>`              | Filter to skills for this agent (`claude`, `copilot`, `codex`). |
| `--format text\|json\|toon` | Output format.                                                  |
| `--config <path>`           | Config file path.                                               |

### skills show

```
specd skills show <name> [options]
```

Print the full content of a skill by name.

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

### skills install

```
specd skills install <name> [options]
```

Install a skill or a set of skills. Pass `all` as the name to install every available skill for the target agent.

| Option                      | Description                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `--agent <id>`              | Target agent (`claude`, `copilot`, `codex`). Required when the skill is available for multiple agents. |
| `--global`                  | Install to the global agent configuration directory rather than the project-local one.                 |
| `--format text\|json\|toon` | Output format.                                                                                         |
| `--config <path>`           | Config file path.                                                                                      |

```bash
# Install all skills for Claude in this project
specd skills install all --agent claude

# Install a specific skill globally
specd skills install change-create --agent claude --global
```

### skills update

```
specd skills update [options]
```

Update all installed skill files to the latest version from the installed SpecD package. Run this after upgrading SpecD.

| Option                      | Description                        |
| --------------------------- | ---------------------------------- |
| `--agent <id>`              | Update skills for this agent only. |
| `--format text\|json\|toon` | Output format.                     |
| `--config <path>`           | Config file path.                  |

---

## Common workflows

### Start a new change

```bash
# Create the change
specd change create add-payment-export --spec billing/payments --description "Add CSV export for invoices"

# Check what artifacts are needed
specd change artifacts add-payment-export

# Once artifacts are produced, check status and available transitions
specd change status add-payment-export

# Transition into implementation
specd change transition add-payment-export implementing
```

### Pause and resume work

```bash
# Shelve to drafts
specd change draft add-payment-export --reason "Blocked pending design review"

# Later, restore it
specd drafts restore add-payment-export
```

### Archive a completed change

```bash
# Confirm the change is in archivable state
specd change status add-payment-export

# Archive — syncs spec artifacts and moves to archive directory
specd change archive add-payment-export
```

### Inspect and validate a spec

```bash
# Validate all artifacts in a spec
specd spec validate auth/login

# See compiled context for a spec (useful for debugging what an agent receives)
specd spec context auth/login --rules --constraints --scenarios
```

### Set up a new project

```bash
# Interactive wizard
specd project init

# Or non-interactive
specd project init --schema @specd/schema-std --agent claude --agent copilot
```

---

## Related documentation

- [Configuration reference](../config/config-reference.md) — `specd.yaml` fields, file discovery, workspace configuration, hooks
- [Schema format reference](../schemas/schema-format.md) — artifact definitions, lifecycle steps, validation rules, delta files
