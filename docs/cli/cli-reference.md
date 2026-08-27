# CLI Reference

The `specd` CLI is the primary interface for managing the spec-driven development workflow. It provides commands for creating and progressing changes, browsing specs, inspecting configuration and schemas, and managing plugins.

## Invocation

```
specd [--config <path>] [-v|--verbose] <command> [options]
```

When `specd` is invoked with no subcommand and a `specd.yaml` is discoverable from the current directory, the project dashboard is shown automatically. If no config is found, the help text is printed instead.

**Global options:**

| Option                      | Description                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `--config <path>`           | Use this config file directly. Skips normal file discovery. Applies to all subcommands.     |
| `-v, --verbose`             | Increase console logging verbosity. Repeat (`-vv`) for trace-level output.                  |
| `--format text\|json\|toon` | Output format. `text` is the default for interactive use; `json` is suitable for scripting. |

**Config discovery** — when `--config` is not given, SpecD walks up from the current working directory looking for `specd.local.yaml`, then `specd.yaml`, stopping at the active VCS root. See the [configuration reference](../config/config-reference.md#file-discovery) for the full discovery algorithm.

---

## change

Manage active development changes. A change is the unit of work in SpecD — it tracks which specs are being modified, which artifacts have been produced, and where in the lifecycle the work sits.

### change create

```
specd changes create <name> [options]
```

Create a new change and place it in the active changes directory.

`<name>` is a short slug identifying the change. It must be unique among active changes and match the slug conventions of your project (lowercase, hyphens). It becomes part of the change directory name and is used in all subsequent commands that reference this change.

| Option                      | Description                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `--spec <id>`               | Associate a spec with this change. Repeatable — pass multiple `--spec` flags for multiple specs. |
| `--description <text>`      | Short description of the change's intent.                                                        |
| `--invalidation-policy <p>` | Set the invalidation policy (`none\|surgical\|downstream\|global`). Defaults to `downstream`.    |
| `--format text\|json\|toon` | Output format.                                                                                   |
| `--config <path>`           | Config file path.                                                                                |

```bash
# Create a change for two specs
specd changes create add-auth-flow --spec auth/login --spec auth/logout --description "Add login and logout flows"
```

### change list

```
specd changes list [options]
```

List all active changes as a table with columns: `NAME`, `STATE`, `SPECS`, `SCHEMA`.

| Option                      | Description                                                          |
| --------------------------- | -------------------------------------------------------------------- |
| `--limit <n>`               | Maximum entries to return (default **100**; use `all` for no limit). |
| `--page <p>`                | 1-based page number (mutually exclusive with `--after-*`).           |
| `--after-key <key>`         | Exclusive keyset cursor sort key.                                    |
| `--after-id <id>`           | Tiebreak id when used with `--after-key`.                            |
| `--description`             | Include change description as a dim sub-row per entry.               |
| `--format text\|json\|toon` | Output format. JSON/TOON return `{ items, meta }`.                   |
| `--config <path>`           | Config file path.                                                    |

When the returned page is incomplete, text mode appends a truncation hint:

```
showing <count> of <total> (use --limit/--page)
```

### change status

```
specd changes status <name> [options]
```

Show the full status of a change: associated specs, artifact file statuses, current lifecycle state, available transitions, and any blockers preventing progression.

`changes status` provides high-visibility diagnostics including:

- **Artifact DAG**: An ASCII tree rendering of the artifact dependency hierarchy, showing the status and scope of each artifact.
- **Blockers**: A dedicated section listing explicit conditions preventing progress (e.g. `ARTIFACT_DRIFT`, `MISSING_ARTIFACT`).
- **Next Action**: A direct recommendation of the next step to take, including the suggested command and rationale.

It also exposes both the aggregate state of each artifact and the state of each tracked file inside that artifact. Structured output includes an `artifactDag` array for structural analysis and a `review` block for identifying artifacts that require attention.

In JSON mode, the output includes a `nextAction` object and a `blockers` array. A top-level `approvalGates` object reports whether spec approval and signoff approval are enabled in the project config.

Artifact and file states:

- `missing`
- `in-progress`
- `complete`
- `skipped`
- `pending-review`
- `drifted-pending-review` (validated content changed on disk)
- `pending-parent-artifact-review` (blocked by upstream review)

The text output renders a **display status** column that extends canonical state with `complete-with-drift` — shown when a file is canonically `complete` but its drift flag is set (meaning the baseline was validated, then the file changed, and it was re-validated against the new content). A `[drift]` indicator appears next to files that have drifted from their validated baseline.

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

### change transition

```
specd changes transition <name> <step> [options]
specd changes transition <name> --next [options]
```

Transition the change to a new lifecycle state. You can either provide an explicit
`<step>` or use `--next` to resolve the next logical forward transition from the
change's current state.

When a transition fails (e.g. due to missing artifacts or drifted content), the command renders a **Repair Guide** to stdout, providing the blocker codes and a recommended next command to resolve the issue.

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

When transition hooks run, `change transition` uses the same hook-progress
presentation as `change run-hooks`:

- In `text` format, completed hooks stay visible, the active hook shows a
  running state, recent output remains visible, and quiet hooks still emit
  liveness updates.
- In `json` and `toon`, all machine-readable output is emitted on `stdout` as a
  newline-delimited stream of structured records. Hook events use
  `stream: "hook-progress"`. Transition lifecycle events use
  `stream: "change-transition"`. The final result is emitted as a terminal
  `complete` event in that same stream. `stderr` is reserved for text-mode
  progress and non-structured process diagnostics.

| Option                      | Description                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `--next`                    | Resolve the next logical lifecycle target from the current state. Mutually exclusive with `<step>`.                |
| `--skip-hooks <phases>`     | Skip hooks at the specified phases. Valid values: `source.pre`, `source.post`, `target.pre`, `target.post`, `all`. |
| `--format text\|json\|toon` | Output format.                                                                                                     |
| `--config <path>`           | Config file path.                                                                                                  |

```bash
# Resolve the next transition automatically
specd changes transition add-auth-flow --next

# Transition to implementing, skipping all hooks
specd changes transition add-auth-flow implementing --skip-hooks all
```

### change draft

```
specd changes draft <name> [options]
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
specd changes edit <name> [options]
```

Edit the spec scope or description of an existing change. At least one of the options below is required.

| Option                      | Description                                                            |
| --------------------------- | ---------------------------------------------------------------------- |
| `--add-spec <id>`           | Add a spec to the change.                                              |
| `--remove-spec <id>`        | Remove a spec from the change.                                         |
| `--description <text>`      | Update the change description.                                         |
| `--invalidation-policy <p>` | Change the invalidation policy (`none\|surgical\|downstream\|global`). |
| `--format text\|json\|toon` | Output format.                                                         |
| `--config <path>`           | Config file path.                                                      |

### change validate

```
specd changes validate <name> [specPath] [options]
```

Validate the artifacts for a change against the active schema, reporting structural
violations and marking passing artifacts as complete. This is a structural and
lifecycle-state validation step; it does not approve semantic content quality,
requirement intent, or implementation correctness.

For change-scoped artifacts (e.g. `design`, `tasks`), `<specPath>` can be omitted when using `--artifact` — the command will infer the specPath from the change's first spec.

Text output includes per-file status lines:

- `file: <path>` for expected files that were validated or skipped
- `missing: <path>` for expected files that were required but absent
- `note: <artifactId> — <description>` for non-blocking optimization hints (e.g. AST/Delta suggestions)

When validating spec-scoped artifacts, text output appends a preview hint:

`note: verify merged output with: specd changes spec-preview <change> <specId>`

When validating a single spec-scoped artifact (`--artifact <id>` where scope is `spec`),
the preview hint includes the same artifact filter:

`note: verify merged output with: specd changes spec-preview <change> <specId> --artifact <id>`

For change-scoped artifacts (for example `design`, `tasks`), no preview hint is emitted.

Use that preview hint when reviewing spec or verification deltas, especially when
overlap, drift, or stale-base risk exists. Raw delta files are not a substitute for
reviewing the merged output that would be archived.

Structured output (`json` / `toon`) includes a `notes` array for non-blocking hints and a `files` array for each result entry.

#### Batch mode (`--all`)

With `--all`, validation walks the active schema artifact DAG in topological order (parents before children). Change-scoped artifacts (`scope: change`, e.g. `proposal`, `design`, `tasks`) are validated once per batch step. Spec-scoped artifacts (`scope: spec`, e.g. `specs`, `verify`) are validated once per `(artifact, specId)` pair. `--artifact <id>` filters steps but keeps the same DAG walk order.

Within each `ValidateArtifacts` execution, files already marked `complete` or `skipped` are not re-read or re-marked; drifted or review-pending files are still validated.

Text output uses one block per batch step, for example:

- `validated <change>/<specId> [artifact:<id>]: ...` for spec-scoped steps
- `validated <change> [artifact:<id>]: ...` for change-scoped steps

The closing summary reports `validated <passed>/<total> steps` (not `validated N/M specs`).

JSON / TOON batch output shape:

```json
{
  "passed": true,
  "total": 3,
  "results": [
    {
      "spec": null,
      "artifact": "proposal",
      "passed": true,
      "failures": [],
      "notes": [],
      "files": []
    },
    {
      "spec": "default:auth/login",
      "artifact": "specs",
      "passed": true,
      "failures": [],
      "notes": [],
      "files": []
    }
  ]
}
```

`spec` is `null` for change-scoped steps. Each `results[]` entry includes the same `files`, `failures`, and `notes` fields as single-spec validation.

Dependency-blocked failures are status-aware. When validation is blocked by an upstream artifact, the failure description includes the blocking dependency status (for example `missing`, `in-progress`, `pending-review`, `drifted-pending-review`, or `pending-parent-artifact-review`). For recursive review propagation, parent blocker context is also included.

| Option                      | Description                                     |
| --------------------------- | ----------------------------------------------- |
| `--all`                     | Validate artifacts for all specs in the change. |
| `--artifact <id>`           | Validate only the artifact with this ID.        |
| `--format text\|json\|toon` | Output format.                                  |
| `--config <path>`           | Config file path.                               |

### change approve spec

```
specd changes approve spec <name> [options]
```

Record a spec approval for the change. This command is only meaningful when `approvals.spec: true` in `specd.yaml`. It moves the change from `pending-spec-approval` to `spec-approved`, unblocking the `ready → implementing` transition.

| Option                      | Description                    |
| --------------------------- | ------------------------------ |
| `--reason <text>`           | Reason for approval. Required. |
| `--format text\|json\|toon` | Output format.                 |
| `--config <path>`           | Config file path.              |

### change approve signoff

```
specd changes approve signoff <name> [options]
```

Record a sign-off for the change. This command is only meaningful when `approvals.signoff: true` in `specd.yaml`. It moves the change from `pending-signoff` to `signed-off`, unblocking the `done → archivable` transition.

| Option                      | Description                    |
| --------------------------- | ------------------------------ |
| `--reason <text>`           | Reason for sign-off. Required. |
| `--format text\|json\|toon` | Output format.                 |
| `--config <path>`           | Config file path.              |

### change context

```
specd changes context <name> <step> [options]
```

Compile the context block for a specific lifecycle step of the change. The compiled context is what an agent receives when working on that step — it includes specs, rules, constraints, scenarios, artifact instructions, and hook instructions as applicable.

Rendering mode is controlled by `contextMode` in `specd.yaml` (`list`, `summary`, `full`, `hybrid`; default `summary`). In `text` mode, the first line is always `Context Fingerprint: <sha256...>`. Full spec blocks include an explicit `Mode: full` label. Non-full entries are emitted under `## Available context specs` with explicit mode labels.

The fingerprint follows the compiled logical result, not the presentation format. Flags such as `--follow-deps`, `--depth`, `--rules`, `--constraints`, and `--scenarios` can change the fingerprint when they change the emitted context. Switching only `--format` does not.

When no section flags are provided, a full spec renders all schema artifacts with `scope: spec` in stable order: `spec.md` first when present, then the remaining files alphabetically, each labeled with its filename. When `--rules`, `--constraints`, or `--scenarios` is used, raw file rendering is replaced by metadata-derived section output; for specs in the change, those sections are derived from the merged preview artifacts so delta changes in files like `verify.md` affect the compiled context. In `list` and `summary` modes, section flags are accepted but do not change output shape.

When non-full entries are present, the command partitions them by source and prints drill-down guidance: `specd changes spec-preview <change-name> <specId>` for change-scoped specs (`source: 'specIds'`), and `specd specs context <specId>` for canonical workspace specs (`source: 'specDependsOn'`, `'includePattern'`, or `'dependsOnTraversal'`).

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

`change status` also renders implementation tracking when the change has tracked files or confirmed links. Pass `--implementation` to request the full SDK-built implementation-review projection. The implementation block shows tracked files grouped by `open`, `resolved`, `ignored`, and `removed`, then confirmed links with their symbol-resolution outcome.

Symbol links use the same projection as `changes implementation list` and `review`:
`resolved`, `ambiguous`, `unresolved`, or `missing`, accompanied by a stable reason
code, graph health and relevant coverage, canonical target, candidates, and proven
resolution path. File-only links bypass symbol resolution. If the graph is unavailable,
the command reports that condition; storage/generation failures remain command errors.

### change implementation

```
specd changes implementation <subcommand> <name> [options]
```

Review or mutate implementation tracking for an active change. Paths are always raw project-relative paths while the change is active; canonical `workspace:path` identities are only materialized during archive.

Available subcommands:

- `start` — explicitly activate implementation tracking for a change
- `list` — show tracked files and confirmed links
- `review` — show tracked files, confirmed links, stale symbol diagnostics, and out-of-scope sidecar preview
- `add` — create or enrich a confirmed implementation link
- `remove` — remove a file-level link or specific symbols
- `ignore` — mark a tracked file as ignored (already-tracked missing files may be ignored)
- `resolve` — mark a tracked file as reviewed/resolved
- `unresolve` — reopen a resolved file back to `open`

`list` and `review` use one delivery-neutral SDK projection. For symbol links they
report the original stored file and symbol plus:

- `status`: `resolved`, `ambiguous`, `unresolved`, or `missing`
- `reasonCode`: a stable machine-readable explanation
- graph health and the addressed target's index coverage
- the canonical logical target and its declaration occurrences when proven
- all deterministic candidates and the ordered resolution path

`resolved` means exactly one target is proven. `ambiguous` preserves all competing
targets without selecting one. `unresolved` covers stale/dirty graph state, excluded,
unsupported, partial or parse-failed coverage, missing build context, and runtime-only
behavior. `missing` is reserved for absence proven by current targeted file evidence
and complete coverage. Staleness remains a health/input dimension rather than a symbol
status. Reason-code families include `GRAPH_*`, `COVERAGE_*`, `REFERENCE_*`,
`AMBIGUOUS_*`, and `RUNTIME_UNSUPPORTED`.

Review is read-only: it never rewrites tracked file paths, stored symbol strings,
implementation sidecars, or the change manifest. Resolution is deterministic and
does not fall back to fuzzy, rightmost-member, or same-name candidate selection.

Tracked file states: `open`, `resolved`, `ignored`, `removed`. The `removed` state is assigned automatically by `refresh` when a tracked file no longer exists on disk; it cannot be set manually. Files in the `removed` state are excluded from `unresolve` — only a subsequent `refresh` can restore them to `open` if they reappear.

File existence validation is performed by the core use case, not the CLI. The CLI delegates all validation and rejects operations with appropriate errors (`ImplementationFileNotFoundError`) when the target file does not exist on disk.

`resolve` and `unresolve` operate on tracked-file review state only. They do not create new tracked entries, and `resolve` cannot be used to promote an untracked file directly to `resolved`.

The `ignore` action is an exception: files that are already tracked (including those missing from disk) may be ignored without an existence check. Untracked files must exist on disk before they can be ignored.

Examples:

```bash
specd changes implementation start my-change
specd changes implementation list my-change
specd changes implementation add my-change --spec core:change --file packages/core/src/domain/entities/change.ts
specd changes implementation add my-change --spec core:change --file packages/core/src/domain/entities/change.ts --symbol Change.transition
specd changes implementation resolve my-change --file packages/core/src/domain/entities/change.ts
specd changes implementation unresolve my-change --file packages/core/src/domain/entities/change.ts
```

### change artifacts

```
specd changes artifacts <name> [options]
```

Show the artifact files table for a change with columns: `ID`, `STATUS`, `EXISTS`. Useful for a quick check on what has been produced and whether files are present on disk.

The `STATUS` column shows the **display status** — a human-facing state that extends canonical artifact state with `complete-with-drift` for files that are canonically complete but have drifted from their validated baseline. A `[drift]` indicator appears next to files whose drift flag is set.

`changes artifacts` emits one row per tracked file. Structured output includes:

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
specd changes skip-artifact <name> <artifactId> [options]
```

Mark an optional artifact as intentionally skipped. A skipped artifact is treated as resolved in `requires` chains — it does not block downstream artifacts or workflow transitions. Only optional artifacts may be skipped.

| Option                      | Description          |
| --------------------------- | -------------------- |
| `--reason <text>`           | Reason for skipping. |
| `--format text\|json\|toon` | Output format.       |
| `--config <path>`           | Config file path.    |

### change invalidate

```
specd changes invalidate <name> --reason <text> [options]
```

Invalidate a change and return it to `designing`, optionally targeting specific artifacts for review. This is the manual invalidation entry point — it records an `invalidated` history event, transitions the change back to `designing` (if not already there), and reopens targeted artifacts for review.

The **invalidation policy** controls how artifact reopening propagates:

| Policy       | Behaviour                                                               |
| ------------ | ----------------------------------------------------------------------- |
| `none`       | No artifacts are reopened. The change transitions to `designing` only.  |
| `surgical`   | Only the explicitly targeted files are reopened.                        |
| `downstream` | Targets plus all DAG descendants are reopened. This is the **default**. |
| `global`     | Every artifact in the change is reopened.                               |

Targets are specified with `--target <artifactId>` or `--target <artifactId>@<specId>` for spec-scoped artifacts. The `@specId` syntax is only valid for artifacts with `scope: spec`.

When a change has an active spec approval or signoff, invalidation is blocked unless `--force` is passed. This prevents accidentally invalidating an approved change.

Text output shows the change name, state, effective policy, and an `affected:` section listing each reopened file grouped by artifact with its expansion label (`downstream`, `global`).

| Option                      | Description                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `--reason <text>`           | Mandatory explanation for the invalidation.                                                                    |
| `--target <target>`         | Target an artifact or artifact file (repeatable). Use `artifactId` or `artifactId@specId`.                     |
| `--policy <policy>`         | Override the change's persisted invalidation policy for this execution (`none\|surgical\|downstream\|global`). |
| `--force`                   | Bypass the approval/signoff guard.                                                                             |
| `--format text\|json\|toon` | Output format.                                                                                                 |
| `--config <path>`           | Config file path.                                                                                              |

```bash
# Invalidate specific artifacts with downstream propagation
specd changes invalidate my-change --reason "Revisit design after API change" --target design

# Invalidate a spec-scoped artifact file
specd changes invalidate my-change --reason "Update specs" --target specs@auth/login

# Override policy to surgical (only targeted files)
specd changes invalidate my-change --reason "Minor fix" --target tasks --policy surgical
```

### change deps

```
specd changes deps <name> <specId> [options]
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
specd changes discard <name> [options]
```

Permanently discard a change. The change is moved to the discarded directory and cannot be recovered. Use `changes draft` if you want to pause work and resume it later.

When a change has previously reached the `implementing` state, discarding is blocked by default because the code and specs may be out of sync. Use `--force` to override this guard when you are certain you want to discard anyway.

| Option                      | Description                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `--reason <text>`           | Reason for discarding. Required.                                                                                 |
| `--force`                   | Bypass the historical implementation guard. Required only when the change has previously reached `implementing`. |
| `--format text\|json\|toon` | Output format.                                                                                                   |
| `--config <path>`           | Config file path.                                                                                                |

### change check-overlap

```text
specd changes check-overlap [<name>] [options]
```

Detect specs targeted by multiple active changes. When `<name>` is given, shows only overlaps involving that change. Without a name, shows all overlaps across all active changes.

Overlap presence does not affect the exit code — the command exits 0 whether or not overlap is detected. Exit code 1 indicates an error (e.g. named change not found).

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

```bash
# Check all active changes for overlap
specd changes check-overlap

# Check overlap for a specific change
specd changes check-overlap add-auth-flow

# JSON output for scripting
specd changes check-overlap --format json
```

### change archive

```
specd changes archive <name> [options]
```

Archive a completed change. Scope-`spec` artifacts are synced into the spec repository, and the change is moved to the archive directory. The change must be in the `archivable` state.

While archive runs, the change remains `archivable` through guards, pre-archive hooks, orphan detection, and preflight. It transitions to `archiving` immediately before canonical publication. On commit-phase failure, batch restore may return the change to `archivable` (retry) or leave it in `archiving` (use `specd changes transition` to `archivable` or `designing`). See [Change Lifecycle Guide](../guide/workflow.md#archiving).

If other active changes target the same specs, the archive is blocked by default. Use `--allow-overlap` to proceed despite the overlap.

If implementation sidecar maintenance would update `spec-lock.json` for specs outside the change scope, archive is also blocked by default. Use `--allow-out-of-scope` only when those extra sidecar updates are intentional.

Tracked implementation files must be resolved or ignored before archive succeeds.

| Option                      | Description                                                                  |
| --------------------------- | ---------------------------------------------------------------------------- |
| `--skip-hooks <phases>`     | Skip archive hook phases. Valid values: `pre`, `post`, `all`.                |
| `--allow-overlap`           | Permit archiving despite spec overlap with other active changes.             |
| `--allow-out-of-scope`      | Permit archive-time implementation sidecar updates outside the change scope. |
| `--format text\|json\|toon` | Output format.                                                               |
| `--config <path>`           | Config file path.                                                            |

### change run-hooks

```
specd changes run-hooks <name> <step> [options]
```

Execute the `run:` hooks defined for a lifecycle step outside of a transition. Useful for re-running hooks after a failure or for manual invocation.

`change run-hooks` shares the same live hook-progress presentation as
`change transition`:

- In `text` format, progress is visible while the hook is still running. The
  active hook shows its command, recent output, and liveness updates. Completed
  hooks remain visible instead of being overwritten by the next hook.
- In `json` and `toon`, all machine-readable output is emitted on `stdout` as a
  newline-delimited stream of structured records. Hook progress uses
  `stream: "hook-progress"`, and the final result is emitted as a terminal
  `stream: "run-hooks"` record with `event.type: "complete"`. `stderr` is
  reserved for text-mode progress and non-structured process diagnostics.
- On hook failure, the failed hook's full output is shown instead of only a
  short summary line.

| Option                      | Description                        |
| --------------------------- | ---------------------------------- |
| `--phase pre\|post`         | Which hook phase to run. Required. |
| `--only <hook-id>`          | Run only the hook with this ID.    |
| `--format text\|json\|toon` | Output format.                     |
| `--config <path>`           | Config file path.                  |

### change hook-instruction

```
specd changes hook-instruction <name> <step> [options]
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
specd changes artifact-instruction <name> [artifact-id] [options]
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

List all drafted changes as a table with columns: `NAME`, `STATE`, `DATE`, `BY`, and optionally `REASON`.

| Option                      | Description                                                          |
| --------------------------- | -------------------------------------------------------------------- |
| `--limit <n>`               | Maximum entries to return (default **100**; use `all` for no limit). |
| `--page <p>`                | 1-based page number (mutually exclusive with `--after-*`).           |
| `--after-key <key>`         | Exclusive keyset cursor sort key.                                    |
| `--after-id <id>`           | Tiebreak id when used with `--after-key`.                            |
| `--description`             | Include change description as a dim sub-row per entry.               |
| `--reason`                  | Include draft reason column / JSON field (opt-in).                   |
| `--format text\|json\|toon` | Output format. JSON/TOON return `{ items, meta }`.                   |
| `--config <path>`           | Config file path.                                                    |

Truncated text output includes `showing <count> of <total> (use --limit/--page)`.

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

List all discarded changes as a table with columns: `NAME`, `DATE`, `BY`, and optionally `REASON` and `SUPERSEDED`.

| Option                      | Description                                                          |
| --------------------------- | -------------------------------------------------------------------- |
| `--limit <n>`               | Maximum entries to return (default **100**; use `all` for no limit). |
| `--page <p>`                | 1-based page number (mutually exclusive with `--after-*`).           |
| `--after-key <key>`         | Exclusive keyset cursor sort key.                                    |
| `--after-id <id>`           | Tiebreak id when used with `--after-key`.                            |
| `--description`             | Include change description as a dim sub-row per entry.               |
| `--reason`                  | Include discard reason column / JSON field (opt-in).                 |
| `--superseded-by`           | Include superseded-by target column / JSON field.                    |
| `--format text\|json\|toon` | Output format. JSON/TOON return `{ items, meta }`.                   |
| `--config <path>`           | Config file path.                                                    |

Truncated text output includes `showing <count> of <total> (use --limit/--page)`.

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
specd archives list [options]
```

List archived changes as a table with columns: `NAME`, `DATE`, and optionally `BY`.

| Option                      | Description                                                            |
| --------------------------- | ---------------------------------------------------------------------- |
| `--limit <n>`               | Maximum entries to return (default **100**; use `all` for no limit).   |
| `--page <p>`                | 1-based page number (mutually exclusive with `--after-*`).             |
| `--after-key <key>`         | Exclusive keyset cursor for pagination (replaces legacy `--start-at`). |
| `--after-id <id>`           | Tiebreak id when used with `--after-key`.                              |
| `--archived-by`             | Include `archivedBy` column / JSON field (opt-in).                     |
| `--format text\|json\|toon` | Output format. JSON/TOON return `{ items, meta }`.                     |
| `--config <path>`           | Config file path.                                                      |

Truncated text output includes `showing <count> of <total> (use --limit/--page)`.

### archive show

```
specd archives show <name> [options]
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
specd specs list [options]
```

List all specs known to the project, grouped by workspace.

| Option                      | Description                                                                      |
| --------------------------- | -------------------------------------------------------------------------------- |
| `--limit <n>`               | Maximum entries per workspace (optional; use `all` for no limit).                |
| `--page <p>`                | 1-based page number (mutually exclusive with `--after-key`).                     |
| `--after-key <key>`         | Exclusive keyset cursor sort key (`--after-id` is not supported for spec lists). |
| `--summary`                 | Include a short description (`SUMMARY` column) for each spec.                    |
| `--workspace <name>`        | Filter by workspace name. Repeatable: `--workspace alpha --workspace beta`.      |
| `--format text\|json\|toon` | Output format. JSON/TOON return `{ workspaces: [{ name, specs, meta }] }`.       |
| `--config <path>`           | Config file path.                                                                |

Per-workspace truncated text output includes `showing <count> of <total> (use --limit/--page)`.

### spec search

```
specd specs search <query> [options]
```

Search spec content across workspaces. Uses the code graph index when available for fast full-text search; falls back to filesystem search with a warning on stderr.

| Option                      | Description                                     |
| --------------------------- | ----------------------------------------------- |
| `--workspace <name>`        | Filter by workspace name. Repeatable.           |
| `--graph`                   | Require code graph index; error if unavailable. |
| `--summary`                 | Include a short description for each result.    |
| `--limit <n>`               | Maximum results (default: 20).                  |
| `--format text\|json\|toon` | Output format.                                  |
| `--config <path>`           | Config file path.                               |

Examples:

```bash
specd specs search "authentication"
specd specs search "login" --workspace alpha
specd specs search "payment" --graph --format json
```

### spec show

```
specd specs show <specPath> [options]
```

Show the full contents of all artifacts in a spec directory. `<specPath>` is the spec identifier (e.g. `auth/login` or `billing:payments/invoicing`).

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

### spec outline

```
specd specs outline <specPath> [options]
```

Display the navigable structure (outline) of a spec artifact. Returns a hierarchical tree of sections, headings, or keys without reading the full file content. Useful for quick discovery of what a spec contains.

`<specPath>` is the spec identifier (e.g. `auth/login` or `core:core/config`).

| Option                      | Description                                                                       |
| --------------------------- | --------------------------------------------------------------------------------- |
| `--artifact <id>`           | Resolve the artifact filename from the active schema (e.g. `specs`, `verify`).    |
| `--file <name>`             | Specify a direct filename within the spec directory.                              |
| `--full`                    | Include all selector-addressable node families for the artifact format.           |
| `--hints`                   | Include root-level `selectorHints` placeholders keyed by returned node type.      |
| `--format text\|json\|toon` | Output format. Text and json both render JSON; toon uses token-oriented notation. |
| `--config <path>`           | Config file path.                                                                 |

Default output is intentionally compact and parser-defined:

- markdown: `section`
- json: `property`, `array-item`
- yaml: `pair`
- plaintext: `paragraph`

Use `--full` when you need exhaustive selector-addressable coverage.
Use `--hints` when you need placeholder selector guidance (`"<value>"`, `"<contains>"`, `"<level>"`).

Examples:

```bash
# Outline the default spec.md
specd specs outline core:core/config

# Outline verify.md via artifact ID
specd specs outline core:core/config --artifact verify

# Outline a specific file in toon format
specd specs outline core:core/config --file verify.md --format toon
```

### spec context

```
specd specs context <specPath> [options]
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
| `--optimized`               | Force prefer optimized content (when available and fresh).         |
| `--no-optimized`            | Suppress preference for optimized content; show raw sections.      |
| `--format text\|json\|toon` | Output format.                                                     |
| `--config <path>`           | Config file path.                                                  |

### spec metadata

```
specd specs metadata <specPath> [options]
```

Show materialized metadata for a spec: title, dependency links, rules, and diagnostics. Self-heals the `.specd/metadata/` cache on read when the projection is stale.

Text output includes `source` (`persisted` or `generated`) and `regenerated` when the cache was rebuilt.

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

See [spec metadata](spec-metadata.md).

### spec init

```
specd specs init <specPath> | --all [options]
```

Initialize persisted semantic state (`spec-lock.json`) for one spec or every lock-less spec.

| Option               | Description                                    |
| -------------------- | ---------------------------------------------- |
| `--all`              | Initialize all specs without persisted state.  |
| `--workspace <name>` | Restrict `--all` to named workspaces.          |
| `--schema <ref>`     | Schema reference to record (default: project). |

See [spec init](spec-init.md).

### spec schema

```
specd specs schema get <specPath>
specd specs schema set <specPath> --schema <ref>
```

Read or update the persisted schema identity for an initialized spec.

See [spec schema](spec-schema.md).

### spec deps

```
specd specs deps list <specPath>
specd specs deps add|remove|set|clear <specPath> [options]
```

Manage persisted `dependsOn` links in `spec-lock.json`.

See [spec deps](spec-deps.md).

### spec implementation

```
specd specs implementation list <specPath>
specd specs implementation add|remove <specPath> [options]
```

Manage persisted implementation tracking links.

See [spec implementation](spec-implementation.md).

### spec optimizations

```
specd specs optimizations get <specPath>
specd specs optimizations set|clear <specPath> [options]
```

Manage persisted LLM optimization baselines. Reports per-field freshness on `get`.

See [spec optimizations](spec-optimizations.md).

### spec resolve-path

```
specd specs resolve-path <path> [options]
```

Resolve a filesystem path to a SpecD spec identifier. Useful when working in a spec directory and needing the canonical identifier to pass to other commands.

```bash
specd specs resolve-path specs/auth/login/spec.md
# → auth/login
```

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

### spec validate

```
specd specs validate [specPath] [options]
```

Validate the artifact files for a spec against the active schema's validation rules. When `<specPath>` is given, validates that spec only. When `--all` is given, validates every spec in the project.

| Option                      | Description                                |
| --------------------------- | ------------------------------------------ |
| `--all`                     | Validate all specs in the project.         |
| `--workspace <name>`        | Validate all specs in the named workspace. |
| `--format text\|json\|toon` | Output format.                             |
| `--config <path>`           | Config file path.                          |

### spec generate-metadata

```
specd specs generate-metadata [specPath] [--all] [options]
```

Force-regenerate metadata projections for one spec or every spec (`--all`). Cache-write failures are command failures.

| Option                      | Description                           |
| --------------------------- | ------------------------------------- |
| `--all`                     | Regenerate every spec in the project. |
| `--workspace <name>`        | Restrict `--all` to named workspaces. |
| `--format text\|json\|toon` | Output format.                        |
| `--config <path>`           | Config file path.                     |

See [spec generate-metadata](spec-generate-metadata.md).

Removed commands: `specs write-metadata`, `specs update-metadata`, and `specs invalidate-metadata`.

---

## storage

Commands for maintaining derived filesystem list indexes. List indexes are stored under `{configPath}/tmp/fs-cache/` (for example `changes/`, `drafts/`, `discarded/`, `specs/<workspace>/`, `validate-specs/<workspace>/`, and `archive/`). The `{configPath}/tmp/` directory is gitignored via `tmp/.gitignore` (`*` with `!.gitignore`).

The `validate-specs/<workspace>/` buckets are adapter-owned runtime caches used internally by `ValidateSpecs`. They are not exposed through CLI or MCP commands.

### storage reindex

```
specd storage reindex [options]
```

Rebuild filesystem list indexes by delegating to repository `reindex()` methods. The CLI does not read or write cache files directly.

| Option                      | Description                                                                      |
| --------------------------- | -------------------------------------------------------------------------------- |
| `--changes`                 | Rebuild active, draft, and discarded change indexes.                             |
| `--specs`                   | Rebuild spec indexes for every configured workspace.                             |
| `--archive`                 | Rebuild the archive list index.                                                  |
| `--format text\|json\|toon` | Output format. JSON/TOON return `{ reindexed: { changes?, specs?, archive? } }`. |
| `--config <path>`           | Config file path.                                                                |

When no resource flags are given, all indexes are rebuilt. Flags are combinable — for example `--changes --specs` rebuilds change and spec indexes but not archive.

Text output lists each rebuilt target on its own line (`reindexed changes`, `reindexed specs (<workspace>)`, `reindexed archive`).

---

## project

Project-level management commands.

### project init

```
specd project init [options]
```

Initialize a new SpecD project in the current directory. When run in a TTY, launches an interactive wizard that prompts for schema, workspace configuration, and agent plugins. When run non-interactively (piped or in CI), all configuration must be supplied via flags.

`project init` creates `specd.yaml`, adds the default storage directories to `.gitignore`, and installs skills for any declared agent plugins.

| Option                      | Description                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--schema <ref>`            | Schema reference to use (e.g. `@specd/schema-std`).                                                                                                                                              |
| `--workspace <name>`        | Workspace name. Defaults to `default`.                                                                                                                                                           |
| `--workspace-path <path>`   | Path to the specs directory for the workspace.                                                                                                                                                   |
| `--plugin <name>`           | Install skills for this agent plugin. Repeatable. Valid values include `@specd/plugin-agent-claude`, `@specd/plugin-agent-copilot`, `@specd/plugin-agent-codex`, `@specd/plugin-agent-opencode`. |
| `--force`                   | Overwrite existing `specd.yaml` if present.                                                                                                                                                      |
| `--format text\|json\|toon` | Output format.                                                                                                                                                                                   |

```bash
# Non-interactive init with Claude integration
specd project init --schema @specd/schema-std --plugin @specd/plugin-agent-claude
```

### project context

```
specd project context [options]
```

Compile the project-level context block. This is the context an agent receives when asked about the project as a whole, rather than a specific change or spec.

Rendering mode is controlled by `contextMode` in `specd.yaml` (`list`, `summary`, `full`, `hybrid`; default `summary`). `hybrid` behaves as `full` for this command. When non-full catalogue specs are present, the command prints guidance to use `specd specs context <specId>` to load full context for any listed spec. It never suggests `spec-preview` (project context has no change scope).

| Option                      | Description                                                    |
| --------------------------- | -------------------------------------------------------------- |
| `--rules`                   | Include rules from project-level specs (full-mode only).       |
| `--constraints`             | Include constraints from project-level specs (full-mode only). |
| `--scenarios`               | Include scenarios from project-level specs (full-mode only).   |
| `--follow-deps`             | Follow `dependsOn` links and include transitive specs.         |
| `--depth <n>`               | Maximum depth for dependency traversal.                        |
| `--optimized`               | Force prefer optimized context (when available and fresh).     |
| `--no-optimized`            | Suppress preference for optimized context; show raw contents.  |
| `--format text\|json\|toon` | Output format.                                                 |
| `--config <path>`           | Config file path.                                              |

### project update

````
specd project update [options]
### project update

Update installed agent skills after upgrading SpecD. Reads the `plugins` list from `specd.yaml` and reinstalls skill files for each declared agent.

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

### project update-metadata

Update project-level metadata with LLM-optimized context and input hashes.

| Option                      | Description                                    |
| --------------------------- | ---------------------------------------------- |
| `--input <file>`            | Read metadata from this file instead of stdin. |
| `--format text\|json\|toon` | Output format.                                 |
| `--config <path>`           | Config file path.                              |

### project metadata

Display the full contents of the `project-metadata.json` file.

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

### project dashboard

```text
specd project dashboard [options]
````

Display a project-level dashboard showing schema, workspaces, spec counts, change activity (including archived changes), specs health aggregates in the Specs header, active-change task progress in the Changes box, and Code Graph diagnostics. Also runs automatically when `specd` is invoked with no subcommand and a config is present (see [Invocation](#invocation)). In `json` or `toon` mode, execution delegates directly to `specd project status --format <fmt>`.

| Option                      | Description                                                    |
| --------------------------- | -------------------------------------------------------------- |
| `--format text\|json\|toon` | Output format. `json` and `toon` delegate to `project status`. |
| `--config <path>`           | Config file path.                                              |

### project status

```text
specd project status [options]
```

Display consolidated project state including workspaces, spec counts, change counts, graph freshness, and config flags. Designed for programmatic consumption by agents and scripts — replaces multiple calls to `config show`, `specs list`, `changes list`, `graph stats`, and `project context`.

By default, the output includes:

- Project root path and schema reference
- Workspaces with name, prefix, and ownership
- Spec counts (total and per-workspace)
- Change counts (active, drafts, discarded, archived)
- Active and draft change listings with per-change task progress (`incomplete/total`)
- Specs health aggregates (text: `ok` / `failed` / `warning` labels; json/toon: `passed` / `failed` / `warned` and issue list)
- Graph freshness (stale boolean, last indexed timestamp) — always included
- Approval gates (spec enabled, signoff enabled)
- Config flags (llmOptimizedContext)

| Option                      | Description                                                        |
| --------------------------- | ------------------------------------------------------------------ |
| `--context`                 | Include project context references (instructions, files, specs).   |
| `--graph`                   | Include extended graph statistics (file count, symbol count, etc). |
| `--format text\|json\|toon` | Output format.                                                     |
| `--config <path>`           | Config file path.                                                  |

```bash
# Consolidated project state for agents
specd project status --format json

# Include graph stats and context references
specd project status --graph --context --format json
```

---

## graph

Index and query the code graph for the workspace.

### graph index

```
specd graph index [options]
```

Indexes project graph inputs into the code graph. When a `specd.yaml` is supplied with `--config` or discovered automatically, indexing always uses all configured workspaces plus any configured project-global graph include paths. When no config is available, or when `--path` is provided, the command enters bootstrap mode and indexes a synthetic `default` workspace rooted at the repository root. Bootstrap mode is intended for initial graph bootstrapping, not normal configured project operation.

Indexing is also the recovery path for incompatible derived storage. Ordinary graph
reads do not migrate or repair a schema, derivation fingerprint, or storage generation.
`graph index` can repair incompatible derived data, rotates the generation during that
closed-store repair, re-extracts all source facts, and reports `fullRebuildReason` in
structured output (and `full rebuild: <reason>` in text). `--force` is an explicit
logical full rebuild: healthy runs reprocess every selected input without physically
recreating SQLite. If the first open reports the typed recoverable storage condition,
the isolated SDK task closes that transient provider, recreates closed storage, and
retries once. Non-forced indexes and unrelated failures never delete storage. No change
manifest, spec, or implementation link is modified by this recovery.

Text output includes a coverage total, counts for `indexed`, `excluded`, `unsupported`,
`parse-failed`, and `partial`, followed by any stable coverage reasons and per-link
diagnostics. JSON and TOON preserve the same `coverage` and `coverageDiagnostics` fields
from SDK orchestration. A forced result must show `fullRebuild: true` and must not classify
hash-matched selected inputs as skipped; inspect the returned classifications rather than
using a successful exit code as proof that every input became a graph node.
Completed results also include counts and elapsed milliseconds for import resolution,
dependency facts, adapter relations, re-exports, hierarchy/overrides, persistence,
and search-index rebuilding in text and structured output.

Code Graph owns the shared writer lock and the process-isolated worker used for every
production index run. The CLI supplies its trusted packaged task through the SDK and
renders only the returned progress, result, and typed failure. During an active run,
Code Graph forwards `SIGINT` or `SIGTERM` to that run's child, waits for cleanup, and
returns a typed failure without terminating or re-signalling the CLI host. There is no
public in-process indexing mode.

| Option                      | Description                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| `--force`                   | Logically rebuild every selected graph input; typed incompatible storage may be repaired once. |
| `--config <path>`           | Config file path. Mutually exclusive with `--path`.                                            |
| `--path <path>`             | Repository root bootstrap path. Ignores any discovered config.                                 |
| `--exclude-path <pattern>`  | Gitignore-syntax pattern to exclude (repeatable; merges with config).                          |
| `--format text\|json\|toon` | Output format.                                                                                 |

#### Config fields: `graph.includePaths`, `graph.excludePaths`, `graph.respectGitignore`, and `workspace.graph.allowedPaths`

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
      allowedPaths: # optional; gitignore-syntax include surface relative to codeRoot
        - src/**
        - package.json
graph:
  includePaths: # optional; gitignore-syntax paths relative to projectRoot, indexed as root:...
    - docs/**
    - pnpm-workspace.yaml
  excludePaths: # optional; global gitignore-syntax exclusions for file/document discovery
    - specd-sdd/
    - specs/
```

**`graph.excludePaths`** — global exclusions for file/document discovery. When set in config, they replace the built-in defaults; CLI `--exclude-path` flags are appended on top. Patterns follow gitignore syntax and support `!` negation. The built-in defaults are:

```
node_modules/   .git/   .specd/   dist/   build/   coverage/   .next/   .nuxt/
```

**`graph.respectGitignore`** — when `true` (default), `.gitignore` rules are loaded hierarchically and applied with **absolute priority**: no `excludePaths` negation can re-include a file that `.gitignore` excludes. When `false`, `.gitignore` files are not loaded.

**`workspace.graph.allowedPaths`** — when set, only matching paths inside that workspace `codeRoot` are graph-visible. Matching paths still flow through the normal classifier: parser-recognized files become `File`/`Symbol` nodes, parser misses with textual content become `Document` nodes, and binary files are skipped.

**`graph.includePaths`** — optional project-global graph inputs rooted at `projectRoot`. Matching files are indexed under the reserved `root:` namespace only when they are outside every configured workspace `codeRoot`. Parser-recognized files become `root:` code files; textual parser misses become `Document` nodes.

Filesystem-backed spec roots are excluded automatically from file/document discovery, so `spec.md`, `verify.md`, and similar spec artifacts are indexed only as specs, not again as `Document` nodes. `root` is a reserved namespace and cannot be used as a workspace name.

#### `--exclude-path` merging

CLI `--exclude-path` flags merge (append) on top of the effective exclusion list — either `graph.excludePaths` from config or the built-in defaults when config is absent. They never reduce the exclusion set. This flag may be repeated:

```
specd graph index --exclude-path "packages/generated/*" --exclude-path "tmp/"
```

#### Shared indexing lock

Code Graph manages a shared writer lock for `graph index`; the CLI does not acquire,
inspect, or release it.

- while this lock is held, provider-backed read commands such as `graph search`, `graph hotspots`, `graph stats`, and `graph impact` may fail with `GRAPH_BUSY`
- long-lived hosts may also surface `GRAPH_PROVIDER_STALE` if the backing storage generation changes after they opened a provider
- the user-facing busy message remains: `The code graph is currently being indexed. Try again in a few seconds.`
- the lock is released after normal completion and after every terminal failure,
  including a forwarded termination signal

---

### graph search

```
specd graph search <query> [options]
```

Search symbols, indexed source files, specs, or documents through one Code
Graph-owned query plan. Context resolution follows the same configured-vs-bootstrap
rules as `graph index`.

If a graph index is currently running, this command may return `GRAPH_BUSY` with the message: `The code graph is currently being indexed. Try again in a few seconds.`

| Option                       | Description                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `--symbols`                  | Search only symbols.                                                            |
| `--files`                    | Search only indexed source-file content.                                        |
| `--specs`                    | Search only specs.                                                              |
| `--documents`                | Search only documents.                                                          |
| `--snippet`                  | Include snippet previews. Without it, output stays compact and location-first.  |
| `--kind <list>`              | Filter symbol results by comma-separated kinds, for example `class,method`.     |
| `--config <path>`            | Config file path. Mutually exclusive with `--path`.                             |
| `--path <path>`              | Repository root bootstrap path. Ignores any discovered config.                  |
| `--file <path>`              | Restrict selected categories to paths matching the wildcard pattern.            |
| `--workspace <name>`         | Restrict results to the named workspace.                                        |
| `--exclude-path <pattern>`   | Exclude symbols/specs whose file path matches the wildcard pattern. Repeatable. |
| `--exclude-workspace <name>` | Exclude results from the named workspace. Repeatable.                           |
| `--limit <n>`                | Maximum number of results per category (default: 10).                           |
| `--spec-content`             | Include full spec content in `json` or `toon` output.                           |
| `--format text\|json\|toon`  | Output format.                                                                  |

With no category flag, the command requests symbols, files, specs, and documents in
one provider call. Category flags narrow that request. `--files` selects source
content; it is intentionally different from `--file`, which is a path filter and
never enables a category.

Code Graph owns expansion, candidate paging, exact-first semantic ranking, grouping,
deduplication, declaration-name suppression, and post-suppression limit refill. The
CLI renders the returned category order and does not merge independent searches.

By default, text output shows a compact identity block plus location metadata:

- symbols show `declaration: path:line:column`; a directly matched public route is
  shown first as `matched export: path::name`
- files show one path block with ordered source matches
- specs show `match @ L<start>-L<end>`
- documents show `match @ L<start>-L<end>`

Each file match includes the original matched text and a zero-based, half-open
`range` (`start` inclusive, `end` exclusive). When `--snippet` is requested, its
optional `snippetRange` is separate from the exact occurrence range. If the same
range is found through multiple query terms, only the strongest provenance is kept:
`full-query`, then `raw-token`, then `expanded-token`. Only an occurrence overlapping
the returned symbol's selection/name range is suppressed; calls, strings, comments,
and matches elsewhere in the declaration body remain visible.

General and wildcard source searches retain at most ten occurrences per file after
symbol suppression and append `<n> more matches in this file`. Structured output
keeps `totalMatches` and `omittedMatches`. An exact `--file` selector accepts canonical,
config-relative, or absolute paths and returns every occurrence in that one file;
wildcard selectors remain capped.

Pass `--snippet` when you want preview text. In `json` and `toon`, the `snippet` field
is omitted unless `--snippet` is passed. `--spec-content` remains independent and only
controls whether full spec content is included in structured output.

Exact case-sensitive identity matches are ranked ahead of normalized, prefix,
component, and content matches:

- spec search boosts exact `specId` matches such as `core:change`
- symbol search boosts exact structured declaration and exported names; serialized
  canonical ids remain in JSON/TOON but are omitted from text
- document search boosts exact canonical paths and exact project-relative paths

Symbol results are reference-aware: structured logical identity fields, member names,
and public/local bindings are searchable. Declaration occurrences are grouped by
logical target while distinct public routes and their ordered provenance remain
visible in structured output. `--kind` continues to filter the existing syntax-level
symbol kinds; it does not replace symbol-space or member-form semantics.

Search is discovery, not resolution. A unique same-name hit does not prove a reference
without an exact declaration, binding, or deterministic hierarchy path.

Text output renders file-bearing results using paths relative to `projectRoot`.

#### Examples

Search for references to "SpecRepository" (symbols only, including snippets):

```
specd graph search "SpecRepository" --symbols --snippet
```

Search indexed source content under one path:

```
specd graph search "implementation review" --files --file "packages/sdk/**" --snippet
```

The equivalent JSON/TOON result keeps the same category and occurrence fields:

```json
{
  "files": [
    {
      "path": "sdk:src/review.ts",
      "matches": [
        {
          "text": "implementation review",
          "range": { "start": { "line": 8, "column": 3 }, "end": { "line": 8, "column": 24 } },
          "provenance": "full-query"
        }
      ]
    }
  ]
}
```

Use `--format toon` for the same structure in compact TOON form; coordinates and
half-open range meaning do not change.

Search for "archive" across specs:

```
specd graph search "archive" --specs
```

---

### graph hotspots

```
specd graph hotspots [options]
```

List the most connected symbols in the graph ranked by coupling risk. Context resolution follows the same configured-vs-bootstrap rules as `graph index`.

If a graph index is currently running, this command may return `GRAPH_BUSY` with the message: `The code graph is currently being indexed. Try again in a few seconds.`

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

By default, `graph hotspots` shows only `class`, `method`, and `function` symbols, applies `min-score=1`, `min-risk=MEDIUM`, and `limit=20`, and excludes importer-only symbols that have no direct callers.

`--kind` accepts a single comma-separated list and validates every token against the supported symbol kinds. Invalid values fail the command before querying the graph. When you pass `--kind`, that list fully replaces the default kind set instead of merging with it.

Overriding `--min-risk`, `--limit`, or `--min-score` does not disable the other defaults. Use `--include-importer-only` when you explicitly want importer-only symbols to appear.

#### Examples

List top 10 hotspots with HIGH or CRITICAL risk:

```
specd graph hotspots --limit 10 --min-risk HIGH
```

List class or method hotspots inside the `core` workspace:

```
specd graph hotspots --kind class,method --workspace core
```

---

### graph stats

```
specd graph stats [options]
```

Print summary statistics and health for the current code graph. Text output includes
files, documents, symbols, specs, relation counts, the last indexed timestamp, and
actionable aggregate and non-current workspace diagnostics. JSON/TOON keeps every
workspace scope, freshness mode (`vcs`, `filesystem`, or `hybrid`), monotonic latch,
reason, VCS visibility, derivation fingerprint, schema/generation, and index coverage
dimension separate. A current VCS ref alone does not prove current indexed content.
Text output includes persisted coverage counts for indexed, excluded, unsupported,
parse-failed, and partial inputs; structured output preserves the same summary.

VCS workspaces assess normalized graph-visible staged, unstaged, untracked, deleted,
and renamed paths once per repository. Non-VCS workspaces compare persisted
observations with filesystem membership, using mtime/size as a fast path and hashes
only when needed. Hybrid mode also observes configured graph inputs hidden by VCS
ignore rules. Excluded-only changes remain current; mixed visible and excluded
changes report only the visible reasons. Unknown transient reads are retryable and
are never persisted as stale.

For a non-VCS workspace, additions, edits, deletions, and membership changes come from
the filesystem observation set. Run `specd graph index` after an intentional visible
change to clear the monotonic stale latch. Excluded-only changes require no recovery.

When schema or derivation health is incompatible, run `specd graph index`; indexing
owns the full-rebuild repair path. Excluded, unsupported, partial, and parse-failed
coverage are diagnostics rather than proof that a missing symbol is stale. Context
resolution follows the same configured-vs-bootstrap rules as `graph index`.

If a graph index is currently running, this command may return `GRAPH_BUSY` with the message: `The code graph is currently being indexed. Try again in a few seconds.`

| Option                      | Description                                                    |
| --------------------------- | -------------------------------------------------------------- |
| `--config <path>`           | Config file path. Mutually exclusive with `--path`.            |
| `--path <path>`             | Repository root bootstrap path. Ignores any discovered config. |
| `--format text\|json\|toon` | Output format.                                                 |

#### Examples

Print graph stats in TOON format:

```
specd graph stats --format toon
```

---

### graph impact

```
specd graph impact [options]
```

Analyze dependents or dependencies of a spec, a logical symbol, one or more files, or
one exact public export. Context resolution follows the same configured-vs-bootstrap
rules as `graph index`.

If a graph index is currently running, this command may return `GRAPH_BUSY` with the message: `The code graph is currently being indexed. Try again in a few seconds.`

File selectors accept three forms:

- **Config-relative path**: `packages/core/src/model.ts`
- **Workspace-prefixed canonical path**: `core:src/model.ts`
- **Absolute path**: `/abs/path/to/packages/core/model.ts`

Symbol selectors accept progressively more specific forms:

- bare name: `invalidate`
- file-qualified canonical selector: `core:src/domain/entities/change.ts:invalidate`
- kind-qualified selector: `core:src/domain/entities/change.ts:method:invalidate`
- full symbol id: `core:src/domain/entities/change.ts:method:invalidate:697:2`
- project-relative and absolute file path variants for the same forms

Multiple `--file` flags aggregate impact across all specified files.

File impact also returns `coveringSpecs`. Text groups specs whose minimum evidence
depth is zero as direct coverage and the remainder as blast-radius coverage. A spec
with both kinds appears once in the direct group. JSON and TOON retain its minimum
depth and every ordered, deduplicated file/symbol evidence item, including file-only
`COVERS_FILE` evidence when no covered symbol exists. This projection comes from the
provider; the CLI issues no independent coverage queries.

Public export selectors use both parts of the public-binding identity:

```bash
specd graph impact --export <public-name> --from <file-or-public-surface>
```

`--export` and `--from` must be supplied together and are mutually exclusive with
`--spec`, `--symbol`, and `--file`. The result keeps two views:

- `bindingImpact`: consumers proven to use that exact public surface/name route
- `canonicalImpact`: consumers of the resolved logical implementation through every
  proven route

It also includes the selected `binding`, canonical `target`, and ordered resolution
`path`. A `--symbol` query resolves and traverses the canonical logical target, so
overloads or declaration occurrences do not fragment the result. Ambiguity is
surfaced with at most ten deterministic candidates and the complete candidate count;
traversal does not run. Bare names first require an exact case-sensitive declaration
name, fall back to case-insensitive exact lookup only when none exists, and never
widen prefixes or partial search hits into impact targets.

| Option                                                             | Description                                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `--spec <id>`                                                      | Spec ID to analyze.                                                                   |
| `--symbol <name>`                                                  | Symbol selector to analyze. Supports bare names, qualified selectors, and full ids.   |
| `--file <path...>`                                                 | One or more file paths to analyze (config-relative, workspace-prefixed, or absolute). |
| `--export <name>`                                                  | Exact public export name; requires `--from`.                                          |
| `--from <surface>`                                                 | File or public surface containing `--export`.                                         |
| `--direction dependents\|dependencies\|upstream\|downstream\|both` | Impact direction (default: `dependents`).                                             |
| `--depth <n>`                                                      | Maximum traversal depth (default: `3`).                                               |
| `--config <path>`                                                  | Config file path. Mutually exclusive with `--path`.                                   |
| `--path <path>`                                                    | Repository root bootstrap path. Ignores any discovered config.                        |
| `--format text\|json\|toon`                                        | Output format.                                                                        |

`dependents` is the preferred name for blast-radius analysis: it reports code that
depends on the target. `dependencies` reports code the target depends on. The legacy
values `upstream` and `downstream` remain accepted aliases for compatibility.

Text output renders file paths relative to `projectRoot`.

Examples:

```bash
specd graph impact --spec core:change --direction dependents
specd graph impact --symbol "mergeSpecs" --direction both
specd graph impact --symbol "packages/core/src/domain/entities/change.ts:method:invalidate" --direction dependents
specd graph impact --file packages/core/src/model.ts --direction dependents
specd graph impact --export createKernel --from packages/core/src/public.ts --direction dependents
```

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

## Common workflows

### Start a new change

```bash
# Create the change
specd changes create add-payment-export --spec billing/payments --description "Add CSV export for invoices"

# Check what artifacts are needed
specd changes artifacts add-payment-export

# Once artifacts are produced, check status and available transitions
specd changes status add-payment-export

# Transition into implementation
specd changes transition add-payment-export implementing
```

### Pause and resume work

```bash
# Shelve to drafts
specd changes draft add-payment-export --reason "Blocked pending design review"

# Later, restore it
specd drafts restore add-payment-export
```

### Archive a completed change

```bash
# Confirm the change is in archivable state
specd changes status add-payment-export

# Archive — syncs spec artifacts and moves to archive directory
specd changes archive add-payment-export
```

### Inspect and validate a spec

```bash
# Validate all artifacts in a spec
specd specs validate auth/login

# See compiled context for a spec (useful for debugging what an agent receives)
specd specs context auth/login --rules --constraints --scenarios
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
